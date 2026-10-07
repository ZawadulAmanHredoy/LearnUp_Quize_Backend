const busboy = require('busboy');
const store = require('../utils/store');
const mediaStore = require('../utils/mediaStore');
const AppError = require('../utils/appError');
const { buildManifest, broadcastManifest } = require('../socket/mediaSync');

/**
 * Upload one clip as multipart/form-data, field name "file"
 * POST /api/v1/media
 */
function uploadMedia(req, res, next) {
  if (!req.is('multipart/form-data')) {
    return next(new AppError('Send the file as multipart/form-data in a field named "file"', 400));
  }

  let parser;
  try {
    parser = busboy({ headers: req.headers, limits: { files: 1, fileSize: mediaStore.MAX_UPLOAD_BYTES } });
  } catch (err) {
    return next(new AppError('Invalid upload request', 400));
  }

  let upload = null;
  let rejection = null;

  parser.on('file', (fieldName, file, info) => {
    if (fieldName !== 'file' || upload) {
      file.resume();
      return;
    }
    if (!mediaStore.detectFileType(info.filename)) {
      rejection = new AppError(
        'Unsupported file type. Use MP4/WebM/MOV video, MP3/WAV/OGG/M4A audio, or JPG/PNG/WebP/GIF images.',
        415
      );
      file.resume();
      return;
    }
    upload = mediaStore.saveUploadStream(file, {
      originalName: info.filename,
      uploadedBy: req.admin?.username || null
    });
    // Avoid an unhandled rejection before 'close' awaits it
    upload.catch(() => {});
  });

  parser.on('close', async () => {
    try {
      if (rejection) throw rejection;
      if (!upload) throw new AppError('No file received (field name must be "file")', 400);
      const asset = await upload;
      res.status(201).json({ success: true, data: mediaStore.toPublicAsset(asset) });
    } catch (err) {
      next(err);
    }
  });

  parser.on('error', () => next(new AppError('Upload failed', 400)));
  req.pipe(parser);
}

/**
 * Media library with how many questions use each file
 * GET /api/v1/media
 */
async function listMedia(req, res, next) {
  try {
    const assets = await mediaStore.listAssets();
    const data = [];
    for (const asset of assets) {
      data.push({ ...mediaStore.toPublicAsset(asset), usedBy: await store.countQuestionsUsingMedia(asset._id) });
    }
    res.status(200).json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
}

/**
 * Clips the audio-visual round needs, for pre-downloading
 * GET /api/v1/media/manifest
 */
async function getManifest(req, res, next) {
  try {
    res.status(200).json({ success: true, data: await buildManifest() });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/media/:id (refused while a question uses it)
 */
async function deleteMedia(req, res, next) {
  try {
    const asset = await mediaStore.getAsset(req.params.id);
    if (!asset) return next(new AppError('Media not found', 404));

    const usedBy = await store.countQuestionsUsingMedia(asset._id);
    if (usedBy > 0) {
      return next(new AppError(`This file is used by ${usedBy} question(s). Change those questions first.`, 409));
    }

    await mediaStore.deleteAsset(asset._id);
    await broadcastManifest(req.io);
    res.status(200).json({ success: true, message: 'Media deleted' });
  } catch (err) {
    next(err);
  }
}

/**
 * Stream a clip from the server's local copy, with range support for
 * seeking. Ids are content hashes, so the response can be cached forever.
 * GET /media/:id
 */
async function serveMedia(req, res, next) {
  try {
    const asset = await mediaStore.getAsset(req.params.id);
    if (!asset) return next(new AppError('Media not found', 404));

    const filePath = await mediaStore.ensureCached(asset);
    res.sendFile(filePath, {
      acceptRanges: true,
      headers: {
        'Content-Type': asset.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff'
      }
    }, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadMedia,
  listMedia,
  getManifest,
  deleteMedia,
  serveMedia
};
