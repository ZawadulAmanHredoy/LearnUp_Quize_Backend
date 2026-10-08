require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { initSocket, hydrateRealtimeState } = require('./config/socket');
const store = require('./utils/store');
const mediaStore = require('./utils/mediaStore');
const { seedQuestionsIfEmpty, migrateLegacyMediaUrls } = require('./utils/questionSeed');
const { serveMedia } = require('./controllers/media.controller');
const apiRoutes = require('./routes/api.routes');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/appError');

const path = require('path');
const app = express();
const server = http.createServer(app);

// 1. Basic Middleware & Security
app.use(helmet({
  contentSecurityPolicy: false, // Allows easy integration with dev tools and socket.io
  // The projector page (port 5173) plays clips served from this server (port 5000)
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS: teams' phones reach the frontend via the host laptop's LAN IP
// (e.g. http://192.168.1.100:5173), which isn't known ahead of time.
// Auth uses bearer tokens, not cookies, so allowing any origin is safe.
// Set CLIENT_URL (comma-separated) to restrict it.
const configuredOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin = process.env.CORS_RESTRICT === 'true' && configuredOrigins.length > 0 ? configuredOrigins : true;

app.use(cors({ origin: corsOrigin }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// 2. Initialize Socket.IO
const io = initSocket(server, { corsOrigin });

// Make io accessible in requests if needed
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Audio-visual clips, streamed from the server's local copy (range requests supported)
app.get('/media/:id', serveMedia);

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

/**
 * Seed and restore everything the live event needs. Safe to call more than once.
 */
async function initializeData() {
  await store.seedDatabaseIfEmpty();
  await seedQuestionsIfEmpty();
  await migrateLegacyMediaUrls();
  await hydrateRealtimeState();
}

async function startServer() {
  await connectDB();
  await initializeData();

  if (!process.env.ADMIN_PASSWORD) {
    console.warn('⚠️  [Auth] ADMIN_PASSWORD not set: default admin login is admin / admin123. Set it in .env before the event.');
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [Server] Running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`);
    console.log(`🔌 [Socket.IO] Realtime socket ready on port ${PORT}`);
  });

  // Rebuild the local copy of every clip from MongoDB (after a redeploy the
  // disk starts empty), so playback never has to wait on the database
  mediaStore
    .warmCache()
    .then(({ total, cached }) => total && console.log(`🎬 [Media] ${cached}/${total} clips ready on local disk`))
    .catch((err) => console.warn('[Media] Cache warm-up failed:', err.message));
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

module.exports = { app, server, initializeData };
