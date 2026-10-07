const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const mongoose = require('mongoose');
const MediaAsset = require('../models/MediaAsset');
const AppError = require('./appError');

/**
 * Media for the audio-visual round.
 *
 * - With MongoDB connected, uploaded files are stored in the GridFS bucket
 *   "media" (bytes) plus a MediaAsset document (metadata).
 * - Every file is also kept in a local disk cache, and requests are always
 *   served from that cache, so playback never waits on the database. After a
 *   restart or redeploy the cache is rebuilt from GridFS.
 * - Without a database (development), the disk cache is the only copy.
 *
 * Asset ids are the first 24 hex chars of the file's SHA-256: identical files
 * share one asset and an id always refers to the same bytes, which lets
 * clients cache /media/:id forever.
 */

const CACHE_DIR = path.resolve(process.env.MEDIA_CACHE_DIR || path.join(__dirname, '..', 'media-cache'));
const MAX_UPLOAD_BYTES = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 200) * 1024 * 1024;
const BUCKET_NAME = 'media';

const FILE_TYPES = {
  '.mp4': { mediaType: 'VIDEO', contentType: 'video/mp4' },
  '.m4v': { mediaType: 'VIDEO', contentType: 'video/mp4' },
  '.webm': { mediaType: 'VIDEO', contentType: 'video/webm' },
  '.mov': { mediaType: 'VIDEO', contentType: 'video/quicktime' },
  '.mp3': { mediaType: 'AUDIO', contentType: 'audio/mpeg' },
  '.wav': { mediaType: 'AUDIO', contentType: 'audio/wav' },
  '.ogg': { mediaType: 'AUDIO', contentType: 'audio/ogg' },
  '.m4a': { mediaType: 'AUDIO', contentType: 'audio/mp4' },
  '.aac': { mediaType: 'AUDIO', contentType: 'audio/aac' },
  '.jpg': { mediaType: 'IMAGE', contentType: 'image/jpeg' },
  '.jpeg': { mediaType: 'IMAGE', contentType: 'image/jpeg' },
  '.png': { mediaType: 'IMAGE', contentType: 'image/png' },
  '.webp': { mediaType: 'IMAGE', contentType: 'image/webp' },
  '.gif': { mediaType: 'IMAGE', contentType: 'image/gif' }
};

// Assets kept in memory when no database is connected
const memoryAssets = new Map();
// In-flight cache rebuilds, so concurrent requests share one GridFS download
const cacheFills = new Map();

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

function getBucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
}

function isAssetId(id) {
  return typeof id === 'string' && /^[a-f0-9]{24}$/.test(id);
}

function detectFileType(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  const type = FILE_TYPES[ext];
  return type ? { ext, ...type } : null;
}

function cachePathFor(asset) {
  return path.join(CACHE_DIR, `${asset._id}${asset.ext}`);
}

async function ensureCacheDir() {
  await fsp.mkdir(CACHE_DIR, { recursive: true });
}

function toPublicAsset(asset) {
  if (!asset) return null;
  return {
    id: asset._id,
    originalName: asset.originalName,
    mediaType: asset.mediaType,
    contentType: asset.contentType,
    size: asset.size,
    createdAt: asset.createdAt,
    url: `/media/${asset._id}`
  };
}

async function getAsset(id) {
  if (!isAssetId(id)) return null;
  if (isDbConnected()) {
    return MediaAsset.findById(id).lean();
  }
  return memoryAssets.get(id) || null;
}

