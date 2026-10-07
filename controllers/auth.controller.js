const crypto = require('crypto');
const Admin = require('../models/Admin');
const Team = require('../models/Team');
const { hashPassword, verifyPassword, generateToken, verifyToken, extractBearerToken } = require('../utils/auth');
const { setSession, revokeTeamSockets } = require('../socket/sessions');
const store = require('../utils/store');
const AppError = require('../utils/appError');

/**
 * Admin Login
 * POST /api/v1/auth/admin/login
 */
async function adminLogin(req, res, next) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return next(new AppError('Please provide username and password', 400));
    }

    const cleanUser = username.toLowerCase().trim();

    let admin = null;
    if (store.isDbConnected()) {
      const dbAdmin = await Admin.findOne({ username: cleanUser });
      if (dbAdmin && verifyPassword(password, dbAdmin.password)) {
        admin = dbAdmin;
      }
    } else {
      // Memory store fallback only if DB is completely offline
      if (store.memoryStore?.admin?.username === cleanUser) {
        if (verifyPassword(password, store.memoryStore.admin.password)) {
          admin = store.memoryStore.admin;
        }
      }
    }

    if (!admin) {
      return next(new AppError('Invalid admin credentials', 401));
    }

    const token = generateToken({
      id: admin._id,
      role: admin.role,
      username: admin.username
    });

    res.status(200).json({
      success: true,
      data: {
        token,
        admin: {
          id: admin._id,
          username: admin.username,
          role: admin.role
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Team Login (Single-Session Enforced)
 * POST /api/v1/auth/team/login
 */
async function teamLogin(req, res, next) {
  try {
    const { teamId, teamNumber, pin } = req.body;
    const identifier = teamId || teamNumber;

    if (!identifier || !pin) {
      return next(new AppError('Please provide Team ID and PIN', 400));
    }

    const team = await store.getTeamByIdentifier(identifier);

    if (!team) {
      return next(new AppError(`Team "${identifier}" not found. Please enter your Team ID (e.g. T-01) or Team Number.`, 404));
    }

    if (String(team.pin).trim() !== String(pin).trim()) {
      return next(new AppError('Invalid Team PIN', 401));
    }

    // Generate fresh single-session UUID token
    const sessionToken = crypto.randomUUID();

    // Update team with new activeSessionToken
    await store.updateTeam(team._id, {
      activeSessionToken: sessionToken
    });

    // The newest login wins: kick any phone still on the previous session
    setSession(team._id, sessionToken);
    revokeTeamSockets(
      req.io,
      team._id,
      'auth:session_replaced',
      'Your team logged in on another device. This session has been closed.'
    );

    const token = generateToken({
      teamId: team._id,
      teamNumber: team.teamNumber,
      teamName: team.teamName,
      sessionToken,
      role: 'TEAM'
    });

    res.status(200).json({
      success: true,
      data: {
        token,
        sessionToken,
        team: {
          id: team._id,
          teamName: team.teamName,
          teamNumber: team.teamNumber,
          teamId: team.teamId || '',
          institution: team.institution || '',
          teamLead: team.teamLead || '',
          score: team.score,
          roundScores: team.roundScores
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Team Logout
 * POST /api/v1/auth/team/logout
 */
async function teamLogout(req, res, next) {
  try {
    // Only the phone holding the current session can end it. A phone that was
    // already replaced must not clear the new phone's session.
    const decoded = verifyToken(extractBearerToken(req));
    if (decoded?.role === 'TEAM' && decoded.teamId) {
      const team = await store.getTeamById(decoded.teamId);
      if (team && team.activeSessionToken === decoded.sessionToken) {
        await store.updateTeam(team._id, {
          activeSessionToken: null,
          isConnected: false,
          socketId: null
        });
        setSession(team._id, null);
        revokeTeamSockets(req.io, team._id, 'auth:session_revoked', 'Logged out.');
      }
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Verify current auth token
 * GET /api/v1/auth/me
 */
async function getMe(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return next(new AppError('Not authenticated', 401));
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return next(new AppError('Invalid or expired token', 401));
    }

    if (decoded.role === 'SUPER_ADMIN' || decoded.role === 'MODERATOR') {
      return res.status(200).json({
        success: true,
        data: {
          role: decoded.role,
          username: decoded.username,
          id: decoded.id
        }
      });
    }

    if (decoded.role === 'TEAM') {
      const team = await store.getTeamById(decoded.teamId);
      if (!team) {
        return next(new AppError('Team not found', 404));
      }

      // Check single session
      if (team.activeSessionToken !== decoded.sessionToken) {
        return res.status(403).json({
          success: false,
          error: 'Session expired or logged in on another device',
          code: 'SESSION_REVOKED'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          role: 'TEAM',
          team: {
            id: team._id,
            teamName: team.teamName,
            teamNumber: team.teamNumber,
            teamId: team.teamId || '',
            institution: team.institution || '',
            teamLead: team.teamLead || '',
            score: team.score,
            roundScores: team.roundScores
          }
        }
      });
    }

    return next(new AppError('Invalid role', 400));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  adminLogin,
  teamLogin,
  teamLogout,
  getMe
};
