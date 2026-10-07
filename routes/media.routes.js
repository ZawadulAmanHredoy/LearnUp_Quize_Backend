const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/media.controller');
const { requireAdmin } = require('../middleware/auth');

// Public streaming
router.get('/:filename', mediaController.streamMedia);

// Admin-only listing & uploading
router.get('/', requireAdmin, mediaController.listMedia);
router.post('/upload', requireAdmin, mediaController.uploadMedia);

module.exports = router;
