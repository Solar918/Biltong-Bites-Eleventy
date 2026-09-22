/**
 * Auth & Security Utilities for Cloudflare Pages Functions
 * Pure Web Crypto implementation (zero external node dependencies).
 */

const COOKIE_NAME = 'bb_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Generates a cryptographically random hex salt.
 */
export function generateSalt(length = 16) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hashes a password string with a salt using PBKDF2 with SHA-256.
 */
export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const exported = await crypto.subtle.exportKey('raw', derivedKey);
  return Array.from(new Uint8Array(exported))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validates a password against stored salt and hash.
 */
export async function verifyPassword(password, salt, storedHash) {
  const calculatedHash = await hashPassword(password, salt);
  return calculatedHash === storedHash;
}

/**
 * Generates a random session token (UUIDv4).
 */
export function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Extracts cookie value by name from Request headers.
 */
export function getCookie(request, name = COOKIE_NAME) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Creates Set-Cookie header string for session.
 */
export function createSessionCookie(sessionId, maxAgeMs = SESSION_DURATION_MS) {
  const expires = new Date(Date.now() + maxAgeMs).toUTCString();
  const maxAgeSeconds = Math.floor(maxAgeMs / 1000);
  return `${COOKIE_NAME}=${sessionId}; Path=/; Expires=${expires}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax; Secure`;
}

/**
 * Creates Set-Cookie header string to clear session cookie.
 */
export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}

/**
 * Verifies session token from request against D1 database.
 * Returns user record if valid, otherwise null.
 */
export async function authenticateSession(request, env) {
  const sessionId = getCookie(request, COOKIE_NAME);
  if (!sessionId) return null;

  if (!env.DB) {
    return null;
  }

  try {
    const now = Date.now();
    const result = await env.DB.prepare(`
      SELECT users.id, users.email, users.name, users.phone, users.role, sessions.expires_at
      FROM sessions
      JOIN users ON sessions.user_id = users.id
      WHERE sessions.id = ? AND sessions.expires_at > ?
    `).bind(sessionId, now).first();

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      email: result.email,
      name: result.name,
      phone: result.phone || '',
      role: result.role,
      sessionId,
    };
  } catch (err) {
    console.error('Session auth error:', err);
    return null;
  }
}
