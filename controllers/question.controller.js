const store = require('../utils/store');
const AppError = require('../utils/appError');

/**
 * Get all questions, optionally filtered by round
 * GET /api/v1/questions?round=BUZZER|AUDIO_VISUAL|RAPID_FIRE
 */
async function getQuestions(req, res, next) {
  try {
    const { round } = req.query;
    const filter = {};
    if (round) {
      filter.roundType = round.toUpperCase();
    }

    const questions = await store.getQuestions(filter);

    res.status(200).json({
      success: true,
      count: questions.length,
      data: questions
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get single question by ID
 * GET /api/v1/questions/:id
 */
async function getQuestionById(req, res, next) {
  try {
    const question = await store.getQuestionById(req.params.id);
    if (!question) {
      return next(new AppError('Question not found', 404));
    }

    res.status(200).json({
      success: true,
      data: question
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new question
 * POST /api/v1/questions
 */
async function createQuestion(req, res, next) {
  try {
    const {
      roundType,
      order,
      questionText,
      mediaType,
      mediaUrl,
      options,
      correctOptionIndex,
      points,
      negativePoints,
      timeLimitSeconds,
      explanation
    } = req.body;

    if (!roundType || !questionText) {
      return next(new AppError('roundType and questionText are required', 400));
    }

    const newQuestion = await store.createQuestion({
      roundType,
      order: Number(order) || 0,
      questionText,
      mediaType: mediaType || 'NONE',
      mediaUrl: mediaUrl || null,
      options: options || [],
      correctOptionIndex: Number(correctOptionIndex) || 0,
      points: Number(points) || 10,
      negativePoints: Number(negativePoints) || 0,
      timeLimitSeconds: Number(timeLimitSeconds) || 30,
      explanation: explanation || ''
    });

    res.status(201).json({
      success: true,
      data: newQuestion
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Bulk create questions
 * POST /api/v1/questions/bulk
 */
async function bulkCreateQuestions(req, res, next) {
  try {
    const { questions } = req.body;

    if (!Array.isArray(questions) || questions.length === 0) {
      return next(new AppError('Please provide an array of questions', 400));
    }

    const created = await store.bulkCreateQuestions(questions);

    res.status(201).json({
      success: true,
      count: created.length,
      data: created
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update a question
 * PUT /api/v1/questions/:id
 */
async function updateQuestion(req, res, next) {
  try {
    const question = await store.getQuestionById(req.params.id);
    if (!question) {
      return next(new AppError('Question not found', 404));
    }

    // In-memory or DB update
    const index = store.memoryStore.questions.findIndex((q) => String(q._id) === String(req.params.id));
    if (index !== -1) {
      store.memoryStore.questions[index] = {
        ...store.memoryStore.questions[index],
        ...req.body,
        updatedAt: new Date()
      };
    }

    res.status(200).json({
      success: true,
      data: store.memoryStore.questions[index] || question
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete a question
 * DELETE /api/v1/questions/:id
 */
async function deleteQuestion(req, res, next) {
  try {
    store.memoryStore.questions = store.memoryStore.questions.filter(
      (q) => String(q._id) !== String(req.params.id)
    );

    res.status(200).json({
      success: true,
      message: 'Question deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getQuestions,
  getQuestionById,
  createQuestion,
  bulkCreateQuestions,
  updateQuestion,
  deleteQuestion
};
