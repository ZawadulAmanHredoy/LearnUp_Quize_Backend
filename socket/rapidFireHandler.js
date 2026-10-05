const store = require('../utils/store');
const { broadcast } = require('./broadcast');

const RAPID_FIRE_ACTIONS = ['CORRECT', 'WRONG', 'PASS'];

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

/**
 * Restore counters after a server restart. A timer that was running when the
 * server went down is not resumed; the admin can see the stats and restart.
 */
function hydrateRapidFire(state) {
  const saved = state?.rapidFireSubState;
  if (!saved) return;
  currentRapidFireState = { ...currentRapidFireState, ...saved, isActive: false };
}

async function getRapidFireQuestion(index) {
  const rfQuestions = await store.getQuestions({ roundType: 'RAPID_FIRE' });
  if (rfQuestions.length === 0) return null;
  return rfQuestions[index % rfQuestions.length];
}

function statsPayload() {
  return {
    teamId: currentRapidFireState.teamId,
    correct: currentRapidFireState.correctAnswersCount,
    wrong: currentRapidFireState.wrongAnswersCount,
    passed: currentRapidFireState.passedAnswersCount,
    total: currentRapidFireState.totalQuestionsAsked
  };
}

async function startRapidFire(io, { teamId, seconds = 60 } = {}, notice = () => {}) {
  const team = await store.getTeamById(teamId);
  if (!team) {
    notice('Select a team for the hot seat first.');
    return;
  }

  if (rapidFireInterval) {
    clearInterval(rapidFireInterval);
  }

  const duration = Math.min(Math.max(Number(seconds) || 60, 5), 600);
  currentRapidFireState = {
    isActive: true,
    teamId: String(team._id),
    timerSecondsRemaining: duration,
    currentQuestionIndex: 0,
    totalQuestionsAsked: 0,
    correctAnswersCount: 0,
    wrongAnswersCount: 0,
    passedAnswersCount: 0
  };

  const firstQuestion = await getRapidFireQuestion(0);

  store.updateEventState({
    activeTeamId: currentRapidFireState.teamId,
    activeQuestionId: firstQuestion?._id || null,
    rapidFireSubState: { ...currentRapidFireState }
  });

  broadcast(io, 'rapid-fire:started', {
    teamId: currentRapidFireState.teamId,
    team,
    seconds: duration,
    question: firstQuestion,
    state: currentRapidFireState
  });

  rapidFireInterval = setInterval(() => {
    currentRapidFireState.timerSecondsRemaining -= 1;

    broadcast(io, 'rapid-fire:tick', {
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

  const wasActive = currentRapidFireState.isActive;
  currentRapidFireState.isActive = false;

  store.updateEventState({
    rapidFireSubState: { ...currentRapidFireState }
  });

  if (wasActive) {
    broadcast(io, 'rapid-fire:times-up', { reason, stats: statsPayload() });
  }
}

async function handleRapidFireAction(io, { action } = {}) {
  // Inputs lock the instant the clock hits zero (Rules.md §4.3)
  if (!currentRapidFireState.isActive || !RAPID_FIRE_ACTIONS.includes(action)) {
    return;
  }

  // All counters update synchronously so rapid keypresses never interleave
  const teamId = currentRapidFireState.teamId;
  currentRapidFireState.totalQuestionsAsked += 1;
  currentRapidFireState.currentQuestionIndex += 1;

  let pointsAwarded = 0;
  if (action === 'CORRECT') {
    currentRapidFireState.correctAnswersCount += 1;
    pointsAwarded = 1;
  } else if (action === 'WRONG') {
    currentRapidFireState.wrongAnswersCount += 1;
  } else {
    currentRapidFireState.passedAnswersCount += 1;
  }

  const questionIndex = currentRapidFireState.currentQuestionIndex;
  const stats = statsPayload();

  if (pointsAwarded) {
    await store.adjustTeamScore(teamId, pointsAwarded, 'RAPID_FIRE');
  }

  const nextQuestion = await getRapidFireQuestion(questionIndex);
  const updatedTeams = await store.getTeams();

  // Instant broadcast (<10ms)
  broadcast(io, 'rapid-fire:update', {
    teamId,
    action,
    pointsAwarded,
    stats,
    nextQuestionIndex: questionIndex,
    nextQuestion,
    teams: updatedTeams
  });

  broadcast(io, 'leaderboard:update', updatedTeams);

  // Background state update
  store.updateEventState({
    activeQuestionId: nextQuestion?._id || null,
    rapidFireSubState: { ...currentRapidFireState }
  });
}

function registerRapidFireHandlers(socket, io, { onAdmin, notice }) {
  onAdmin('admin:rapid-fire-start', (data) => startRapidFire(io, data, notice));
  onAdmin('admin:rapid-fire-stop', () => stopRapidFire(io, 'MANUAL_STOP'));
  onAdmin('admin:rapid-fire-action', (data) => handleRapidFireAction(io, data));
}

module.exports = {
  getRapidFireState,
  hydrateRapidFire,
  startRapidFire,
  stopRapidFire,
  handleRapidFireAction,
  registerRapidFireHandlers
};
