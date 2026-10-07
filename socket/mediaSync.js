const store = require('../utils/store');
const mediaStore = require('../utils/mediaStore');
const { ROOMS } = require('./broadcast');

// Latest download progress reported by each connected projector, by socket id
const projectorStatuses = new Map();

/**
 * Every clip the audio-visual round uses. Admin and projector browsers
 * download all of these ahead of the round so playback never buffers.
 */
async function buildManifest() {
  const questions = await store.getQuestions({ roundType: 'AUDIO_VISUAL' });
  const items = new Map();
  for (const q of questions) {
    if (!q.mediaId) continue;
    if (!items.has(q.mediaId)) {
      const asset = await mediaStore.getAsset(q.mediaId);
      if (!asset) continue;
      items.set(q.mediaId, { ...mediaStore.toPublicAsset(asset), questionIds: [] });
    }
    items.get(q.mediaId).questionIds.push(String(q._id));
  }
  const list = [...items.values()];
  return {
    items: list,
    totalBytes: list.reduce((sum, item) => sum + item.size, 0),
    generatedAt: Date.now()
  };
}

function getProjectorStatuses() {
  return [...projectorStatuses.entries()].map(([socketId, status]) => ({ socketId, ...status }));
}

function emitProjectorStatuses(io) {
  io.to(ROOMS.admin).emit('media:projector-status', getProjectorStatuses());
}

async function broadcastManifest(io) {
  if (!io) return;
  const manifest = await buildManifest();
  io.to(ROOMS.admin).to(ROOMS.projector).emit('media:manifest', manifest);
}

function sanitizeStatus(data = {}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const items = {};
  if (data.items && typeof data.items === 'object') {
    for (const [id, state] of Object.entries(data.items).slice(0, 500)) {
      if (mediaStore.isAssetId(id) && ['ready', 'downloading', 'error', 'pending'].includes(state)) {
        items[id] = state;
      }
    }
  }
  return {
    ready: num(data.ready),
    total: num(data.total),
    bytesDone: num(data.bytesDone),
    bytesTotal: num(data.bytesTotal),
    items,
    updatedAt: Date.now()
  };
}

function registerMediaSyncHandlers(socket, io, { onAdmin }) {
  // Admin logged in (or pressed "Re-download"): every projector re-checks its clips
  // { force: true } makes projectors delete their copies and download again
  onAdmin('admin:media-preload', async ({ force = false } = {}) => {
    const manifest = await buildManifest();
    io.to(ROOMS.projector).emit('media:preload', { ...manifest, force: Boolean(force) });
  });

  socket.on('projector:media-status', (data) => {
    if (socket.data.role !== 'projector') return;
    projectorStatuses.set(socket.id, sanitizeStatus(data));
    emitProjectorStatuses(io);
  });

  socket.on('disconnect', () => {
    if (projectorStatuses.delete(socket.id)) emitProjectorStatuses(io);
  });
}

/**
 * Send the manifest (and, for admins, projector progress) to a client that just joined
 */
async function sendMediaStateOnJoin(socket, role) {
  if (role !== 'admin' && role !== 'projector') return;
  socket.emit('media:manifest', await buildManifest());
  if (role === 'admin') socket.emit('media:projector-status', getProjectorStatuses());
}

module.exports = {
  buildManifest,
  broadcastManifest,
  registerMediaSyncHandlers,
  sendMediaStateOnJoin
};
