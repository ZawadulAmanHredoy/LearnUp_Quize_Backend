process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unused';
process.env.MAX_UPLOAD_MB = '1';
process.env.MEDIA_CACHE_DIR = require('path').join(require('os').tmpdir(), `learnup-test-media-${process.pid}`);

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { io: ioClient } = require('socket.io-client');
const { server, initializeData } = require('../server');
const store = require('../utils/store');

const SAMPLE_AUDIO = path.join(__dirname, '..', 'data', 'sample-media', 'retro_beeps.mp3');
const SAMPLE_VIDEO = path.join(__dirname, '..', 'data', 'sample-media', 'tech_history.mp4');

let baseUrl;
let adminToken;
const sockets = [];

function once(socket, event, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function api(pathname, { method = 'GET', body, token = adminToken } = {}) {
  const res = await fetch(`${baseUrl}/api/v1${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function upload(fileName, bytes, { token = adminToken } = {}) {
  const form = new FormData();
  form.append('file', new Blob([bytes]), fileName);
  const res = await fetch(`${baseUrl}/api/v1/media`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function joinAs(role, token) {
  const socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false });
  sockets.push(socket);
  await once(socket, 'connect');
  const manifest = once(socket, 'media:manifest');
  socket.emit('join:room', { role, token });
  return { socket, manifest: await manifest };
}

const avQuestion = (mediaId, extra = {}) => ({
  roundType: 'AUDIO_VISUAL',
  questionText: 'Which sound effect is this?',
  options: ['Modem', 'Fax', 'Arcade', 'Phone'],
  correctOptionIndex: 2,
  mediaType: 'AUDIO',
  mediaId,
  ...extra
});

before(async () => {
  await initializeData();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const { json } = await api('/auth/admin/login', {
    method: 'POST',
    token: null,
    body: { username: 'admin', password: 'admin123' }
  });
  adminToken = json.data.token;
});

after(async () => {
  sockets.forEach((s) => s.disconnect());
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(process.env.MEDIA_CACHE_DIR, { recursive: true, force: true });
});

test('starter AV questions have their sample clips imported into the media store', async () => {
  const { json } = await api('/questions?round=AUDIO_VISUAL');
  assert.ok(json.data.length >= 2);
  for (const q of json.data) {
    assert.match(q.mediaId, /^[a-f0-9]{24}$/);
    assert.equal(q.mediaUrl, null);
  }
});

test('uploads are admin-only, type-checked and size-limited', async () => {
  const bytes = fs.readFileSync(SAMPLE_AUDIO);
  assert.equal((await upload('clip.mp3', bytes, { token: null })).status, 401);
  assert.equal((await upload('notes.txt', Buffer.from('hello'))).status, 415);
  assert.equal((await upload('huge.mp4', Buffer.alloc(1.5 * 1024 * 1024, 1))).status, 413);
  assert.equal((await upload('empty.mp3', Buffer.alloc(0))).status, 400);
});

test('an uploaded clip streams with seek support and permanent caching', async () => {
  const bytes = fs.readFileSync(SAMPLE_VIDEO);
  const first = await upload('my clip.mp4', bytes);
  assert.equal(first.status, 201, JSON.stringify(first.json));
  const asset = first.json.data;
  assert.equal(asset.mediaType, 'VIDEO');
  assert.equal(asset.size, bytes.length);

  const again = await upload('renamed.mp4', bytes);
  assert.equal(again.json.data.id, asset.id, 'identical files are stored once');

  const res = await fetch(`${baseUrl}${asset.url}`, { headers: { Range: 'bytes=10-19' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-type'), 'video/mp4');
  assert.match(res.headers.get('cache-control'), /immutable/);
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes.subarray(10, 20));

  assert.equal((await fetch(`${baseUrl}/media/ffffffffffffffffffffffff`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/media/..%2Fserver.js`)).status, 404);
});

test('questions are validated, with round defaults applied', async () => {
  const bad = await api('/questions', {
    method: 'POST',
    body: { roundType: 'BUZZER', questionText: '', options: ['Only one'], correctOptionIndex: 3 }
  });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /Question text is required/);
  assert.match(bad.json.error, /between 2 and 6 options/);

  const noMedia = await api('/questions', { method: 'POST', body: avQuestion(null) });
  assert.equal(noMedia.status, 400);
  assert.match(noMedia.json.error, /uploaded media file/);

  const ok = await api('/questions', {
    method: 'POST',
    body: { roundType: 'BUZZER', questionText: 'Largest planet?', options: ['Mars', 'Jupiter', 'Venus'], correctOptionIndex: 1 }
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.data.points, 10);
  assert.equal(ok.json.data.negativePoints, 5);
  assert.deepEqual(ok.json.data.options.map((o) => o.label), ['A', 'B', 'C']);

  const all = (await api('/questions?round=BUZZER')).json.data;
  assert.equal(all[all.length - 1].questionText, 'Largest planet?', 'new questions go to the end of the round');
});

