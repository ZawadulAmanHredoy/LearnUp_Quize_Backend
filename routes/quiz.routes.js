const express = require('express');
const {
  getAllQuizzes,
  getQuizById,
  createQuiz
} = require('../controllers/quiz.controller');

const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.route('/')
  .get(getAllQuizzes)
  .post(requireAdmin, createQuiz);

router.route('/:id')
  .get(getQuizById);

module.exports = router;
