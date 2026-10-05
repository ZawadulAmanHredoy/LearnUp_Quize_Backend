const { Server } = require('socket.io');
const store = require('../utils/store');
const { registerBuzzerHandlers, getBuzzerStatus } = require('../socket/buzzerHandler');
const { registerStageHandlers } = require('../socket/stageHandler');
const { registerRapidFireHandlers, getRapidFireState } = require('../socket/rapidFireHandler');

let io = null;

// Track active connections for Admin Presence Radar
const activeConnections = {
  projector: null, // socketId
  admins: new Set(),
  teams: new Map() // teamId -> { socketId, teamName, teamNumber, connectedAt, lastPing }
};

function getRadarStatus() {
  return {
    isProjectorConnected: Boolean(activeConnections.projector),
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
  ioInstance.to('room:admin').emit('radar:status', getRadarStatus());
}

function initSocket(server) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  io = new Server(server, {
    cors: {
      origin: [clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173', '*'],
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingInterval: 10000,
    pingTimeout: 10000
  });

  io.on('connection', async (socket) => {
    // 1. Role-based Room Joining & Presence
    socket.on('join:room', async ({ role, teamId, teamNumber, teamName, sessionToken }) => {
      socket.role = role;

      if (role === 'admin') {
        socket.join('room:admin');
        activeConnections.admins.add(socket.id);
        socket.emit('radar:status', getRadarStatus());
      } else if (role === 'projector') {
        socket.join('room:projector');
        activeConnections.projector = socket.id;
        broadcastRadar(io);
      } else if (role === 'team' && teamId) {
        socket.join('room:teams');
        socket.join(`team:${teamId}`);
        socket.teamId = teamId;

        // Verify single session token if provided
        if (sessionToken) {
          const team = await store.getTeamById(teamId);
          if (team && team.activeSessionToken && team.activeSessionToken !== sessionToken) {
            socket.emit('auth:session_revoked', {
              message: 'Your team account was opened on another phone.'
            });
            socket.disconnect();
            return;
          }
        }

        activeConnections.teams.set(teamId, {
          socketId: socket.id,
          teamName: teamName || `Team #${teamNumber}`,
          teamNumber: teamNumber || 0,
          connectedAt: Date.now(),
          latency: 0
        });

        await store.updateTeam(teamId, { isConnected: true, socketId: socket.id });
        broadcastRadar(io);
      }

      // Rehydrate client with current snapshot on join
      const state = await store.getEventState();
      const teams = await store.getTeams();
      const questions = await store.getQuestions();
      const activeQuestion = questions.find((q) => String(q._id) === String(state.activeQuestionId)) || questions[0];

      socket.emit('state:sync', {
        state,
        teams,
        activeQuestion,
        buzzer: getBuzzerStatus(),
        rapidFire: getRapidFireState(),
        radar: getRadarStatus()
      });
    });

    // 2. Ping / Pong Latency Measurement
    socket.on('ping:measure', (data) => {
      const now = Date.now();
      socket.emit('pong:measure', { sentAt: data?.sentAt || now, serverTime: now });

      if (socket.teamId && activeConnections.teams.has(socket.teamId)) {
        const teamInfo = activeConnections.teams.get(socket.teamId);
        teamInfo.latency = data?.sentAt ? now - data.sentAt : 0;
        broadcastRadar(io);
      }
    });

    // 3. Register Domain Handlers
    registerBuzzerHandlers(socket, io);
    registerStageHandlers(socket, io);
    registerRapidFireHandlers(socket, io);

    // 4. Disconnect Handler
    socket.on('disconnect', async () => {
      if (socket.role === 'admin') {
        activeConnections.admins.delete(socket.id);
      } else if (socket.role === 'projector' && activeConnections.projector === socket.id) {
        activeConnections.projector = null;
        broadcastRadar(io);
      } else if (socket.teamId) {
        activeConnections.teams.delete(socket.teamId);
        await store.updateTeam(socket.teamId, { isConnected: false, socketId: null });
        broadcastRadar(io);
      }
    });
  });

  return io;
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
  getRadarStatus
};
