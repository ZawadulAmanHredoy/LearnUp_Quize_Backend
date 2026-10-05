const express = require('express');
const router = express.Router();
const { getMedia } = require('../controllers/media.controller');
const { requireAdmin } = require('../middleware/auth');

router.get('/', requireAdmin, getMedia);

module.exports = router;
