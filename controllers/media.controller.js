const mediaGridFs = require('../utils/mediaGridFs');
const AppError = require('../utils/appError');

async function listMedia(req, res, next) {
  try {
    const files = await mediaGridFs.listDbMediaFiles();
    res.status(200).json({
      success: true,
      count: files.length,
      data: files
    });
  } catch (err) {
    next(err);
  }
}

async function streamMedia(req, res, next) {
  try {
    const filename = req.params.filename;
    const handled = await mediaGridFs.streamMediaFile(req, res, filename);
    if (!handled) {
      return next(new AppError('Media file not found', 404));
    }
  } catch (err) {
    next(err);
  }
}

async function uploadMedia(req, res, next) {
  try {
    const { filename, base64Data, contentType } = req.body;

    if (!filename || !base64Data) {
      return next(new AppError('Filename and base64Data are required', 400));
    }

    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const result = await mediaGridFs.uploadMediaFile(filename, buffer, contentType);

    res.status(201).json({
      success: true,
      data: result,
      message: `Media "${result.filename}" saved to database successfully`
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listMedia,
  streamMedia,
  uploadMedia
};
