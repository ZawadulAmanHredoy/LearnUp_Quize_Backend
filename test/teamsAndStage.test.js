process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unused';
process.env.MEDIA_CACHE_DIR = require('path').join(require('os').tmpdir(), 'learnup-test-media-' + process.pid);

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io: ioClient } = require('socket.io-client');
const { server, initializeData } = require('../server');

let baseUrl;
let adminToken;
const openSockets = [];

function once(socket, event, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function api(path, { method = 'GET', body, token = adminToken } = {}) {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() };
}

async function joinAdmin() {
  const socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false });
  openSockets.push(socket);
  await once(socket, 'connect');
  const synced = once(socket, 'state:sync');
  socket.emit('join:room', { role: 'admin', token: adminToken });
  await synced;
  return socket;
}

async function eventState() {
  const { json } = await api('/event/state');
  return json.data;
}

async function findTeam(teamNumber) {
  const { json } = await api('/teams');
  return json.data.find((t) => t.teamNumber === teamNumber);
}

before(async () => {
  await initializeData();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const { json } = await api('/auth/admin/login', {
    method: 'POST',
    token: null,
    body: {
      username: process.env.ADMIN_USERNAME || 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123'
    }
  });
  adminToken = json.data.token;
});

after(async () => {
  openSockets.forEach((s) => s.disconnect());
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
});

test('teams log in with their Team ID (any case) or team number', async () => {
  const byId = await api('/auth/team/login', { method: 'POST', token: null, body: { teamId: 't-02', pin: '1002' } });
  assert.equal(byId.status, 200, JSON.stringify(byId.json));
  assert.equal(byId.json.data.team.teamNumber, 2);
  assert.equal(byId.json.data.team.teamId, 'T-02');

  const byNumber = await api('/auth/team/login', { method: 'POST', token: null, body: { teamNumber: 3, pin: '1003' } });
  assert.equal(byNumber.status, 200);
  assert.equal(byNumber.json.data.team.teamId, 'T-03');

  const unknown = await api('/auth/team/login', { method: 'POST', token: null, body: { teamId: 'T-99', pin: '1' } });
  assert.equal(unknown.status, 404);
});

