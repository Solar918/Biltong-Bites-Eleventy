import { verifyPassword, generateSessionId, createSessionCookie, generateSalt, hashPassword } from '../_auth_utils.js';

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
    const email = (data.email || '').trim().toLowerCase();
    const password = data.password || '';

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Look up user
    let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

    // Fallback: If no user found, but matches ADMIN_USERNAME and ADMIN_PASSWORD env vars, auto-provision owner
    const adminUser = (env.ADMIN_USERNAME || 'admin').toLowerCase();
    const adminPass = env.ADMIN_PASSWORD || 'biltong';
    if (!user && email === adminUser && password === adminPass) {
      const salt = generateSalt();
      const hash = await hashPassword(password, salt);
      const res = await env.DB.prepare(`
        INSERT INTO users (email, name, password_hash, salt, role)
        VALUES (?, 'Site Owner', ?, ?, 'owner')
      `).bind(email, hash, salt).run();
      user = {
        id: res.meta?.last_row_id,
        email,
        name: 'Site Owner',
        password_hash: hash,
        salt,
        role: 'owner',
      };
    }

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid email or password.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const isValid = await verifyPassword(password, user.salt, user.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid email or password.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create session
    const sessionId = generateSessionId();
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES (?, ?, ?)
    `).bind(sessionId, user.id, expiresAt).run();

    const cookieHeader = createSessionCookie(sessionId);

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    }), {
      status: 200,
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
