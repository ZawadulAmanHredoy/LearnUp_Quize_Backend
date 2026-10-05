const express = require('express');
const router = express.Router();
const teamController = require('../controllers/team.controller');
const { requireAdmin, optionalAdmin } = require('../middleware/auth');

// Public listing returns names and scores only; PINs need an admin token
router.get('/', optionalAdmin, teamController.getTeams);
router.post('/', requireAdmin, teamController.createTeam);
router.post('/reset-scores', requireAdmin, teamController.resetScores);
router.put('/:id', requireAdmin, teamController.updateTeam);
router.delete('/:id', requireAdmin, teamController.deleteTeam);
router.post('/:id/reset-session', requireAdmin, teamController.resetTeamSession);

module.exports = router;
