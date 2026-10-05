const store = require('../utils/store');
const { openBuzzer, resetBuzzer } = require('./buzzerHandler');

let countdownInterval = null;

function registerStageHandlers(socket, io) {
  // 1. STAGE SHIFT
  socket.on('admin:set-stage', async ({ stage, metadata = {} }) => {
    resetBuzzer(io);

    const updatedState = await store.updateEventState({
      currentStage: stage
    });

    io.emit('stage:updated', { stage, metadata, state: updatedState });
  });

  // 2. BREAK SCREENS
  socket.on('admin:set-break', async ({ breakType = 'INTERMISSION', durationMinutes = 15, message }) => {
    const breakMessages = {
      PRAYER: 'Prayer Break — We will resume in a short while.',
      LUNCH: 'Lunch & Refreshment Intermission — Enjoy your meal.',
      INTERMISSION: 'Short Intermission — The battle resumes shortly.',
      CUSTOM: message || 'Intermission'
    };

    const breakConfig = {
      type: breakType,
      message: message || breakMessages[breakType] || 'Break',
      startedAt: new Date(),
      durationMinutes: Number(durationMinutes) || 15
    };

    const updatedState = await store.updateEventState({
      currentStage: 'BREAK',
      breakConfig
    });

    io.emit('stage:updated', { stage: 'BREAK', state: updatedState });
    io.emit('break:started', breakConfig);
  });

  socket.on('admin:end-break', async ({ nextStage = 'ROUND_BUZZER' } = {}) => {
    const updatedState = await store.updateEventState({
      currentStage: nextStage
    });

    io.emit('stage:updated', { stage: nextStage, state: updatedState });
    io.emit('break:ended', { nextStage });
  });

  // 3. LOAD / BROADCAST QUESTION
  socket.on('admin:load-question', async ({ questionId, questionIndex }) => {
    resetBuzzer(io);

    const question = await store.getQuestionById(questionId);

    const questionSubState = {
      isQuestionVisible: true,
      revealedOptions: [],
      areAllOptionsVisible: false,
      isCountdownActive: false,
      hasCountdownStarted: false,
      isCountdownDone: false,
      isBuzzerOpen: false,
      buzzerLockedBy: null,
      selectedOptionIndex: null,
      isAnswerLocked: false,
      isEvaluated: false,
      isCorrect: null
    };

    await store.updateEventState({
      activeQuestionId: questionId,
      currentQuestionIndex: questionIndex !== undefined ? questionIndex : 0,
      questionSubState
    });

    io.emit('question:presented', {
      questionId,
      questionIndex,
      question,
      questionSubState
    });
  });

  // 4. REVEAL OPTION(S)
  socket.on('admin:reveal-option', async ({ optionIndex, revealAll = false }) => {
    const state = await store.getEventState();
    let revealed = [...(state.questionSubState?.revealedOptions || [])];

    if (revealAll) {
      revealed = [0, 1, 2, 3];
    } else if (optionIndex !== undefined && !revealed.includes(optionIndex)) {
      revealed.push(optionIndex);
      revealed.sort((a, b) => a - b);
    }

    const areAllOptionsVisible = revealed.length >= 4;

    await store.updateEventState({
      questionSubState: {
        revealedOptions: revealed,
        areAllOptionsVisible
      }
    });

    io.emit('options:updated', {
      revealedIndices: revealed,
      allRevealed: areAllOptionsVisible,
      revealedIndex: optionIndex
    });
  });

  // 5. 3-2-1 SYNCHRONIZED COUNTDOWN (STRICTLY ONCE PER QUESTION)
  socket.on('admin:start-countdown', async ({ seconds = 3 } = {}) => {
    const currentState = await store.getEventState();

    if (currentState.questionSubState?.hasCountdownStarted || currentState.questionSubState?.isCountdownActive) {
      socket.emit('admin:notice', { message: 'Countdown can only be started once per question.' });
      return;
    }

    if (countdownInterval) {
      clearInterval(countdownInterval);
    }

    resetBuzzer(io);

    await store.updateEventState({
      questionSubState: {
        isCountdownActive: true,
        hasCountdownStarted: true,
        isCountdownDone: false,
        isBuzzerOpen: false
      }
    });

    let currentCount = seconds;
    io.emit('countdown:tick', { count: currentCount });

    countdownInterval = setInterval(() => {
      currentCount -= 1;

      if (currentCount > 0) {
        io.emit('countdown:tick', { count: currentCount });
      } else if (currentCount === 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        io.emit('countdown:tick', { count: 0, text: 'GO!' });

        store.updateEventState({
          questionSubState: {
            isCountdownActive: false,
            hasCountdownStarted: true,
            isCountdownDone: true,
            isBuzzerOpen: true
          }
        });

        // Unlock buzzer on mobile screens
        openBuzzer(io);
      }
    }, 1000);
  });

  // 6. LOCK ANSWER (Host clicks the spoken option)
  socket.on('admin:lock-answer', async ({ selectedOptionIndex }) => {
    await store.updateEventState({
      questionSubState: {
        selectedOptionIndex,
        isAnswerLocked: true
      }
    });

    io.emit('answer:locked', { selectedOptionIndex });
  });

  // 7. EVALUATE ANSWER (+Points / -Points, NO REOPEN)
  socket.on('admin:evaluate', async ({ isCorrect, points, negativePoints, teamId, correctOptionIndex }) => {
    const state = await store.getEventState();
    const activeTeamId = teamId || state.questionSubState?.buzzerLockedBy?.teamId || state.activeTeamId;

    const pointsGranted = isCorrect
      ? (points !== undefined ? points : 10)
      : -(negativePoints !== undefined ? negativePoints : 5);

    let updatedTeam = null;
    if (activeTeamId) {
      updatedTeam = await store.adjustTeamScore(activeTeamId, pointsGranted, state.currentStage);
    }

    const updatedTeams = await store.getTeams();

    await store.updateEventState({
      questionSubState: {
        isEvaluated: true,
        isCorrect: Boolean(isCorrect)
      }
    });

    // Broadcast evaluation to all screens
    io.emit('answer:evaluated', {
      isCorrect: Boolean(isCorrect),
      selectedOptionIndex: state.questionSubState?.selectedOptionIndex,
      correctOptionIndex: correctOptionIndex !== undefined ? correctOptionIndex : 0,
      pointsAwarded: pointsGranted,
      teamId: activeTeamId,
      teamName: updatedTeam?.teamName || state.questionSubState?.buzzerLockedBy?.teamName,
      updatedTeamScore: updatedTeam?.score || 0,
      teams: updatedTeams
    });

    io.emit('leaderboard:update', updatedTeams);
  });

  // 8. AUDIO-VISUAL REMOTE PLAYBACK CONTROLS
  socket.on('admin:media-control', ({ action, time = 0 }) => {
    // action: 'play' | 'pause' | 'replay' | 'seek'
    io.emit('media:sync', { action, time, timestamp: Date.now() });
  });

  // 9. SET ACTIVE TEAM TURN (for AV turn rotation)
  socket.on('admin:set-active-team', async ({ teamId }) => {
    const team = await store.getTeamById(teamId);

    await store.updateEventState({
      activeTeamId: teamId
    });

    io.emit('turn:updated', {
      activeTeamId: teamId,
      team
    });
  });

  // 10. ANNOUNCE FINAL WINNER
  socket.on('admin:announce-winner', async () => {
    const teams = await store.getTeams();
    const winner = teams[0] || null;

    await store.updateEventState({
      currentStage: 'FINAL_WINNER'
    });

    io.emit('stage:updated', { stage: 'FINAL_WINNER' });
    io.emit('winner:celebration', {
      champion: winner,
      standings: teams
    });
  });
}

module.exports = {
  registerStageHandlers
};
