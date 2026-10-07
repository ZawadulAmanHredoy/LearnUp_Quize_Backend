const store = require('../utils/store');
const mediaStore = require('../utils/mediaStore');
const AppError = require('../utils/appError');
const { normalizeQuestion, ROUND_TYPES } = require('../utils/questionRules');
const { ROOMS } = require('../socket/broadcast');
const { broadcastManifest } = require('../socket/mediaSync');

/**
 * Check the attached media exists and copy its type onto the question
 */
async function attachMedia(question) {
  if (!question.mediaId) return question;
  const asset = await mediaStore.getAsset(question.mediaId);
  if (!asset) throw new AppError('The selected media file no longer exists. Upload it again.', 400);
  return { ...question, mediaType: asset.mediaType };
}

/**
 * Tell every open admin tab the bank changed, and refresh the clip list
 * the admin and projector browsers keep downloaded
 */
async function announceChange(req) {
  if (!req.io) return;
  req.io.to(ROOMS.admin).emit('questions:updated', await store.getQuestions());
  await broadcastManifest(req.io);
}

/**
 * Get all questions, optionally filtered by round
 * GET /api/v1/questions?round=BUZZER|AUDIO_VISUAL|RAPID_FIRE
 */
async function getQuestions(req, res, next) {
  try {
    const filter = {};
    if (req.query.round) {
      const round = String(req.query.round).toUpperCase();
      if (!ROUND_TYPES.includes(round)) return next(new AppError(`round must be one of ${ROUND_TYPES.join(', ')}`, 400));
      filter.roundType = round;
    }

    const questions = await store.getQuestions(filter);
    res.status(200).json({ success: true, count: questions.length, data: questions });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/questions/:id
 */
async function getQuestionById(req, res, next) {
  try {
    const question = await store.getQuestionById(req.params.id);
    if (!question) return next(new AppError('Question not found', 404));
    res.status(200).json({ success: true, data: question });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/questions
 */
async function createQuestion(req, res, next) {
  try {
    const doc = await attachMedia(normalizeQuestion(req.body));
    if (!req.body.order) doc.order = 0; // appended to the end of its round
    const created = await store.createQuestion(doc);
    await announceChange(req);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/questions/:id (partial updates allowed)
 */
async function updateQuestion(req, res, next) {
  try {
    const existing = await store.getQuestionById(req.params.id);
    if (!existing) return next(new AppError('Question not found', 404));

    const doc = await attachMedia(normalizeQuestion(req.body, existing));
    const updated = await store.updateQuestion(req.params.id, doc);
    await announceChange(req);

    const state = store.peekEventState();
    const isLive = String(state.activeQuestionId) === String(existing._id);
    res.status(200).json({
      success: true,
      data: updated,
      ...(isLive ? { notice: 'This question is on stage now. Load it again to show the changes.' } : {})
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/questions/:id (refused for the question currently on stage)
 */
async function deleteQuestion(req, res, next) {
  try {
    const question = await store.getQuestionById(req.params.id);
    if (!question) return next(new AppError('Question not found', 404));

    const state = store.peekEventState();
    if (String(state.activeQuestionId) === String(question._id) && state.currentStage !== 'WELCOME') {
      return next(new AppError('This question is on stage right now. Load another question before deleting it.', 409));
    }

    await store.deleteQuestion(req.params.id);
    await announceChange(req);
    res.status(200).json({ success: true, message: 'Question deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * Set the running order of one round
 * PUT /api/v1/questions/reorder  { roundType, orderedIds: [...] }
 */
async function reorderQuestions(req, res, next) {
  try {
    const roundType = String(req.body.roundType || '').toUpperCase();
    if (!ROUND_TYPES.includes(roundType)) return next(new AppError('roundType is required', 400));
    if (!Array.isArray(req.body.orderedIds)) return next(new AppError('orderedIds must be an array', 400));

    const questions = await store.reorderQuestions(roundType, req.body.orderedIds);
    await announceChange(req);
    res.status(200).json({ success: true, data: questions });
  } catch (err) {
    next(err);
  }
}

/**
 * Import questions; every entry is validated before anything is saved
 * POST /api/v1/questions/bulk  { questions: [...] }
 */
async function bulkCreateQuestions(req, res, next) {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      return next(new AppError('Please provide an array of questions', 400));
    }
    if (questions.length > 500) return next(new AppError('Import at most 500 questions at a time', 400));

    const docs = [];
    const problems = [];
    for (const [idx, q] of questions.entries()) {
      try {
        const { _id, ...rest } = q || {};
        docs.push(await attachMedia(normalizeQuestion(rest)));
      } catch (err) {
        problems.push(`#${idx + 1}: ${err.message}`);
      }
    }
    if (problems.length > 0) {
      return next(new AppError(`Nothing was imported. Fix these questions: ${problems.slice(0, 10).join(' | ')}`, 400));
    }

    const created = await store.bulkCreateQuestions(docs);
    await announceChange(req);
    res.status(201).json({ success: true, count: created.length, data: created });
  } catch (err) {
    next(err);
  }
}

/**
 * Download the whole bank as JSON (backup / move to another database).
 * Media is referenced by id; the files stay in the media library.
 * GET /api/v1/questions/export
 */
async function exportQuestions(req, res, next) {
  try {
    const questions = await store.getQuestions();
    const data = questions.map(({ _id, __v, createdAt, updatedAt, ...q }) => q);
    res.setHeader('Content-Disposition', `attachment; filename="learnup-questions-${new Date().toISOString().slice(0, 10)}.json"`);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getQuestions,
  getQuestionById,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  bulkCreateQuestions,
  exportQuestions
};
