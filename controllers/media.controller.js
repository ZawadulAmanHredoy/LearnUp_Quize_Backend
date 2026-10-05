const store = require('../utils/store');
const { listMediaFiles, findMissingMedia } = require('../utils/media');

/**
 * Media files available for the AV round, and questions pointing at missing files
 * GET /api/v1/media
 */
async function getMedia(req, res, next) {
  try {
    const questions = await store.getQuestions();
    res.status(200).json({
      success: true,
      data: {
        files: listMediaFiles(),
        missing: findMissingMedia(questions)
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMedia };
