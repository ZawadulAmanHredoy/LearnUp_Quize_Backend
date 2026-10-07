const express = require('express');
const router = express.Router();
const questionController = require('../controllers/question.controller');
const { requireAdmin } = require('../middleware/auth');
const { requirePersistentStore } = require('../middleware/persistence');

// Every question carries its answer key, so the whole bank is admin-only
router.use(requireAdmin);

router.get('/', questionController.getQuestions);
router.get('/export', questionController.exportQuestions);
router.post('/', requirePersistentStore, questionController.createQuestion);
router.post('/bulk', requirePersistentStore, questionController.bulkCreateQuestions);
router.put('/reorder', requirePersistentStore, questionController.reorderQuestions);
router.get('/:id', questionController.getQuestionById);
router.put('/:id', requirePersistentStore, questionController.updateQuestion);
router.delete('/:id', requirePersistentStore, questionController.deleteQuestion);

module.exports = router;
