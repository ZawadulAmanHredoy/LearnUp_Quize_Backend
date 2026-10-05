const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PBKDF2_ITERATIONS = 210000;
const LEGACY_PBKDF2_ITERATIONS = 1000;
const ADMIN_ROLES = ['SUPER_ADMIN', 'MODERATOR'];

/**
 * Resolve the token signing secret.
 * Without JWT_SECRET, a random secret is generated once and kept in
 * .jwt-secret so tokens survive a server restart mid-event.
 */
function resolveSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET !== 'your_jwt_secret_key_here') {
    return process.env.JWT_SECRET;
  }

  const secretPath = path.join(__dirname, '..', '.jwt-secret');
  try {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing) return existing;
  } catch (err) {}

  const generated = crypto.randomBytes(48).toString('hex');
  try {
    fs.writeFileSync(secretPath, generated, { mode: 0o600 });
    console.warn('[Auth] JWT_SECRET not set; generated one in .jwt-secret');
  } catch (err) {
    console.warn('[Auth] JWT_SECRET not set and .jwt-secret is not writable; tokens reset on restart');
  }
  return generated;
}

const JWT_SECRET = resolveSecret();

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Hash a password using PBKDF2 with a random salt.
 * Format: pbkdf2$<iterations>$<salt>$<hash>
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, 'sha512').toString('hex');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

/**
 * Verify a password against a stored hash (current or legacy salt:hash format)
 */
function verifyPassword(password, storedPassword) {
  if (!password || !storedPassword) return false;

  let iterations;
  let salt;
  let originalHash;

  if (storedPassword.startsWith('pbkdf2$')) {
    const [, iter, s, h] = storedPassword.split('$');
    iterations = Number(iter);
    salt = s;
    originalHash = h;
  } else if (storedPassword.includes(':')) {
    [salt, originalHash] = storedPassword.split(':');
    iterations = LEGACY_PBKDF2_ITERATIONS;
  } else {
    return false;
  }

  if (!iterations || !salt || !originalHash) return false;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  return safeEqual(hash, originalHash);
}

/**
 * Base64URL encode a buffer or string
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64URL decode
 */
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString();
}

function sign(data) {
  return crypto
    .createHmac('sha256', JWT_SECRET)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Generate a JWT token with HMAC-SHA256 signature
 */
function generateToken(payload, expiresInSeconds = 86400) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify and decode a JWT token
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;

  if (!safeEqual(signature, sign(`${encodedHeader}.${encodedPayload}`))) return null;

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    if (header.alg !== 'HS256') return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch (err) {
    return null;
  }
}

function isAdminPayload(payload) {
  return Boolean(payload && ADMIN_ROLES.includes(payload.role));
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  isAdminPayload,
  extractBearerToken
};
