require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { initSocket } = require('./config/socket');
const apiRoutes = require('./routes/api.routes');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/appError');

const path = require('path');
const app = express();
const server = http.createServer(app);

// 1. Basic Middleware & Security
app.use(helmet({
  contentSecurityPolicy: false // Allows easy integration with dev tools and socket.io
}));

// Static media and assets
app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(path.join(__dirname, 'public/media')));

const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// 2. Initialize Socket.IO
const io = initSocket(server);

// Make io accessible in requests if needed
app.use((req, res, next) => {
  req.io = io;
  next();
});

// 3. API Routes
app.use('/api/v1', apiRoutes);
app.use('/api', apiRoutes); // Convenience alias

// Root health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'LearnUp Quiz API Server is running',
    version: '1.0.0'
  });
});

// 4. 404 Handler
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

// 5. Centralized Error Handler
app.use(errorHandler);

// 6. Server Initialization & Database Connection
const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDB();

  server.listen(PORT, () => {
    console.log(`🚀 [Server] Running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`);
    console.log(`🔌 [Socket.IO] Realtime socket ready on port ${PORT}`);
  });
}

// 7. Graceful Shutdown
function handleShutdown(signal) {
  console.log(`\n🛑 [Shutdown] Received ${signal}. Closing server gracefully...`);
  server.close(async () => {
    console.log('🔌 [Server] HTTP and Socket server closed.');
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🗄️ [Database] MongoDB connection closed.');
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error('⚠️ [Shutdown] Forcefully terminating process after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

if (require.main === module) {
  startServer();
}

module.exports = { app, server };
