const express = require('express');
const healthRoutes = require('./health.routes');
const quizRoutes = require('./quiz.routes');

const router = express.Router();

router.use('/', healthRoutes);
router.use('/quizzes', quizRoutes);

module.exports = router;
