const Quiz = require('../models/Quiz');
const AppError = require('../utils/appError');
const mongoose = require('mongoose');

// Helper to check DB connection before operations
function ensureDBConnected() {
  return mongoose.connection.readyState === 1;
}

// In-memory fallback if MongoDB is not running locally yet
let fallbackQuizzes = [
  {
    _id: 'sample-quiz-1',
    title: 'General Tech Trivia',
    description: 'A quick quiz testing fundamental web and engineering concepts.',
    code: 'TECH101',
    status: 'active',
    questions: [
      {
        text: 'What does REST stand for?',
        options: [
          'Representational State Transfer',
          'Realtime Event System Transport',
          'Remote Execution Server Transmission',
          'Reactive State Tree'
        ],
        correctOptionIndex: 0,
        points: 100,
        timeLimitSeconds: 20
      },
      {
        text: 'Which transport protocol is used by default in WebSocket connections?',
        options: ['UDP', 'TCP', 'SCTP', 'QUIC'],
        correctOptionIndex: 1,
        points: 100,
        timeLimitSeconds: 15
      }
    ],
    createdAt: new Date().toISOString()
  }
];

async function getAllQuizzes(req, res, next) {
  try {
    if (!ensureDBConnected()) {
      return res.status(200).json({
        success: true,
        data: fallbackQuizzes,
        error: null,
        meta: { note: 'Served from in-memory fallback (MongoDB not connected)' }
      });
    }

    const quizzes = await Quiz.find().lean();
    res.status(200).json({
      success: true,
      data: quizzes,
      error: null
    });
  } catch (error) {
    next(error);
  }
}

async function getQuizById(req, res, next) {
  try {
    const { id } = req.params;

    if (!ensureDBConnected()) {
      const quiz = fallbackQuizzes.find(q => q._id === id || q.code === id.toUpperCase());
      if (!quiz) {
        return next(new AppError('Quiz not found', 404));
      }
      return res.status(200).json({
        success: true,
        data: quiz,
        error: null
      });
    }

    let quiz = null;
    if (mongoose.isValidObjectId(id)) {
      quiz = await Quiz.findById(id).lean();
    } else {
      quiz = await Quiz.findOne({ code: id.toUpperCase() }).lean();
    }

    if (!quiz) {
      return next(new AppError('Quiz not found', 404));
    }

    res.status(200).json({
      success: true,
      data: quiz,
      error: null
    });
  } catch (error) {
    next(error);
  }
}

async function createQuiz(req, res, next) {
  try {
    const { title, description, code, questions } = req.body;

    if (!title) {
      return next(new AppError('Quiz title is required', 400));
    }

    if (!ensureDBConnected()) {
      const newQuiz = {
        _id: `sample-quiz-${Date.now()}`,
        title,
        description: description || '',
        code: (code || Math.random().toString(36).substring(2, 8)).toUpperCase(),
        status: 'draft',
        questions: questions || [],
        createdAt: new Date().toISOString()
      };
      fallbackQuizzes.push(newQuiz);
      return res.status(201).json({
        success: true,
        data: newQuiz,
        error: null
      });
    }

    const newQuiz = await Quiz.create({
      title,
      description,
      code: code ? code.toUpperCase() : Math.random().toString(36).substring(2, 8).toUpperCase(),
      questions: questions || []
    });

    res.status(201).json({
      success: true,
      data: newQuiz,
      error: null
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllQuizzes,
  getQuizById,
  createQuiz
};
