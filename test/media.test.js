process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../server');
const { findMissingMedia, resolveLocalMediaPath, listMediaFiles } = require('../utils/media');

let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
});

test('clips in public/media are served with seek support and can load cross-origin', async () => {
  const res = await fetch(`${baseUrl}/media/tech_history.mp4`, { headers: { Range: 'bytes=0-99' } });
  assert.equal(res.status, 206, 'range requests let the projector seek and replay');
  assert.equal(res.headers.get('content-type'), 'video/mp4');
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.equal((await res.arrayBuffer()).byteLength, 100);
});

test('paths outside public/media are not served', async () => {
  for (const path of ['/media/../server.js', '/media/%2e%2e/server.js', '/media/does-not-exist.mp4']) {
    const res = await fetch(`${baseUrl}${path}`);
    assert.ok(res.status === 404 || res.status === 403, `${path} -> ${res.status}`);
  }
  assert.equal(resolveLocalMediaPath('/media/../server.js'), null);
  assert.equal(resolveLocalMediaPath('https://example.com/clip.mp4'), null);
});

test('the media listing is admin-only', async () => {
  const res = await fetch(`${baseUrl}/api/v1/media`);
  assert.equal(res.status, 401);
});

test('every media file referenced by the question bank exists', () => {
  const questions = require('../data/questions.json');
  assert.deepEqual(findMissingMedia(questions), []);
  assert.ok(listMediaFiles().some((f) => f.file === 'tech_history.mp4' && f.type === 'VIDEO'));
});

test('a question pointing at a missing clip is reported', () => {
  const missing = findMissingMedia([
    { _id: 'q1', roundType: 'AUDIO_VISUAL', order: 3, mediaType: 'VIDEO', mediaUrl: '/media/not-uploaded.mp4' },
    { _id: 'q2', roundType: 'AUDIO_VISUAL', order: 4, mediaType: 'VIDEO', mediaUrl: 'https://cdn.example.com/x.mp4' }
  ]);
  assert.deepEqual(missing.map((m) => m.questionId), ['q1']);
});
