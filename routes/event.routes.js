const express = require('express');
const router = express.Router();
const eventController = require('../controllers/event.controller');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

router.get('/state', eventController.getState);
router.post('/reset', eventController.resetEvent);
router.post('/seed', eventController.seedEvent);

module.exports = router;
