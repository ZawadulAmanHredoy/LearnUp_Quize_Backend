const store = require('../utils/store');
const { ROOMS, broadcast } = require('./broadcast');
const { isCurrentSession } = require('./sessions');

// In-Memory Fast Mutex for sub-millisecond atomic arbitration
let isBuzzerActive = false;
let buzzerWinner = null;

function getBuzzerStatus() {
  return {
    isOpen: isBuzzerActive,
    winner: buzzerWinner
  };
}

/**
 * Restore the mutex after a server restart from the persisted EventState
 */
function hydrateBuzzer(state) {
  const sub = state?.questionSubState || {};
  buzzerWinner = sub.buzzerLockedBy?.teamId ? sub.buzzerLockedBy : null;
  isBuzzerActive = Boolean(sub.isBuzzerOpen) && !buzzerWinner;
}

function openBuzzer(io) {
  isBuzzerActive = true;
  buzzerWinner = null;

  store.updateEventState({
    questionSubState: {
      isBuzzerOpen: true,
      buzzerLockedBy: null,
      isCountdownActive: false
    }
  });

  io.to(ROOMS.teams).emit('buzzer:status', { isOpen: true });
  broadcast(io, 'buzzer:unlocked', { timestamp: Date.now() });
}

function closeBuzzer(io) {
  isBuzzerActive = false;
  store.updateEventState({ questionSubState: { isBuzzerOpen: false } });
  io.to(ROOMS.teams).emit('buzzer:status', { isOpen: false });
}

function resetBuzzer(io) {
  isBuzzerActive = false;
  buzzerWinner = null;

  store.updateEventState({
    questionSubState: {
      isBuzzerOpen: false,
      buzzerLockedBy: null
    }
  });

  io.to(ROOMS.teams).emit('buzzer:status', { isOpen: false });
  broadcast(io, 'buzzer:reset', {});
}

function handleTeamBuzz(socket, io) {
  const team = socket.data.team;

  // Only an authenticated phone on the team's current session may buzz
  if (socket.data.role !== 'team' || !team || !isCurrentSession(team.teamId, team.sessionToken)) {
    socket.emit('buzzer:rejected', { reason: 'NOT_AUTHENTICATED' });
    return;
  }

  // Synchronous atomic check in the single-threaded Node.js event loop
  if (!isBuzzerActive || buzzerWinner !== null) {
    socket.emit('buzzer:rejected', {
      reason: 'BUZZER_CLOSED',
      winner: buzzerWinner ? buzzerWinner.teamName : null
    });
    return;
  }

  // First arrival claims the lock. Identity comes from the verified
  // socket session, never from the client payload.
  isBuzzerActive = false;
  buzzerWinner = {
    teamId: team.teamId,
    teamName: team.teamName,
    teamNumber: team.teamNumber,
    timestamp: Date.now()
  };

  // Immediately lock out all other teams
  io.to(ROOMS.teams).emit('buzzer:status', { isOpen: false });

  // Broadcast winner to all screens (Projector, Admin, Teams)
  broadcast(io, 'buzzer:winner', buzzerWinner);

  // Notify the winning socket specifically
  socket.emit('buzzer:confirmed', { isWinner: true, timestamp: buzzerWinner.timestamp });

  // Persist to EventState
  store.updateEventState({
    questionSubState: {
      isBuzzerOpen: false,
      buzzerLockedBy: buzzerWinner
    }
  });
}

function registerBuzzerHandlers(socket, io, { onAdmin }) {
  socket.on('team:buzz', () => {
    handleTeamBuzz(socket, io);
  });

  onAdmin('admin:open-buzzer', () => openBuzzer(io));
  onAdmin('admin:close-buzzer', () => closeBuzzer(io));
  onAdmin('admin:reset-buzzer', () => resetBuzzer(io));
}

module.exports = {
  getBuzzerStatus,
  hydrateBuzzer,
  openBuzzer,
  closeBuzzer,
  resetBuzzer,
  handleTeamBuzz,
  registerBuzzerHandlers
};
