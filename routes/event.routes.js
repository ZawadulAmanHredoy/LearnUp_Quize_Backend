const express = require('express');
const router = express.Router();
const eventController = require('../controllers/event.controller');

router.get('/state', eventController.getState);
router.post('/reset', eventController.resetEvent);
router.post('/seed', eventController.seedEvent);

module.exports = router;
