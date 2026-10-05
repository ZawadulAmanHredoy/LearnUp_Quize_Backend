const store = require('../utils/store');

/**
 * Get current event state snapshot for rehydration
 * GET /api/v1/event/state
 */
async function getState(req, res, next) {
  try {
    const state = await store.getEventState();
    const teams = await store.getTeams();
    const questions = await store.getQuestions();

    res.status(200).json({
      success: true,
      data: {
        state,
        teams,
        activeQuestion: questions.find((q) => String(q._id) === String(state.activeQuestionId)) || questions[0] || null,
        totalQuestions: questions.length
      }
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
    const state = await store.resetEventState();
    const teams = await store.resetAllTeamScores();

    if (req.io) {
      req.io.emit('stage:updated', { stage: 'WELCOME' });
      req.io.emit('state:sync', { state, teams });
      req.io.emit('buzzer:status', { isOpen: false });
    }

    res.status(200).json({
      success: true,
      message: 'Event reset to WELCOME successfully',
      data: { state, teams }
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
