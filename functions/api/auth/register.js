import { generateSalt, hashPassword, generateSessionId, createSessionCookie } from '../_auth_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'Database binding not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const data = await request.json();
    const name = (data.name || '').trim();
    const email = (data.email || '').trim().toLowerCase();
    const password = data.password || '';

    if (!name || !email || !password) {
      return new Response(JSON.stringify({ error: 'Name, email, and password are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: 'Password must be at least 6 characters.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if user already exists
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) {
      return new Response(JSON.stringify({ error: 'An account with that email already exists.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Determine role: if this is the very first registered user OR matches ADMIN_USERNAME/ADMIN_PASSWORD env vars, make them owner!
    let role = 'customer';
    const countResult = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
    const isFirstUser = !countResult || countResult.count === 0;

    const adminUser = env.ADMIN_USERNAME || 'admin';
    const adminPass = env.ADMIN_PASSWORD || 'biltong';
    if (isFirstUser || (email === adminUser && password === adminPass)) {
      role = 'owner';
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    const insertResult = await env.DB.prepare(`
      INSERT INTO users (email, name, password_hash, salt, role)
      VALUES (?, ?, ?, ?, ?)
    `).bind(email, name, passwordHash, salt, role).run();

    const userId = insertResult.meta?.last_row_id;

    // Create a new session
    const sessionId = generateSessionId();
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES (?, ?, ?)
    `).bind(sessionId, userId, expiresAt).run();

    const cookieHeader = createSessionCookie(sessionId);

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: userId,
        email,
        name,
        role,
      },
    }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieHeader,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
