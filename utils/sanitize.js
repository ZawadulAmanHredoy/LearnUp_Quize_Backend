const PRIVATE_TEAM_KEYS = ['activeSessionToken', 'socketId'];
const ADMIN_ONLY_TEAM_KEYS = ['pin'];
const ANSWER_KEYS = ['correctOptionIndex', 'explanation'];

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-copy a payload with secrets removed.
 * - Session tokens and socket ids are never sent to any client.
 * - For non-admin audiences, team PINs are removed, and question objects
 *   (anything with questionText) lose their answer key.
 */
function sanitizePayload(value, { audience = 'public' } = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item, { audience }));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const isQuestion = typeof value.questionText === 'string';
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_TEAM_KEYS.includes(key)) continue;
    if (audience !== 'admin' && ADMIN_ONLY_TEAM_KEYS.includes(key)) continue;
    if (audience !== 'admin' && isQuestion && ANSWER_KEYS.includes(key)) continue;
    result[key] = sanitizePayload(child, { audience });
  }
  return result;
}

const forAdmin = (value) => sanitizePayload(value, { audience: 'admin' });
const forPublic = (value) => sanitizePayload(value, { audience: 'public' });

module.exports = {
  sanitizePayload,
  forAdmin,
  forPublic
};
