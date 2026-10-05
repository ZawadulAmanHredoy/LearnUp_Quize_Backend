const { Server } = require('socket.io');
const store = require('../utils/store');
const { verifyToken, isAdminPayload } = require('../utils/auth');
const { forAdmin, forPublic } = require('../utils/sanitize');
const { ROOMS } = require('../socket/broadcast');
const { setSession, isCurrentSession } = require('../socket/sessions');
const { registerBuzzerHandlers, getBuzzerStatus, hydrateBuzzer } = require('../socket/buzzerHandler');
const { registerStageHandlers } = require('../socket/stageHandler');
const { registerRapidFireHandlers, getRapidFireState, hydrateRapidFire } = require('../socket/rapidFireHandler');

let io = null;

// Track active connections for Admin Presence Radar
const activeConnections = {
  projectors: new Set(),
  admins: new Set(),
  teams: new Map() // teamId -> { socketId, teamName, teamNumber, connectedAt, latency }
};

function getRadarStatus() {
  return {
    isProjectorConnected: activeConnections.projectors.size > 0,
    adminCount: activeConnections.admins.size,
    connectedTeams: Array.from(activeConnections.teams.entries()).map(([teamId, data]) => ({
      teamId,
      teamName: data.teamName,
      teamNumber: data.teamNumber,
      connectedAt: data.connectedAt,
      latency: data.latency || 0
    }))
  };
}

function broadcastRadar(ioInstance) {
  ioInstance.to(ROOMS.admin).emit('radar:status', getRadarStatus());
}

/**
 * Full snapshot for a (re)joining client. Non-admin clients get the
 * correct answer only once the active question has been evaluated.
 */
async function buildSnapshot(role) {
  const state = await store.getEventState();
  const teams = await store.getTeams();
  const activeQuestion = state.activeQuestionId ? await store.getQuestionById(state.activeQuestionId) : null;
  const snapshot = {
    state,
    teams,
    activeQuestion,
    buzzer: getBuzzerStatus(),
    rapidFire: getRapidFireState()
  };

  if (role === 'admin') {
    return forAdmin({ ...snapshot, radar: getRadarStatus() });
  }

  const publicSnapshot = forPublic(snapshot);
  if (activeQuestion && state.questionSubState?.isEvaluated) {
    publicSnapshot.activeQuestion.correctOptionIndex = activeQuestion.correctOptionIndex;
  }
  return publicSnapshot;
}

function leaveRoleRooms(socket) {
  socket.leave(ROOMS.admin);
  socket.leave(ROOMS.projector);
  socket.leave(ROOMS.teams);
  activeConnections.admins.delete(socket.id);
  activeConnections.projectors.delete(socket.id);
  if (socket.data.team) {
    socket.leave(`team:${socket.data.team.teamId}`);
    const entry = activeConnections.teams.get(socket.data.team.teamId);
    if (entry?.socketId === socket.id) activeConnections.teams.delete(socket.data.team.teamId);
  }
  socket.data.role = null;
  socket.data.team = null;
}

/**
 * Verify a team's token and that it belongs to the team's current session
 */
async function authenticateTeam(token) {
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'TEAM' || !decoded.teamId) {
    return { error: 'INVALID_TOKEN' };
  }

  const team = await store.getTeamById(decoded.teamId);
  if (!team) return { error: 'TEAM_NOT_FOUND' };

  if (!team.activeSessionToken || team.activeSessionToken !== decoded.sessionToken) {
    return { error: 'SESSION_REVOKED' };
  }

  return {
    team: {
      teamId: String(team._id),
      teamName: team.teamName,
      teamNumber: team.teamNumber,
      sessionToken: decoded.sessionToken
    }
  };
}