async function listAssets() {
  if (isDbConnected()) {
    return MediaAsset.find().sort({ createdAt: -1 }).lean();
  }
  return [...memoryAssets.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Write an incoming file stream to a temp file, hashing it on the way.
 * Rejects (and removes the temp file) when the size limit is hit.
 */
async function writeStreamToTemp(stream) {
  await ensureCacheDir();
  const tempPath = path.join(CACHE_DIR, `.upload-${crypto.randomUUID()}.part`);
  const hash = crypto.createHash('sha256');
  let size = 0;
  let truncated = false;

  // busboy emits 'limit' on the file stream when the size cap is reached
  stream.on('limit', () => {
    truncated = true;
  });
  const hasher = new Transform({
    transform(chunk, encoding, callback) {
      hash.update(chunk);
      size += chunk.length;
      callback(null, chunk);
    }
  });

  try {
    await pipeline(stream, hasher, fs.createWriteStream(tempPath));
  } catch (err) {
    await fsp.rm(tempPath, { force: true });
    throw err;
  }

  if (truncated) {
    await fsp.rm(tempPath, { force: true });
    throw new AppError(`File is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB upload limit`, 413);
  }
  if (size === 0) {
    await fsp.rm(tempPath, { force: true });
    throw new AppError('The uploaded file is empty', 400);
  }

  return { tempPath, size, sha256: hash.digest('hex') };
}

/**
 * Turn a completed temp file into a stored asset (disk cache + GridFS + metadata)
 */
async function ingestTempFile({ tempPath, size, sha256 }, { originalName, uploadedBy = null }) {
  const type = detectFileType(originalName);
  if (!type) {
    await fsp.rm(tempPath, { force: true });
    throw new AppError('Unsupported file type. Use MP4/WebM/MOV video, MP3/WAV/OGG/M4A audio, or JPG/PNG/WebP/GIF images.', 415);
  }

  const id = sha256.slice(0, 24);
  const existing = await getAsset(id);
  if (existing) {
    // Same bytes already stored: reuse it, but make sure the local copy exists
    await fsp.rm(tempPath, { force: true });
    await ensureCached(existing);
    return existing;
  }

  const asset = {
    _id: id,
    originalName: path.basename(String(originalName)).slice(0, 200),
    mediaType: type.mediaType,
    contentType: type.contentType,
    ext: type.ext,
    size,
    sha256,
    uploadedBy,
    createdAt: new Date()
  };

  const finalPath = cachePathFor(asset);
  await fsp.rename(tempPath, finalPath);

  if (isDbConnected()) {
    const bucket = getBucket();
    // A GridFS file without metadata is a leftover from an interrupted upload
    await bucket.delete(id).catch(() => {});
    try {
      await pipeline(
        fs.createReadStream(finalPath),
        bucket.openUploadStreamWithId(id, asset.originalName, {
          metadata: { contentType: asset.contentType, mediaType: asset.mediaType, sha256 }
        })
      );
      await MediaAsset.create(asset);
    } catch (err) {
      await bucket.delete(id).catch(() => {});
      await fsp.rm(finalPath, { force: true });
      throw err;
    }
  } else {
    memoryAssets.set(id, asset);
  }

  return asset;
}

async function saveUploadStream(stream, { originalName, uploadedBy }) {
  const temp = await writeStreamToTemp(stream);
  return ingestTempFile(temp, { originalName, uploadedBy });
}

async function importLocalFile(filePath, { uploadedBy = 'seed' } = {}) {
  const temp = await writeStreamToTemp(fs.createReadStream(filePath));
  return ingestTempFile(temp, { originalName: path.basename(filePath), uploadedBy });
}

/**
 * Make sure the asset is on local disk, downloading it from GridFS if needed.
 * Returns the local path.
 */
async function ensureCached(asset) {
  const filePath = cachePathFor(asset);
  try {
    const stat = await fsp.stat(filePath);
    if (stat.size === asset.size) return filePath;
  } catch (err) {}

  if (!isDbConnected()) {
    throw new AppError('Media file is missing from the server', 404);
  }

  if (!cacheFills.has(asset._id)) {
    const fill = (async () => {
      await ensureCacheDir();
      const tempPath = `${filePath}.${crypto.randomUUID()}.part`;
      try {
        await pipeline(getBucket().openDownloadStream(asset._id), fs.createWriteStream(tempPath));
        await fsp.rename(tempPath, filePath);
      } catch (err) {
        await fsp.rm(tempPath, { force: true });
        throw err;
      }
      return filePath;
    })().finally(() => cacheFills.delete(asset._id));
    cacheFills.set(asset._id, fill);
  }
  return cacheFills.get(asset._id);
}

/**
 * Download every stored asset into the local cache (run at startup)
 */
async function warmCache() {
  const assets = await listAssets();
  let fetched = 0;
  for (const asset of assets) {
    try {
      await ensureCached(asset);
      fetched += 1;
    } catch (err) {
      console.warn(`[Media] Could not cache ${asset.originalName} (${asset._id}): ${err.message}`);
    }
  }
  return { total: assets.length, cached: fetched };
}

async function deleteAsset(id) {
  const asset = await getAsset(id);
  if (!asset) return false;

  if (isDbConnected()) {
    await MediaAsset.deleteOne({ _id: id });
    await getBucket()
      .delete(id)
      .catch(() => {});
  } else {
    memoryAssets.delete(id);
  }
  await fsp.rm(cachePathFor(asset), { force: true });
  return true;
}

module.exports = {
  CACHE_DIR,
  MAX_UPLOAD_BYTES,
  isAssetId,
  detectFileType,
  toPublicAsset,
  getAsset,
  listAssets,
  saveUploadStream,
  importLocalFile,
  ensureCached,
  warmCache,
  deleteAsset
};
