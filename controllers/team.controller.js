const store = require('../utils/store');
const AppError = require('../utils/appError');
const { forAdmin, forPublic } = require('../utils/sanitize');
const { setSession, revokeTeamSockets } = require('../socket/sessions');
const { broadcast } = require('../socket/broadcast');

const UPDATABLE_TEAM_FIELDS = ['teamName', 'teamNumber', 'pin'];

/**
 * Get all teams with current scores and status
 * GET /api/v1/teams
 */
async function getTeams(req, res, next) {
  try {
    // Public callers (e.g. the launchpad) get names and scores only
    const teams = await store.getTeams();
    res.status(200).json({
      success: true,
      count: teams.length,
      data: req.admin ? forAdmin(teams) : forPublic(teams)
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

    if (!String(teamName || '').trim() || !teamNumber || !String(pin || '').trim()) {
      return next(new AppError('Please provide teamName, teamNumber, and pin', 400));
    }
    if (!Number.isInteger(Number(teamNumber)) || Number(teamNumber) < 1) {
      return next(new AppError('teamNumber must be a positive whole number', 400));
    }

    const existing = await store.getTeamByNumber(teamNumber);
    if (existing) {
      return next(new AppError(`Team #${teamNumber} already exists`, 409));
    }

    const newTeam = await store.createTeam({
      teamName: String(teamName).trim(),
      teamNumber: Number(teamNumber),
      pin: String(pin).trim()
    });

    const allTeams = await store.getTeams();
    if (req.io) {
      broadcast(req.io, 'leaderboard:update', allTeams);
    }

    res.status(201).json({
      success: true,
      data: forAdmin(newTeam)
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
    revokeTeamSockets(req.io, req.params.id, 'auth:session_revoked', 'Your team was removed by the admin.');
    setSession(req.params.id, null);
    await store.deleteTeam(req.params.id);
    const allTeams = await store.getTeams();
    if (req.io) {
      broadcast(req.io, 'leaderboard:update', allTeams);
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
    // Only profile fields are editable here; scores and sessions have their own endpoints
    const updates = {};
    for (const field of UPDATABLE_TEAM_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.teamNumber !== undefined) updates.teamNumber = Number(updates.teamNumber);
    if (updates.pin !== undefined) updates.pin = String(updates.pin).trim();

    const updated = await store.updateTeam(req.params.id, updates);
    if (!updated) {
      return next(new AppError('Team not found', 404));
    }

    res.status(200).json({
      success: true,
      data: forAdmin(updated)
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

    setSession(updated._id, null);
    revokeTeamSockets(req.io, updated._id, 'auth:session_revoked', 'Admin reset your device session. Please log in again.');

    res.status(200).json({
      success: true,
      message: `Session for Team #${updated.teamNumber} (${updated.teamName}) has been reset.`,
      data: forAdmin(updated)
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
      broadcast(req.io, 'leaderboard:update', teams);
    }

    res.status(200).json({
      success: true,
      message: 'All team scores reset to 0',
      data: forAdmin(teams)
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
