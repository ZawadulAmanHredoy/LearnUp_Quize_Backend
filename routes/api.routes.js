const express = require('express');
const healthRoutes = require('./health.routes');
const quizRoutes = require('./quiz.routes');
const authRoutes = require('./auth.routes');
const questionRoutes = require('./question.routes');
const teamRoutes = require('./team.routes');
const eventRoutes = require('./event.routes');

const router = express.Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/questions', questionRoutes);
router.use('/teams', teamRoutes);
router.use('/event', eventRoutes);
router.use('/quizzes', quizRoutes); // Backwards compatibility

module.exports = router;
