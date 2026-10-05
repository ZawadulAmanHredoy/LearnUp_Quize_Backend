const store = require('../utils/store');

let rapidFireInterval = null;
let currentRapidFireState = {
  isActive: false,
  teamId: null,
  timerSecondsRemaining: 60,
  currentQuestionIndex: 0,
  totalQuestionsAsked: 0,
  correctAnswersCount: 0,
  wrongAnswersCount: 0,
  passedAnswersCount: 0
};

function getRapidFireState() {
  return currentRapidFireState;
}

function startRapidFire(io, { teamId, seconds = 60 }) {
  if (rapidFireInterval) {
    clearInterval(rapidFireInterval);
  }

  currentRapidFireState = {
    isActive: true,
    teamId,
    timerSecondsRemaining: seconds,
    currentQuestionIndex: 0,
    totalQuestionsAsked: 0,
    correctAnswersCount: 0,
    wrongAnswersCount: 0,
    passedAnswersCount: 0
  };

  store.updateEventState({
    activeTeamId: teamId,
    rapidFireSubState: { ...currentRapidFireState }
  });

  io.emit('rapid-fire:started', {
    teamId,
    seconds,
    state: currentRapidFireState
  });

  rapidFireInterval = setInterval(() => {
    currentRapidFireState.timerSecondsRemaining -= 1;

    io.emit('rapid-fire:tick', {
      secondsRemaining: currentRapidFireState.timerSecondsRemaining
    });

    if (currentRapidFireState.timerSecondsRemaining <= 0) {
      stopRapidFire(io, 'TIMES_UP');
    }
  }, 1000);
}

function stopRapidFire(io, reason = 'STOPPED') {
  if (rapidFireInterval) {
    clearInterval(rapidFireInterval);
    rapidFireInterval = null;
  }

  currentRapidFireState.isActive = false;

  store.updateEventState({
    rapidFireSubState: { ...currentRapidFireState }
  });

  io.emit('rapid-fire:times-up', {
    reason,
    stats: {
      teamId: currentRapidFireState.teamId,
      totalAsked: currentRapidFireState.totalQuestionsAsked,
      correct: currentRapidFireState.correctAnswersCount,
      wrong: currentRapidFireState.wrongAnswersCount,
      passed: currentRapidFireState.passedAnswersCount
    }
  });
}

async function handleRapidFireAction(io, { action, teamId }) {
  if (!currentRapidFireState.isActive) {
    return;
  }

  currentRapidFireState.totalQuestionsAsked += 1;
  let pointsAwarded = 0;

  if (action === 'CORRECT') {
    currentRapidFireState.correctAnswersCount += 1;
    pointsAwarded = 1;
    if (teamId) {
      await store.adjustTeamScore(teamId, 1, 'ROUND_RAPID_FIRE');
    }
  } else if (action === 'WRONG') {
    currentRapidFireState.wrongAnswersCount += 1;
    pointsAwarded = 0;
  } else if (action === 'PASS') {
    currentRapidFireState.passedAnswersCount += 1;
    pointsAwarded = 0;
  }

  currentRapidFireState.currentQuestionIndex += 1;

  // Advance to next Rapid Fire question
  const rfQuestions = await store.getQuestions({ roundType: 'RAPID_FIRE' });
  const nextQ = rfQuestions[currentRapidFireState.currentQuestionIndex % rfQuestions.length];

  const updatedTeams = await store.getTeams();

  // Instant broadcast (<10ms)
  io.emit('rapid-fire:update', {
    action,
    pointsAwarded,
    stats: {
      correct: currentRapidFireState.correctAnswersCount,
      wrong: currentRapidFireState.wrongAnswersCount,
      passed: currentRapidFireState.passedAnswersCount,
      total: currentRapidFireState.totalQuestionsAsked
    },
    nextQuestion: nextQ,
    teams: updatedTeams
  });

  io.emit('leaderboard:update', updatedTeams);

  // Background state update
  store.updateEventState({
    activeQuestionId: nextQ?._id || null,
    rapidFireSubState: { ...currentRapidFireState }
  });
}

function registerRapidFireHandlers(socket, io) {
  socket.on('admin:rapid-fire-start', (data) => {
    startRapidFire(io, data);
  });

  socket.on('admin:rapid-fire-stop', () => {
    stopRapidFire(io, 'MANUAL_STOP');
  });

  socket.on('admin:rapid-fire-action', (data) => {
    handleRapidFireAction(io, data);
  });
}

module.exports = {
  getRapidFireState,
  startRapidFire,
  stopRapidFire,
  handleRapidFireAction,
  registerRapidFireHandlers
};
