import { authenticateSession, generateSalt, hashPassword, verifyPassword } from '../_auth_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'Database binding not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = await authenticateSession(request, env);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized. Please sign in.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const data = await request.json();
    const name = (data.name || '').trim();
    const phone = (data.phone || '').trim();
    const currentPassword = data.currentPassword || '';
    const newPassword = data.newPassword || '';

    if (!name) {
      return new Response(JSON.stringify({ error: 'Full name cannot be empty.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if user is also trying to change their password
    if (newPassword) {
      if (newPassword.length < 6) {
        return new Response(JSON.stringify({ error: 'New password must be at least 6 characters.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!currentPassword) {
        return new Response(JSON.stringify({ error: 'Current password is required to set a new password.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Fetch user record to verify current password
      const fullUser = await env.DB.prepare('SELECT password_hash, salt FROM users WHERE id = ?').bind(user.id).first();
      const isValid = await verifyPassword(currentPassword, fullUser.salt, fullUser.password_hash);
      if (!isValid) {
        return new Response(JSON.stringify({ error: 'Current password does not match.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const newSalt = generateSalt();
      const newHash = await hashPassword(newPassword, newSalt);

      await env.DB.prepare(`
        UPDATE users SET name = ?, phone = ?, password_hash = ?, salt = ? WHERE id = ?
      `).bind(name, phone, newHash, newSalt, user.id).run();
    } else {
      // Just update name and phone
      await env.DB.prepare(`
        UPDATE users SET name = ?, phone = ? WHERE id = ?
      `).bind(name, phone, user.id).run();
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        id: user.id,
        email: user.email,
        name,
        phone,
        role: user.role,
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