test('creating an AV question updates admins and the clip list for projectors', async () => {
  const { socket: admin } = await joinAs('admin', adminToken);
  const { socket: projector, manifest: before } = await joinAs('projector');

  const asset = (await upload('quiz-sound.mp3', fs.readFileSync(SAMPLE_AUDIO))).json.data;
  const updated = once(admin, 'questions:updated');
  const manifestUpdate = once(projector, 'media:manifest');

  const created = await api('/questions', { method: 'POST', body: avQuestion(asset.id, { mediaType: 'VIDEO' }) });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.mediaType, 'AUDIO', 'media type follows the uploaded file');
  assert.equal(created.json.data.points, 15);

  await updated;
  const manifest = await manifestUpdate;
  const item = manifest.items.find((i) => i.id === asset.id);
  assert.ok(item, 'manifest lists the new clip');
  assert.ok(item.questionIds.includes(String(created.json.data._id)));
  assert.ok(manifest.totalBytes >= before.totalBytes);

  // Partial edit keeps everything else
  const edited = await api(`/questions/${created.json.data._id}`, { method: 'PUT', body: { points: 20 } });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.data.points, 20);
  assert.equal(edited.json.data.mediaId, asset.id);
});

test('admin login asks projectors to pre-download, and their progress reaches the admin', async () => {
  const { socket: admin } = await joinAs('admin', adminToken);
  const { socket: projector } = await joinAs('projector');

  const preload = once(projector, 'media:preload');
  admin.emit('admin:media-preload');
  const manifest = await preload;
  assert.ok(manifest.items.length > 0);

  const status = once(admin, 'media:projector-status');
  const firstId = manifest.items[0].id;
  projector.emit('projector:media-status', { ready: 1, total: manifest.items.length, items: { [firstId]: 'ready', bogus: 'x' } });
  const statuses = await status;
  const mine = statuses.find((s) => s.items[firstId] === 'ready');
  assert.ok(mine);
  assert.equal(mine.items.bogus, undefined);
});

test('media in use cannot be deleted; the live question cannot be deleted', async () => {
  const asset = (await upload('delete-me.mp3', Buffer.concat([fs.readFileSync(SAMPLE_AUDIO), Buffer.from('x')]))).json.data;
  const q = (await api('/questions', { method: 'POST', body: avQuestion(asset.id) })).json.data;

  assert.equal((await api(`/media/${asset.id}`, { method: 'DELETE' })).status, 409);

  await store.updateEventState({ currentStage: 'ROUND_AV', activeQuestionId: q._id });
  assert.equal((await api(`/questions/${q._id}`, { method: 'DELETE' })).status, 409);
  await store.updateEventState({ activeQuestionId: null });

  assert.equal((await api(`/questions/${q._id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await api(`/media/${asset.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${baseUrl}/media/${asset.id}`)).status, 404);
});

test('reorder sets the running order of a round', async () => {
  const before = (await api('/questions?round=RAPID_FIRE')).json.data.map((q) => String(q._id));
  const reversed = [...before].reverse();
  const res = await api('/questions/reorder', { method: 'PUT', body: { roundType: 'RAPID_FIRE', orderedIds: reversed } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.data.map((q) => String(q._id)), reversed);
  assert.deepEqual(res.json.data.map((q) => q.order), reversed.map((_, i) => i + 1));
});

test('bulk import saves nothing if any question is invalid; export round-trips', async () => {
  const count = (await api('/questions')).json.data.length;
  const rejected = await api('/questions/bulk', {
    method: 'POST',
    body: {
      questions: [
        { roundType: 'RAPID_FIRE', questionText: 'OK one', options: ['a', 'b'], correctOptionIndex: 0 },
        { roundType: 'RAPID_FIRE', questionText: 'Broken', options: ['a', 'b'], correctOptionIndex: 5 }
      ]
    }
  });
  assert.equal(rejected.status, 400);
  assert.match(rejected.json.error, /#2/);
  assert.equal((await api('/questions')).json.data.length, count);

  const exported = await fetch(`${baseUrl}/api/v1/questions/export`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.match(exported.headers.get('content-disposition'), /attachment/);
  const backup = await exported.json();
  assert.equal(backup.length, count);
  assert.equal(backup[0]._id, undefined);

  const reimported = await api('/questions/bulk', { method: 'POST', body: { questions: backup.slice(0, 2) } });
  assert.equal(reimported.status, 201);
  assert.equal((await api('/questions')).json.data.length, count + 2);
});