test('team numbers and Team IDs must stay unique', async () => {
  const created = await api('/teams', {
    method: 'POST',
    body: { teamName: 'Omega', teamNumber: 7, institution: 'BUFT', teamLead: 'Lead Omega', pin: '1007' }
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.data.teamId, 'T-07', 'a Team ID is generated from the number');

  const sameId = await api('/teams', { method: 'POST', body: { teamName: 'X', teamNumber: 8, teamId: 't-07', pin: '1' } });
  assert.equal(sameId.status, 409);

  const team1 = await findTeam(1);
  const clashNumber = await api(`/teams/${team1._id}`, { method: 'PUT', body: { teamNumber: 2 } });
  assert.equal(clashNumber.status, 409);
  const clashId = await api(`/teams/${team1._id}`, { method: 'PUT', body: { teamId: 'T-03' } });
  assert.equal(clashId.status, 409);

  const ok = await api(`/teams/${team1._id}`, { method: 'PUT', body: { teamLead: '  Rahim  ', institution: 'BUFT' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.data.teamLead, 'Rahim');
});

test('manual score corrections: delta, round overwrite, validation, no leaked tokens', async () => {
  const team = await findTeam(4);
  const admin = await joinAdmin();

  const leaderboard = once(admin, 'leaderboard:update');
  const plus = await api(`/teams/${team._id}/adjust-score`, { method: 'POST', body: { delta: 15, roundType: 'audioVisual' } });
  assert.equal(plus.status, 200, JSON.stringify(plus.json));
  assert.equal(plus.json.data.score, 15);
  assert.equal(plus.json.data.roundScores.audioVisual, 15);
  await leaderboard;
  for (const t of plus.json.teams) {
    assert.equal(t.activeSessionToken, undefined);
    assert.equal(t.socketId, undefined);
  }

  const overwrite = await api(`/teams/${team._id}/score`, { method: 'PUT', body: { roundScores: { buzzer: 20, rapidFire: 5 } } });
  assert.equal(overwrite.status, 200);
  assert.deepEqual(
    { ...overwrite.json.data.roundScores },
    { buzzer: 20, audioVisual: 15, rapidFire: 5 },
    'round scores not given are kept'
  );
  assert.equal(overwrite.json.data.score, 40, 'the total follows the round scores');

  for (const body of [{ delta: 'abc' }, { score: '' }, { roundScores: { buzzer: 'x' } }, {}]) {
    const bad = await api(`/teams/${team._id}/score`, { method: 'PUT', body });
    assert.equal(bad.status, 400, `should reject ${JSON.stringify(body)}`);
  }
  assert.equal((await findTeam(4)).score, 40, 'rejected updates change nothing');

  const viaSocket = once(admin, 'leaderboard:update');
  admin.emit('admin:update-team-score', { teamId: team._id, delta: -10, roundType: 'buzzer' });
  const teams = await viaSocket;
  assert.equal(teams.find((t) => t.teamNumber === 4).score, 30);
});

test('welcome screen settings keep only known fields', async () => {
  const admin = await joinAdmin();
  const updated = once(admin, 'welcome:updated');
  admin.emit('admin:update-welcome', {
    welcomeConfig: { title: 'BUFT Quiz Night', showQr: 0, injected: '<script>', badgeText: 'x'.repeat(500) }
  });
  const config = await updated;
  assert.equal(config.title, 'BUFT Quiz Night');
  assert.equal(config.showQr, false);
  assert.equal(config.showTeams, true, 'fields not sent keep their value');
  assert.equal(config.badgeText.length, 60);
  assert.equal(config.injected, undefined);
  assert.equal((await eventState()).state.welcomeConfig.title, 'BUFT Quiz Night');
});

test('switching to a round puts that round\'s first question on stage', async () => {
  const admin = await joinAdmin();
  const changed = once(admin, 'stage:updated');
  admin.emit('admin:set-stage', { stage: 'ROUND_RAPID_FIRE' });
  const payload = await changed;
  assert.equal(payload.activeQuestion.roundType, 'RAPID_FIRE');
  assert.equal(payload.activeQuestion.order, 1);
});

test('mute and seek do not mark a playing clip as paused', async () => {
  const admin = await joinAdmin();
  for (const [action, expected] of [['play', true], ['mute', true], ['seek', true], ['pause', false], ['unmute', false]]) {
    const synced = once(admin, 'media:sync');
    admin.emit('admin:media-control', { action, time: 3 });
    const { mediaSubState } = await synced;
    assert.equal(mediaSubState.isPlaying, expected, `after ${action}`);
  }
});

test('a whole round can be deleted, but not while it is on stage', async () => {
  const admin = await joinAdmin();
  const changed = once(admin, 'stage:updated');
  admin.emit('admin:set-stage', { stage: 'ROUND_BUZZER' });
  await changed;

  const refused = await api('/questions/round/BUZZER', { method: 'DELETE' });
  assert.equal(refused.status, 409);

  const badRound = await api('/questions/round/NOPE', { method: 'DELETE' });
  assert.equal(badRound.status, 400);

  const before = (await api('/questions?round=RAPID_FIRE')).json.count;
  assert.ok(before > 0);
  const deleted = await api('/questions/round/rapid_fire', { method: 'DELETE' });
  assert.equal(deleted.status, 200, JSON.stringify(deleted.json));
  assert.equal(deleted.json.count, before);
  assert.equal((await api('/questions?round=RAPID_FIRE')).json.count, 0);
  assert.ok((await api('/questions?round=BUZZER')).json.count > 0, 'other rounds are untouched');
});
