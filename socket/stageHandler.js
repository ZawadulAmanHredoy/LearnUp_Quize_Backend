const store = require('../utils/store');
const { broadcast } = require('./broadcast');
const { openBuzzer, resetBuzzer } = require('./buzzerHandler');

const STAGES = [
  'PRE_EVENT',
  'WELCOME',
  'BREAK',
  'ROUND_BUZZER',
  'ROUND_AV',
  'ROUND_RAPID_FIRE',
  'LEADERBOARD',
  'FINAL_WINNER'
];
const BREAK_TYPES = ['PRAYER', 'LUNCH', 'INTERMISSION', 'CUSTOM'];
const MEDIA_ACTIONS = ['play', 'pause', 'replay', 'seek', 'mute', 'unmute'];

let countdownInterval = null;

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function freshQuestionSubState({ isQuestionVisible = true } = {}) {
  return {
    isQuestionVisible,
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
}

/**
 * Rank teams and detect a tie for first place (Rules.md §5.1 sudden death)
 */
function computeStandings(teams) {
  const standings = [...teams].sort((a, b) => (b.score || 0) - (a.score || 0));
  const topScore = standings[0]?.score ?? null;
  const leaders = standings.filter((t) => t.score === topScore);
  return {
    standings,
    champion: leaders.length === 1 ? leaders[0] : null,
    isTie: leaders.length > 1,
    tiedTeams: leaders.length > 1 ? leaders : []
  };
}

function registerStageHandlers(socket, io, { onAdmin, notice }) {
  // 1. STAGE SHIFT
  onAdmin('admin:set-stage', async ({ stage, metadata = {} } = {}) => {
    if (!STAGES.includes(stage)) {
      notice(`Unknown stage: ${stage}`);
      return;
    }
    clearCountdown();
    resetBuzzer(io);

    const STAGE_TO_ROUND_TYPE = {
      ROUND_BUZZER: 'BUZZER',
      ROUND_AV: 'AUDIO_VISUAL',
      ROUND_RAPID_FIRE: 'RAPID_FIRE'
    };

    const targetRoundType = STAGE_TO_ROUND_TYPE[stage];
    let updates = { currentStage: stage };

    if (targetRoundType) {
      const currentState = await store.getEventState();
      const currentQ = currentState.activeQuestionId
        ? await store.getQuestionById(currentState.activeQuestionId)
        : null;

      // Auto-align with valid round question if current activeQuestion belongs to another round
      if (!currentQ || currentQ.roundType !== targetRoundType) {
        const roundQuestions = await store.getQuestions({ roundType: targetRoundType });
        if (roundQuestions.length > 0) {
          const firstQ = roundQuestions[0];
          const isMediaFirst = firstQ.roundType === 'AUDIO_VISUAL';
          updates.activeQuestionId = firstQ._id;
          updates.currentQuestionIndex = 0;
          updates.questionSubState = freshQuestionSubState({ isQuestionVisible: !isMediaFirst });
        }
      }
    }

    const updatedState = await store.updateEventState(updates);
    const activeQuestion = updatedState.activeQuestionId
      ? await store.getQuestionById(updatedState.activeQuestionId)
      : null;

    broadcast(io, 'stage:updated', { stage, metadata, state: updatedState, activeQuestion });
    broadcast(io, 'stage:changed', { stage, metadata, state: updatedState, activeQuestion });
  });

  // 1b. WELCOME SCREEN CONFIGURATION
  onAdmin('admin:update-welcome', async ({ welcomeConfig } = {}) => {
    if (!welcomeConfig || typeof welcomeConfig !== 'object') {
      notice('Invalid welcome configuration');
      return;
    }
    const updatedState = await store.updateEventState({ welcomeConfig });
    broadcast(io, 'welcome:updated', updatedState.welcomeConfig);
    broadcast(io, 'stage:updated', { stage: updatedState.currentStage, state: updatedState });
  });

  // 2. BREAK SCREENS
  onAdmin('admin:set-break', async ({ breakType = 'INTERMISSION', message } = {}) => {
    const type = BREAK_TYPES.includes(breakType) ? breakType : 'INTERMISSION';
    const breakMessages = {
      PRAYER: 'Prayer Break — We will resume in a short while.',
      LUNCH: 'Lunch & Refreshment Intermission — Enjoy your meal.',
      INTERMISSION: 'Short Intermission — The battle resumes shortly.',
      CUSTOM: 'Intermission'
    };

    const breakConfig = {
      type,
      message: (typeof message === 'string' && message.trim()) || breakMessages[type],
      startedAt: new Date(),
      durationMinutes: null
    };

    clearCountdown();
    resetBuzzer(io);
    const updatedState = await store.updateEventState({
      currentStage: 'BREAK',
      breakConfig
    });

    broadcast(io, 'stage:updated', { stage: 'BREAK', state: updatedState });
    broadcast(io, 'break:started', breakConfig);
  });

  onAdmin('admin:end-break', async ({ nextStage = 'ROUND_BUZZER' } = {}) => {
    const stage = STAGES.includes(nextStage) ? nextStage : 'ROUND_BUZZER';
    const updatedState = await store.updateEventState({ currentStage: stage });

    broadcast(io, 'stage:updated', { stage, state: updatedState });
    broadcast(io, 'stage:changed', { stage, state: updatedState });
    broadcast(io, 'break:ended', { nextStage: stage });
  });

  // 3. LOAD / BROADCAST QUESTION
  // Audio-visual questions load media-first: the question text and options
  // stay hidden until the admin sends admin:show-question.
  onAdmin('admin:load-question', async ({ questionId, questionIndex } = {}) => {
    const question = await store.getQuestionById(questionId);
    if (!question) {
      notice('Question not found');
      return;
    }

    clearCountdown();
    resetBuzzer(io);

    const isMediaFirst = question.roundType === 'AUDIO_VISUAL';
    const questionSubState = freshQuestionSubState({ isQuestionVisible: !isMediaFirst });
    const mediaSubState = {
      isPlaying: false,
      action: 'pause',
      currentTime: 0,
      lastUpdated: Date.now()
    };

    await store.updateEventState({
      activeQuestionId: question._id,
      currentQuestionIndex: Number.isInteger(questionIndex) ? questionIndex : 0,
      questionSubState,
      mediaSubState
    });

    broadcast(io, 'question:presented', {
      questionId: question._id,
      questionIndex,
      question,
      questionSubState,
      mediaSubState
    });
  });

  // 3b. SHOW QUESTION (Options remain hidden until admin reveals them one by one)
  onAdmin('admin:show-question', async () => {
    const state = await store.getEventState();
    const question = await store.getQuestionById(state.activeQuestionId);
    if (!question) {
      notice('Load a question first');
      return;
    }

    const updatedState = await store.updateEventState({
      questionSubState: {
        isQuestionVisible: true,
        revealedOptions: [],
        areAllOptionsVisible: false
      }
    });

    broadcast(io, 'question:shown', { questionSubState: updatedState.questionSubState });
    broadcast(io, 'options:updated', { revealedIndices: [], allRevealed: false });
  });

  // 3c. LOAD / PRELOAD MEDIA FOR AV ROUND (Zero-buffering cache)
  onAdmin('admin:load-media', async () => {
    const avQuestions = await store.getQuestions({ roundType: 'AUDIO_VISUAL' });
    const mediaUrls = avQuestions
      .map((q) => q.mediaUrl)
      .filter(Boolean);

    broadcast(io, 'media:preload', {
      mediaUrls,
      count: mediaUrls.length,
      timestamp: Date.now()
    });
  });

  // 4. REVEAL OPTION(S)
  onAdmin('admin:reveal-option', async ({ optionIndex, revealAll = false } = {}) => {
    const state = await store.getEventState();
    const question = await store.getQuestionById(state.activeQuestionId);
    const optionCount = question?.options?.length || 4;
    let revealed = [...(state.questionSubState?.revealedOptions || [])];

    if (revealAll) {
      revealed = Array.from({ length: optionCount }, (_, idx) => idx);
    } else if (Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < optionCount) {
      if (!revealed.includes(optionIndex)) {
        revealed.push(optionIndex);
        revealed.sort((a, b) => a - b);
      }
    } else {
      notice('Invalid option index');
      return;
    }

    const areAllOptionsVisible = revealed.length >= optionCount;

    await store.updateEventState({
      questionSubState: {
        revealedOptions: revealed,
        areAllOptionsVisible
      }
    });

    broadcast(io, 'options:updated', {
      revealedIndices: revealed,
      allRevealed: areAllOptionsVisible,
      revealedIndex: optionIndex
    });
  });

  // 5. 3-2-1 SYNCHRONIZED COUNTDOWN (STRICTLY ONCE PER QUESTION)
  onAdmin('admin:start-countdown', async ({ seconds = 3 } = {}) => {
    const currentState = await store.getEventState();
    const sub = currentState.questionSubState || {};

    if (!sub.isQuestionVisible) {
      notice('Broadcast a question before starting the countdown.');
      return;
    }
    if (sub.hasCountdownStarted || sub.isCountdownActive || sub.isEvaluated) {
      notice('Countdown can only be started once per question.');
      return;
    }

    clearCountdown();
    resetBuzzer(io);

    await store.updateEventState({
      questionSubState: {
        isCountdownActive: true,
        hasCountdownStarted: true,
        isCountdownDone: false,
        isBuzzerOpen: false
      }
    });

    let currentCount = Math.min(Math.max(Number(seconds) || 3, 1), 10);
    broadcast(io, 'countdown:tick', { count: currentCount });

    countdownInterval = setInterval(() => {
      currentCount -= 1;

      if (currentCount > 0) {
        broadcast(io, 'countdown:tick', { count: currentCount });
        return;
      }

      clearCountdown();
      broadcast(io, 'countdown:tick', { count: 0, text: 'GO!' });

      store.updateEventState({
        questionSubState: {
          isCountdownActive: false,
          hasCountdownStarted: true,
          isCountdownDone: true
        }
      });

      // Unlock buzzer on mobile screens
      openBuzzer(io);
    }, 1000);
  });

  // 6. LOCK ANSWER (Host clicks the spoken option)
  onAdmin('admin:lock-answer', async ({ selectedOptionIndex } = {}) => {
    const state = await store.getEventState();
    const question = await store.getQuestionById(state.activeQuestionId);
    const optionCount = question?.options?.length || 4;

    if (state.questionSubState?.isEvaluated) {
      notice('This question has already been evaluated.');
      return;
    }
    if (!Number.isInteger(selectedOptionIndex) || selectedOptionIndex < 0 || selectedOptionIndex >= optionCount) {
      notice('Invalid option index');
      return;
    }

    await store.updateEventState({
      questionSubState: {
        selectedOptionIndex,
        isAnswerLocked: true
      }
    });

    broadcast(io, 'answer:locked', { selectedOptionIndex });
  });

  // 7. EVALUATE ANSWER (+Points / -Points, NO REOPEN)
  // Points and the correct option come from the stored question, never from
  // the client. The answering team is the buzzer winner, or the designated
  // team in the audio-visual round.
  onAdmin('admin:evaluate', async ({ isCorrect } = {}) => {
    const state = await store.getEventState();
    const sub = state.questionSubState || {};
    const question = await store.getQuestionById(state.activeQuestionId);

    if (!question) {
      notice('No active question to evaluate.');
      return;
    }
    if (sub.isEvaluated) {
      notice('This question has already been evaluated.');
      return;
    }

    const isAvRound = question.roundType === 'AUDIO_VISUAL';
    const answeringTeamId = isAvRound ? state.activeTeamId : sub.buzzerLockedBy?.teamId;
    if (!answeringTeamId) {
      notice(isAvRound ? 'Designate the team whose turn it is first.' : 'No team has buzzed in yet.');
      return;
    }

    // Re-check against the live state right before marking it: two quick
    // clicks can both get past the earlier awaits.
    if (store.peekEventState().questionSubState?.isEvaluated) {
      notice('This question has already been evaluated.');
      return;
    }

    const correct = Boolean(isCorrect);
    const pointsGranted = correct
      ? Number(question.points ?? 10)
      : -Math.abs(Number(question.negativePoints ?? (isAvRound ? 0 : 5)));

    // Mark evaluated before awaiting the score write so a double click
    // can't award points twice.
    await store.updateEventState({
      questionSubState: {
        isEvaluated: true,
        isCorrect: correct
      }
    });

    const updatedTeam = await store.adjustTeamScore(answeringTeamId, pointsGranted, question.roundType);
    const updatedTeams = await store.getTeams();

    broadcast(io, 'answer:evaluated', {
      isCorrect: correct,
      selectedOptionIndex: sub.selectedOptionIndex,
      correctOptionIndex: question.correctOptionIndex,
      explanation: question.explanation || '',
      pointsAwarded: pointsGranted,
      teamId: answeringTeamId,
      teamName: updatedTeam?.teamName || sub.buzzerLockedBy?.teamName || null,
      updatedTeamScore: updatedTeam?.score ?? 0,
      teams: updatedTeams
    });

    broadcast(io, 'leaderboard:update', updatedTeams);
  });

  // 8. AUDIO-VISUAL REMOTE PLAYBACK CONTROLS
  onAdmin('admin:media-control', async ({ action, time = 0 } = {}) => {
    if (!MEDIA_ACTIONS.includes(action)) {
      notice(`Unknown media action: ${action}`);
      return;
    }
    const isPlaying = action === 'play' || action === 'replay';
    const mediaSubState = {
      isPlaying,
      action,
      currentTime: Number(time) || 0,
      lastUpdated: Date.now()
    };
    await store.updateEventState({ mediaSubState });
    broadcast(io, 'media:sync', { action, time: Number(time) || 0, timestamp: Date.now(), mediaSubState });
  });

  // 9. SET ACTIVE TEAM TURN (for AV turn rotation)
  onAdmin('admin:set-active-team', async ({ teamId } = {}) => {
    const team = await store.getTeamById(teamId);
    if (!team) {
      notice('Team not found');
      return;
    }

    await store.updateEventState({ activeTeamId: String(team._id) });
    broadcast(io, 'turn:updated', { activeTeamId: String(team._id), team });
  });

  // 10. ANNOUNCE FINAL WINNER (or a tie that needs a sudden-death question)
  onAdmin('admin:announce-winner', async () => {
    const teams = await store.getTeams();
    const result = computeStandings(teams);

    const updatedState = await store.updateEventState({ currentStage: 'FINAL_WINNER' });

    broadcast(io, 'stage:updated', { stage: 'FINAL_WINNER', state: updatedState });
    broadcast(io, 'winner:celebration', result);
  });

  // 11. MANUAL SCORE OVERRIDE & ADJUSTMENT FOR LEADERBOARD
  onAdmin('admin:update-team-score', async ({ teamId, score, roundScores, delta, roundType } = {}) => {
    try {
      const team = await store.getTeamById(teamId);
      if (!team) {
        notice('Team not found');
        return;
      }

      let updated;
      if (delta !== undefined && Number.isFinite(Number(delta))) {
        updated = await store.adjustTeamScore(teamId, Number(delta), roundType || 'buzzer');
      } else {
        const updates = {};
        if (score !== undefined) updates.score = Number(score);
        if (roundScores && typeof roundScores === 'object') {
          updates.roundScores = {
            buzzer: Number(roundScores.buzzer ?? team.roundScores?.buzzer ?? 0),
            audioVisual: Number(roundScores.audioVisual ?? team.roundScores?.audioVisual ?? 0),
            rapidFire: Number(roundScores.rapidFire ?? team.roundScores?.rapidFire ?? 0),
          };
          if (score === undefined) {
            updates.score = updates.roundScores.buzzer + updates.roundScores.audioVisual + updates.roundScores.rapidFire;
          }
        }
        updated = await store.updateTeam(teamId, updates);
      }

      const allTeams = await store.getTeams();
      broadcast(io, 'leaderboard:update', allTeams);
      notice(`Score updated for ${team.teamName}`);
    } catch (err) {
      notice(`Failed to update score: ${err.message}`);
    }
  });
}

module.exports = {
  registerStageHandlers,
  computeStandings,
  clearCountdown
};
