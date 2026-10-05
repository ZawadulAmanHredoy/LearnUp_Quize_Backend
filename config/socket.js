const { Server } = require('socket.io');

let io = null;

function initSocket(server) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  io = new Server(server, {
    cors: {
      origin: [clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingInterval: 25000,
    pingTimeout: 20000
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Heartbeat / ping
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Room management
    socket.on('join_room', ({ room, userName }) => {
      if (!room) return;
      socket.join(room);
      console.log(`[Socket.IO] ${userName || socket.id} joined room: ${room}`);
      io.to(room).emit('user_joined', {
        userId: socket.id,
        userName: userName || 'Anonymous',
        room,
        timestamp: Date.now()
      });
    });

    socket.on('leave_room', ({ room, userName }) => {
      if (!room) return;
      socket.leave(room);
      console.log(`[Socket.IO] ${userName || socket.id} left room: ${room}`);
      io.to(room).emit('user_left', {
        userId: socket.id,
        userName: userName || 'Anonymous',
        room,
        timestamp: Date.now()
      });
    });

    // Disconnect handler
    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected (${socket.id}): ${reason}`);
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
  getIO
};
