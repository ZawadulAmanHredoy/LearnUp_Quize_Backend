const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/admin/login', authController.adminLogin);
router.post('/team/login', authController.teamLogin);
router.post('/team/logout', authController.teamLogout);
router.get('/me', authController.getMe);

module.exports = router;
