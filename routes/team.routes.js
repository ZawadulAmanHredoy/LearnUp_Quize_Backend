const express = require('express');
const router = express.Router();
const teamController = require('../controllers/team.controller');

router.get('/', teamController.getTeams);
router.post('/', teamController.createTeam);
router.put('/:id', teamController.updateTeam);
router.delete('/:id', teamController.deleteTeam);
router.post('/:id/reset-session', teamController.resetTeamSession);
router.post('/reset-scores', teamController.resetScores);

module.exports = router;
