const store = require('../utils/store');
const AppError = require('../utils/appError');

/**
 * Get all teams with current scores and status
 * GET /api/v1/teams
 */
async function getTeams(req, res, next) {
  try {
    const teams = await store.getTeams();
    res.status(200).json({
      success: true,
      count: teams.length,
      data: teams
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Register a new team
 * POST /api/v1/teams
 */
async function createTeam(req, res, next) {
  try {
    const { teamName, teamNumber, pin } = req.body;

    if (!teamName || !teamNumber || !pin) {
      return next(new AppError('Please provide teamName, teamNumber, and pin', 400));
    }

    const existing = await store.getTeamByNumber(teamNumber);
    if (existing) {
      return next(new AppError(`Team #${teamNumber} already exists`, 409));
    }

    const newTeam = await store.createTeam({
      teamName: teamName.trim(),
      teamNumber: Number(teamNumber),
      pin: String(pin).trim()
    });

    const allTeams = await store.getTeams();
    if (req.io) {
      req.io.emit('leaderboard:update', allTeams);
    }

    res.status(201).json({
      success: true,
      data: newTeam
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete a team
 * DELETE /api/v1/teams/:id
 */
async function deleteTeam(req, res, next) {
  try {
    await store.deleteTeam(req.params.id);
    const allTeams = await store.getTeams();
    if (req.io) {
      req.io.emit('leaderboard:update', allTeams);
    }
    res.status(200).json({
      success: true,
      message: 'Team deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update team details
 * PUT /api/v1/teams/:id
 */
async function updateTeam(req, res, next) {
  try {
    const updated = await store.updateTeam(req.params.id, req.body);
    if (!updated) {
      return next(new AppError('Team not found', 404));
    }

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Force-reset team session (if phone battery died on stage)
 * POST /api/v1/teams/:id/reset-session
 */
async function resetTeamSession(req, res, next) {
  try {
    const updated = await store.updateTeam(req.params.id, {
      activeSessionToken: null,
      isConnected: false,
      socketId: null
    });

    if (!updated) {
      return next(new AppError('Team not found', 404));
    }

    if (req.io) {
      req.io.to(`team:${updated._id}`).emit('auth:session_revoked', {
        message: 'Admin reset your device session. Please log in again.'
      });
    }

    res.status(200).json({
      success: true,
      message: `Session for Team #${updated.teamNumber} (${updated.teamName}) has been reset.`,
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Reset all scores to 0 for a new event
 * POST /api/v1/teams/reset-scores
 */
async function resetScores(req, res, next) {
  try {
    const teams = await store.resetAllTeamScores();

    if (req.io) {
      req.io.emit('leaderboard:update', teams);
    }

    res.status(200).json({
      success: true,
      message: 'All team scores reset to 0',
      data: teams
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  resetTeamSession,
  resetScores
};
