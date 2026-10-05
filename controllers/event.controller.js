const store = require('../utils/store');
const { forAdmin } = require('../utils/sanitize');
const { broadcast } = require('../socket/broadcast');
const { resetBuzzer } = require('../socket/buzzerHandler');
const { stopRapidFire } = require('../socket/rapidFireHandler');
const { clearCountdown } = require('../socket/stageHandler');

/**
 * Get current event state snapshot for rehydration (admin only: it includes
 * the answer key and team PINs)
 * GET /api/v1/event/state
 */
async function getState(req, res, next) {
  try {
    const state = await store.getEventState();
    const teams = await store.getTeams();
    const questions = await store.getQuestions();
    const activeQuestion = state.activeQuestionId ? await store.getQuestionById(state.activeQuestionId) : null;

    res.status(200).json({
      success: true,
      data: forAdmin({
        state,
        teams,
        activeQuestion,
        totalQuestions: questions.length
      })
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Reset event state to Welcome
 * POST /api/v1/event/reset
 */
async function resetEvent(req, res, next) {
  try {
    if (req.io) {
      clearCountdown();
      stopRapidFire(req.io, 'EVENT_RESET');
      resetBuzzer(req.io);
    }

    const state = await store.resetEventState();
    const teams = await store.resetAllTeamScores();

    if (req.io) {
      broadcast(req.io, 'state:sync', { state, teams, activeQuestion: null });
      broadcast(req.io, 'stage:updated', { stage: 'WELCOME', state });
      broadcast(req.io, 'leaderboard:update', teams);
    }

    res.status(200).json({
      success: true,
      message: 'Event reset to WELCOME successfully',
      data: forAdmin({ state, teams })
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Seed or reload default questions and teams
 * POST /api/v1/event/seed
 */
async function seedEvent(req, res, next) {
  try {
    await store.seedDatabaseIfEmpty();
    const state = await store.getEventState();
    const teams = await store.getTeams();
    const questions = await store.getQuestions();

    res.status(200).json({
      success: true,
      message: 'Demo seed data loaded successfully',
      data: {
        teamsCount: teams.length,
        questionsCount: questions.length,
        state
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getState,
  resetEvent,
  seedEvent
};
