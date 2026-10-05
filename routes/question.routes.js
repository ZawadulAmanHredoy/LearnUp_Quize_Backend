const express = require('express');
const router = express.Router();
const questionController = require('../controllers/question.controller');
const { requireAdmin } = require('../middleware/auth');

// Every question carries its answer key, so the whole bank is admin-only
router.use(requireAdmin);

router.get('/', questionController.getQuestions);
router.get('/:id', questionController.getQuestionById);
router.post('/', questionController.createQuestion);
router.post('/bulk', questionController.bulkCreateQuestions);
router.put('/:id', questionController.updateQuestion);
router.delete('/:id', questionController.deleteQuestion);

module.exports = router;
