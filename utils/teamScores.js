const store = require('./store');
const AppError = require('./appError');

const ROUND_KEYS = ['buzzer', 'audioVisual', 'rapidFire'];

function toScore(value, field) {
  const num = Number(value);
  if (value === null || value === '' || !Number.isFinite(num)) {
    throw new AppError(`${field} must be a number`, 400);
  }
  return num;
}

/**
 * Manual score correction by the admin, either:
 *  - { delta, roundType }       add/subtract points (roundType defaults to buzzer)
 *  - { roundScores, score? }    overwrite round scores; the total follows them unless given
 *  - { score }                  overwrite the total only
 * Returns the updated team.
 */
async function applyManualScore(teamId, { score, roundScores, delta, roundType } = {}) {
  const team = await store.getTeamById(teamId);
  if (!team) throw new AppError('Team not found', 404);

  if (delta !== undefined) {
    return store.adjustTeamScore(teamId, toScore(delta, 'delta'), roundType || 'buzzer');
  }

  const updates = {};
  if (roundScores && typeof roundScores === 'object') {
    updates.roundScores = {};
    for (const key of ROUND_KEYS) {
      updates.roundScores[key] = roundScores[key] !== undefined
        ? toScore(roundScores[key], `roundScores.${key}`)
        : Number(team.roundScores?.[key] || 0);
    }
    updates.score = ROUND_KEYS.reduce((sum, key) => sum + updates.roundScores[key], 0);
  }
  if (score !== undefined) updates.score = toScore(score, 'score');

  if (Object.keys(updates).length === 0) {
    throw new AppError('Provide delta, score, or roundScores', 400);
  }
  return store.updateTeam(teamId, updates);
}

module.exports = { applyManualScore };
