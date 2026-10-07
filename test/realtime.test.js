process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unused';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io: ioClient } = require('socket.io-client');
const { server } = require('../server');

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

function connect() {
  const socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false });
  openSockets.push(socket);
  return socket;
}

async function api(path, { method = 'GET', body, token } = {}) {
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

async function joinAs(role, token) {
  const socket = connect();
  await once(socket, 'connect');
  const synced = once(socket, 'state:sync');
  socket.emit('join:room', { role, token });
  const snapshot = await synced;
  return { socket, snapshot };
}

async function teamLogin(teamNumber, pin) {
  const { status, json } = await api('/auth/team/login', { method: 'POST', body: { teamNumber, pin } });
  assert.equal(status, 200, JSON.stringify(json));
  return json.data;
}

async function loadBuzzerQuestion(admin, index = 0) {
  const { json } = await api('/questions?round=BUZZER', { token: adminToken });
  const question = json.data[index];
  const presented = once(admin, 'question:presented');
  admin.emit('admin:load-question', { questionId: question._id, questionIndex: index });
  await presented;
  return question;
}

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  let { json } = await api('/auth/admin/login', {
    method: 'POST',
    body: {
      username: process.env.ADMIN_USERNAME || 'planpostadmin',
      password: process.env.ADMIN_PASSWORD || 'Pl@npost@!admin'
    }
  });
  adminToken = json?.data?.token;
});

after(async () => {
  openSockets.forEach((s) => s.disconnect());
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
});

test('admin-only REST endpoints reject anonymous requests', async () => {
  for (const [path, method] of [
    ['/questions', 'GET'],
    ['/event/state', 'GET'],
    ['/event/reset', 'POST'],
    ['/teams', 'POST'],
    ['/teams/team_1/reset-session', 'POST']
  ]) {
    const { status } = await api(path, { method, body: method === 'GET' ? undefined : {} });
    assert.equal(status, 401, `${method} ${path} should need admin auth`);
  }

  const { status } = await api('/questions', { token: adminToken });
  assert.equal(status, 200);
});

test('public team listing hides PINs and session tokens', async () => {
  const anon = await api('/teams');
  assert.ok(anon.json.data.length > 0);
  for (const team of anon.json.data) {
    assert.equal(team.pin, undefined);
    assert.equal(team.activeSessionToken, undefined);
  }

  const asAdmin = await api('/teams', { token: adminToken });
  assert.ok(asAdmin.json.data[0].pin);
  assert.equal(asAdmin.json.data[0].activeSessionToken, undefined);
});

test('admin socket events are ignored from unauthenticated sockets', async () => {
  const intruder = connect();
  await once(intruder, 'connect');
  intruder.emit('join:room', { role: 'admin', token: 'forged.token.value' });
  await once(intruder, 'auth:error');

  const denied = once(intruder, 'auth:error');
  intruder.emit('admin:set-stage', { stage: 'FINAL_WINNER' });
  await denied;

  const { json } = await api('/event/state', { token: adminToken });
  assert.notEqual(json.data.state.currentStage, 'FINAL_WINNER');
});

test('projector and phones never receive the answer key before evaluation', async () => {
  const { socket: admin } = await joinAs('admin', adminToken);
  const { socket: projector } = await joinAs('projector');

  const adminGot = once(admin, 'question:presented');
  const projectorGot = once(projector, 'question:presented');
  const question = await loadBuzzerQuestion(admin, 0).catch(() => null);
  const [adminPayload, projectorPayload] = await Promise.all([adminGot, projectorGot]).catch(() => [null, null]);

  assert.ok(question);
  assert.equal(typeof (adminPayload?.question?.correctOptionIndex ?? question.correctOptionIndex), 'number');
  assert.equal(projectorPayload.question.correctOptionIndex, undefined);
  assert.equal(projectorPayload.question.explanation, undefined);
  assert.ok(projectorPayload.question.questionText);
});

test('10 simultaneous buzzes produce exactly one winner (T-703)', async () => {
  // Seed data has 6 teams; register 4 more
  for (let n = 7; n <= 10; n += 1) {
    await api('/teams', { method: 'POST', token: adminToken, body: { teamName: `Load Team ${n}`, teamNumber: n, pin: `${1000 + n}` } });
  }

  const { socket: admin } = await joinAs('admin', adminToken);
  const phones = [];
  for (let n = 1; n <= 10; n += 1) {
    const { token } = await teamLogin(n, `${1000 + n}`);
    const { socket } = await joinAs('team', token);
    phones.push(socket);
  }

  await loadBuzzerQuestion(admin, 1);

  const unlocked = Promise.all(phones.map((p) => once(p, 'buzzer:unlocked', 6000)));
  admin.emit('admin:start-countdown', { seconds: 1 });
  await unlocked;

  const outcomes = phones.map(
    (phone) =>
      new Promise((resolve) => {
        phone.once('buzzer:confirmed', () => resolve('won'));
        phone.once('buzzer:rejected', () => resolve('rejected'));
      })
  );
  const winnerSeen = phones.map((p) => once(p, 'buzzer:winner'));
  phones.forEach((phone) => phone.emit('team:buzz', { teamId: 'spoofed', teamName: 'Spoofed' }));

  const results = await Promise.all(outcomes);
  assert.equal(results.filter((r) => r === 'won').length, 1);
  assert.equal(results.filter((r) => r === 'rejected').length, 9);

  const winners = await Promise.all(winnerSeen);
  const winnerIds = new Set(winners.map((w) => w.teamId));
  assert.equal(winnerIds.size, 1, 'every phone sees the same winner');
  assert.notEqual(winners[0].teamName, 'Spoofed', 'identity comes from the session, not the payload');

  phones.forEach((p) => p.disconnect());
});

