const express = require('express');
const router = express.Router();
const questionController = require('../controllers/question.controller');

router.get('/', questionController.getQuestions);
router.get('/:id', questionController.getQuestionById);
router.post('/', questionController.createQuestion);
router.post('/bulk', questionController.bulkCreateQuestions);
router.put('/:id', questionController.updateQuestion);
router.delete('/:id', questionController.deleteQuestion);

module.exports = router;
