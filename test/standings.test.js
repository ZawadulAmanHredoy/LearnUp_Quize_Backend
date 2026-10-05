const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeStandings } = require('../socket/stageHandler');

test('a single leader is crowned champion', () => {
  const result = computeStandings([
    { teamName: 'A', score: 10 },
    { teamName: 'B', score: 25 },
    { teamName: 'C', score: -5 }
  ]);
  assert.equal(result.isTie, false);
  assert.equal(result.champion.teamName, 'B');
  assert.deepEqual(result.standings.map((t) => t.teamName), ['B', 'A', 'C']);
});

test('a tie for first triggers sudden death instead of a champion (Rules.md §5.1)', () => {
  const result = computeStandings([
    { teamName: 'A', score: 30 },
    { teamName: 'B', score: 30 },
    { teamName: 'C', score: 12 }
  ]);
  assert.equal(result.isTie, true);
  assert.equal(result.champion, null);
  assert.deepEqual(result.tiedTeams.map((t) => t.teamName).sort(), ['A', 'B']);
});
