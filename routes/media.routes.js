const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/media.controller');
const { requireAdmin } = require('../middleware/auth');
const { requirePersistentStore } = require('../middleware/persistence');

router.use(requireAdmin);

router.get('/', mediaController.listMedia);
router.get('/manifest', mediaController.getManifest);
router.post('/', requirePersistentStore, mediaController.uploadMedia);
router.delete('/:id', requirePersistentStore, mediaController.deleteMedia);

module.exports = router;
