const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const rateLimit = require('../middleware/rateLimit');

const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

router.post('/admin/login', loginLimiter, authController.adminLogin);
router.post('/team/login', loginLimiter, authController.teamLogin);
router.post('/team/logout', authController.teamLogout);
router.get('/me', authController.getMe);

module.exports = router;