function initSocket(server, { corsOrigin = true } = {}) {
  io = new Server(server, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST']
    },
    pingInterval: 2000,
    pingTimeout: 5000
  });

  io.on('connection', (socket) => {
    const notice = (message) => socket.emit('admin:notice', { message });

    // Admin-only events are ignored unless this socket joined as a verified admin
    const onAdmin = (event, handler) => {
      socket.on(event, async (...args) => {
        if (socket.data.role !== 'admin') {
          socket.emit('auth:error', { scope: 'admin', message: 'Admin authentication required' });
          return;
        }
        try {
          await handler(...args);
        } catch (err) {
          console.error(`[Socket.IO] ${event} failed:`, err);
          notice(`Server error while handling ${event}`);
        }
      });
    };

    // 1. Role-based Room Joining & Presence
    socket.on('join:room', async ({ role, token } = {}) => {
      try {
        leaveRoleRooms(socket);

        if (role === 'admin') {
          const decoded = verifyToken(token);
          if (!isAdminPayload(decoded)) {
            socket.emit('auth:error', { scope: 'admin', message: 'Admin session expired. Please log in again.' });
            return;
          }
          socket.data.role = 'admin';
          socket.join(ROOMS.admin);
          activeConnections.admins.add(socket.id);
        } else if (role === 'projector') {
          socket.data.role = 'projector';
          socket.join(ROOMS.projector);
          activeConnections.projectors.add(socket.id);
        } else if (role === 'team') {
          const { team, error } = await authenticateTeam(token);
          if (error) {
            socket.emit('auth:session_revoked', {
              code: error,
              message:
                error === 'SESSION_REVOKED'
                  ? 'Your team is logged in on another device, or the admin reset your session.'
                  : 'Please log in again.'
            });
            socket.disconnect(true);
            return;
          }

          setSession(team.teamId, team.sessionToken);
          socket.data.role = 'team';
          socket.data.team = team;
          socket.join(ROOMS.teams);
          socket.join(`team:${team.teamId}`);

          activeConnections.teams.set(team.teamId, {
            socketId: socket.id,
            teamName: team.teamName,
            teamNumber: team.teamNumber,
            connectedAt: Date.now(),
            latency: 0
          });

          await store.updateTeam(team.teamId, { isConnected: true, socketId: socket.id });
        } else {
          return;
        }

        broadcastRadar(io);

        // Rehydrate client with current snapshot on join
        socket.emit('state:sync', await buildSnapshot(socket.data.role));
      } catch (err) {
        console.error('[Socket.IO] join:room failed:', err);
      }
    });

    // 2. Ping / Pong Latency Measurement
    socket.on('ping:measure', (data) => {
      const now = Date.now();
      socket.emit('pong:measure', { sentAt: data?.sentAt || now, serverTime: now });

      const team = socket.data.team;
      if (team && activeConnections.teams.get(team.teamId)?.socketId === socket.id) {
        activeConnections.teams.get(team.teamId).latency = data?.latency ?? 0;
        broadcastRadar(io);
      }
    });

    // 3. Register Domain Handlers
    const context = { onAdmin, notice };
    registerBuzzerHandlers(socket, io, context);
    registerStageHandlers(socket, io, context);
    registerRapidFireHandlers(socket, io, context);

    // 4. Disconnect Handler
    socket.on('disconnect', async () => {
      const team = socket.data.team;
      const wasCurrentTeamSocket = team && activeConnections.teams.get(team.teamId)?.socketId === socket.id;
      leaveRoleRooms(socket);

      if (wasCurrentTeamSocket && isCurrentSession(team.teamId, team.sessionToken)) {
        await store.updateTeam(team.teamId, { isConnected: false, socketId: null }).catch(() => {});
      }
      broadcastRadar(io);
    });
  });

  return io;
}

/**
 * Restore in-memory buzzer and rapid-fire state after a server restart
 */
async function hydrateRealtimeState() {
  const state = await store.getEventState();
  hydrateBuzzer(state);
  hydrateRapidFire(state);

  const teams = await store.getTeams();
  teams.forEach((t) => setSession(t._id, t.activeSessionToken));
}

function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initSocket(server) first.');
  }
  return io;
}

module.exports = {
  initSocket,
  getIO,
  getRadarStatus,
  hydrateRealtimeState
};
