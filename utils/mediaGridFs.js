const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MEDIA_DIR = path.join(__dirname, '..', 'public', 'media');

let gridFSBucket = null;

function getBucket() {
  if (mongoose.connection.readyState === 1) {
    if (!gridFSBucket || gridFSBucket.db !== mongoose.connection.db) {
      gridFSBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: 'media'
      });
    }
    return gridFSBucket;
  }
  return null;
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Sync files from public/media/ into MongoDB GridFS so all audio/video
 * files live natively inside the database.
 */
async function syncDiskMediaToDb() {
  const bucket = getBucket();
  if (!bucket) return false;

  try {
    if (!fs.existsSync(MEDIA_DIR)) {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
    }

    const diskFiles = fs.readdirSync(MEDIA_DIR);
    for (const filename of diskFiles) {
      const filePath = path.join(MEDIA_DIR, filename);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;

      // Check if file already exists in GridFS
      const existing = await bucket.find({ filename }).toArray();
      if (existing.length === 0) {
        console.log(`[MediaDB] Migrating ${filename} to MongoDB GridFS...`);
        const uploadStream = bucket.openUploadStream(filename, {
          contentType: getContentType(filename),
          metadata: { size: stat.size, originalName: filename, uploadedAt: new Date() }
        });

        await new Promise((resolve, reject) => {
          fs.createReadStream(filePath)
            .pipe(uploadStream)
            .on('finish', resolve)
            .on('error', reject);
        });
        console.log(`[MediaDB] ✅ ${filename} stored in database (${(stat.size / 1024).toFixed(1)} KB)`);
      }
    }
    return true;
  } catch (err) {
    console.warn('[MediaDB] Media sync notice:', err.message);
    return false;
  }
}

/**
 * Upload a media buffer directly to MongoDB GridFS
 */
async function uploadMediaFile(filename, buffer, contentType) {
  const bucket = getBucket();
  if (!bucket) throw new Error('Database is not connected');

  const cleanName = path.basename(filename);
  const type = contentType || getContentType(cleanName);

  // Remove existing file with the same name if any
  const existing = await bucket.find({ filename: cleanName }).toArray();
  for (const f of existing) {
    await bucket.delete(f._id).catch(() => {});
  }

  const uploadStream = bucket.openUploadStream(cleanName, {
    contentType: type,
    metadata: { size: buffer.length, originalName: cleanName, uploadedAt: new Date() }
  });

  await new Promise((resolve, reject) => {
    uploadStream.end(buffer, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Also save a copy in public/media as a fast fallback cache
  try {
    const destPath = path.join(MEDIA_DIR, cleanName);
    fs.writeFileSync(destPath, buffer);
  } catch (e) {}

  return {
    filename: cleanName,
    size: buffer.length,
    contentType: type,
    mediaUrl: `/media/${cleanName}`
  };
}

/**
 * List all media files stored in GridFS
 */
async function listDbMediaFiles() {
  const bucket = getBucket();
  if (!bucket) {
    // Return disk files if DB is offline
    if (fs.existsSync(MEDIA_DIR)) {
      return fs.readdirSync(MEDIA_DIR).map((f) => ({
        filename: f,
        contentType: getContentType(f),
        mediaUrl: `/media/${f}`
      }));
    }
    return [];
  }

  try {
    const files = await bucket.find().sort({ uploadDate: -1 }).toArray();
    return files.map((f) => ({
      _id: f._id,
      filename: f.filename,
      contentType: f.contentType || getContentType(f.filename),
      size: f.length,
      uploadDate: f.uploadDate,
      mediaUrl: `/media/${f.filename}`
    }));
  } catch (err) {
    console.warn('[MediaDB] List media failed:', err.message);
    return [];
  }
}

/**
 * Stream media file from GridFS with HTTP 206 Range Request support
 * Allows video players and audio players to seek seamlessly.
 */
async function streamMediaFile(req, res, filename) {
  const bucket = getBucket();
  const cleanName = path.basename(filename);

  if (bucket) {
    try {
      const files = await bucket.find({ filename: cleanName }).toArray();
      if (files.length > 0) {
        const file = files[0];
        const fileSize = file.length;
        const contentType = file.contentType || getContentType(cleanName);
        const range = req.headers.range;

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

          if (start >= fileSize || end >= fileSize) {
            res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
            return res.end();
          }

          const chunksize = end - start + 1;
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': chunksize,
            'Content-Type': contentType
          });

          const downloadStream = bucket.openDownloadStreamByName(cleanName, {
            start,
            end: end + 1
          });
          downloadStream.pipe(res);
          return true;
        } else {
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': contentType
          });

          const downloadStream = bucket.openDownloadStreamByName(cleanName);
          downloadStream.pipe(res);
          return true;
        }
      }
    } catch (err) {
      console.warn(`[MediaDB] GridFS stream for ${cleanName} failed:`, err.message);
    }
  }

  // Fallback to disk if file exists in public/media/
  const diskPath = path.join(MEDIA_DIR, cleanName);
  if (fs.existsSync(diskPath)) {
    const stat = fs.statSync(diskPath);
    const fileSize = stat.size;
    const contentType = getContentType(cleanName);
    const range = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      const chunksize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunksize,
        'Content-Type': contentType
      });

      fs.createReadStream(diskPath, { start, end }).pipe(res);
      return true;
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType
      });
      fs.createReadStream(diskPath).pipe(res);
      return true;
    }
  }

  return false;
}

module.exports = {
  getBucket,
  getContentType,
  syncDiskMediaToDb,
  uploadMediaFile,
  listDbMediaFiles,
  streamMediaFile,
  MEDIA_DIR
};