test('evaluation uses server-side points, applies once, and allows negative totals', async () => {
  const { socket: admin } = await joinAs('admin', adminToken);
  const { token } = await teamLogin(3, '1003');
  const { socket: phone } = await joinAs('team', token);

  const question = await loadBuzzerQuestion(admin, 2);
  const unlocked = once(phone, 'buzzer:unlocked', 6000);
  admin.emit('admin:start-countdown', { seconds: 1 });
  await unlocked;

  const won = once(admin, 'buzzer:winner');
  phone.emit('team:buzz');
  await won;

  const before = (await api('/teams', { token: adminToken })).json.data.find((t) => t.teamNumber === 3).score;

  const evaluated = once(admin, 'answer:evaluated');
  // Client-supplied points must be ignored
  admin.emit('admin:evaluate', { isCorrect: false, points: 999, negativePoints: 999 });
  admin.emit('admin:evaluate', { isCorrect: false });
  const result = await evaluated;
  await new Promise((r) => setTimeout(r, 200));

  assert.equal(result.pointsAwarded, -question.negativePoints);
  assert.equal(result.correctOptionIndex, question.correctOptionIndex);

  const afterScore = (await api('/teams', { token: adminToken })).json.data.find((t) => t.teamNumber === 3).score;
  assert.equal(afterScore, before - question.negativePoints, 'penalty applied exactly once');
  assert.ok(afterScore < 0 || before >= question.negativePoints, 'scores are not clamped at zero');

  phone.disconnect();
});

test('a second login kicks the first phone, and the old phone cannot clear the new session', async () => {
  const first = await teamLogin(2, '1002');
  const { socket: phoneA } = await joinAs('team', first.token);

  const kicked = once(phoneA, 'auth:session_replaced');
  const disconnected = once(phoneA, 'disconnect');
  const second = await teamLogin(2, '1002');
  await kicked;
  await disconnected;

  // Old phone tries to log out: must not end the new session
  await api('/auth/team/logout', { method: 'POST', token: first.token, body: { teamId: first.team.id } });

  const oldSocket = connect();
  await once(oldSocket, 'connect');
  const rejected = once(oldSocket, 'auth:session_revoked');
  oldSocket.emit('join:room', { role: 'team', token: first.token });
  await rejected;

  const { snapshot } = await joinAs('team', second.token);
  assert.ok(snapshot.state, 'new phone joins fine');
  assert.ok(snapshot.teams.every((t) => t.pin === undefined), 'phones never get team PINs');
});

test('rapid fire counts actions for the server-chosen team and locks after stop', async () => {
  const { socket: admin } = await joinAs('admin', adminToken);

  const started = once(admin, 'rapid-fire:started');
  admin.emit('admin:rapid-fire-start', { teamId: 'team_4', seconds: 30 });
  const startPayload = await started;
  assert.ok(startPayload.question, 'first question is sent with the start event');

  const before = (await api('/teams', { token: adminToken })).json.data.find((t) => t.teamNumber === 4).score;

  for (const action of ['CORRECT', 'CORRECT', 'WRONG', 'PASS']) {
    const updated = once(admin, 'rapid-fire:update');
    admin.emit('admin:rapid-fire-action', { action, teamId: 'team_1' });
    await updated;
  }

  const stopped = once(admin, 'rapid-fire:times-up');
  admin.emit('admin:rapid-fire-stop');
  const { stats } = await stopped;
  assert.deepEqual(
    { correct: stats.correct, wrong: stats.wrong, passed: stats.passed, total: stats.total },
    { correct: 2, wrong: 1, passed: 1, total: 4 }
  );

  admin.emit('admin:rapid-fire-action', { action: 'CORRECT' });
  await new Promise((r) => setTimeout(r, 200));

  const after = (await api('/teams', { token: adminToken })).json.data.find((t) => t.teamNumber === 4).score;
  assert.equal(after, before + 2, 'only the hot-seat team scored, and nothing after the stop');
});

test('a reconnecting admin gets the exact live state back', async () => {
  const { socket: admin } = await joinAs('admin', adminToken);
  const question = await loadBuzzerQuestion(admin, 3);

  const revealed = once(admin, 'options:updated');
  admin.emit('admin:reveal-option', { optionIndex: 0 });
  await revealed;
  const locked = once(admin, 'answer:locked');
  admin.emit('admin:lock-answer', { selectedOptionIndex: 2 });
  await locked;

  admin.disconnect();

  const { snapshot } = await joinAs('admin', adminToken);
  assert.equal(String(snapshot.activeQuestion._id), String(question._id));
  assert.equal(snapshot.state.currentQuestionIndex, 3);
  assert.deepEqual(snapshot.state.questionSubState.revealedOptions, [0]);
  assert.equal(snapshot.state.questionSubState.selectedOptionIndex, 2);

  const rest = await api('/event/state', { token: adminToken });
  assert.equal(String(rest.json.data.activeQuestion._id), String(question._id));
});

// Runs last: it locks this IP out of further logins for a minute
test('repeated wrong PINs are throttled', async () => {
  let lastStatus;
  for (let i = 0; i < 11; i += 1) {
    ({ status: lastStatus } = await api('/auth/team/login', { method: 'POST', body: { teamNumber: 5, pin: '0000' } }));
  }
  assert.equal(lastStatus, 429);
});
