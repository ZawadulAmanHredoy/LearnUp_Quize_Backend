const store = require('../utils/store');

// In-Memory Fast Mutex for sub-millisecond atomic arbitration
let isBuzzerActive = false;
let buzzerWinner = null;

function getBuzzerStatus() {
  return {
    isOpen: isBuzzerActive,
    winner: buzzerWinner
  };
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

  io.to('room:teams').emit('buzzer:status', { isOpen: true });
  io.emit('buzzer:unlocked', { timestamp: Date.now() });
}

function closeBuzzer(io) {
  isBuzzerActive = false;
  io.to('room:teams').emit('buzzer:status', { isOpen: false });
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

  io.to('room:teams').emit('buzzer:status', { isOpen: false });
  io.emit('buzzer:reset');
}

function handleTeamBuzz(socket, data, io) {
  // Synchronous atomic check in the single-threaded Node.js event loop
  if (!isBuzzerActive || buzzerWinner !== null) {
    socket.emit('buzzer:rejected', {
      reason: 'BUZZER_CLOSED',
      winner: buzzerWinner ? buzzerWinner.teamName : null
    });
    return;
  }

  // First arrival claims the lock
  isBuzzerActive = false;
  buzzerWinner = {
    teamId: data.teamId,
    teamName: data.teamName,
    teamNumber: data.teamNumber,
    timestamp: Date.now()
  };

  // Immediately lock out all other teams
  io.to('room:teams').emit('buzzer:status', { isOpen: false });

  // Broadcast winner to all screens (Projector, Admin, Teams)
  io.emit('buzzer:winner', buzzerWinner);
  io.emit('buzzer:won', buzzerWinner);

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

function registerBuzzerHandlers(socket, io) {
  socket.on('team:buzz', (data) => {
    handleTeamBuzz(socket, data, io);
  });

  socket.on('admin:open-buzzer', () => {
    openBuzzer(io);
  });

  socket.on('admin:close-buzzer', () => {
    closeBuzzer(io);
  });

  socket.on('admin:reset-buzzer', () => {
    resetBuzzer(io);
  });
}

module.exports = {
  getBuzzerStatus,
  openBuzzer,
  closeBuzzer,
  resetBuzzer,
  handleTeamBuzz,
  registerBuzzerHandlers
};
