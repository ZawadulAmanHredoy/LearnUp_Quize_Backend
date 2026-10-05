const express = require('express');
const {
  getAllQuizzes,
  getQuizById,
  createQuiz
} = require('../controllers/quiz.controller');

const router = express.Router();

router.route('/')
  .get(getAllQuizzes)
  .post(createQuiz);

router.route('/:id')
  .get(getQuizById);

module.exports = router;
