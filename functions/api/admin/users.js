import { authenticateSession, generateSalt, hashPassword } from '../_auth_utils.js';

export async function onRequest(context) {
  const { request, env } = context;

  // Enforce authentication & owner role
  const currentUser = await authenticateSession(request, env);
  if (!currentUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized. Please sign in.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (currentUser.role !== 'owner') {
    return new Response(JSON.stringify({ error: 'Forbidden. Owner privileges required to manage accounts.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Handle GET - list all users
  if (request.method === 'GET') {
    try {
      const usersResult = await env.DB.prepare(`
        SELECT id, email, name, role, created_at
        FROM users
        ORDER BY id ASC
      `).all();

      return new Response(JSON.stringify({ users: usersResult.results || [] }), {
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

  // Handle POST/PUT - update user (rename, change role, reset password)
  if (request.method === 'POST' || request.method === 'PUT') {
    try {
      const body = await request.json();
      const targetUserId = parseInt(body.userId, 10);
      const action = body.action; // 'update_role' | 'rename' | 'reset_password'

      if (!targetUserId || !action) {
        return new Response(JSON.stringify({ error: 'User ID and action required.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Fetch target user to make sure they exist
      const targetUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(targetUserId).first();
      if (!targetUser) {
        return new Response(JSON.stringify({ error: 'Target user not found.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (action === 'update_role') {
        const newRole = body.role; // 'customer' | 'staff'
        if (newRole !== 'customer' && newRole !== 'staff') {
          return new Response(JSON.stringify({ error: 'Invalid role specified. Must be customer or staff.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Protect changing another owner
        if (targetUser.role === 'owner' && targetUser.id !== currentUser.id) {
          return new Response(JSON.stringify({ error: 'Cannot modify role of another owner.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(newRole, targetUserId).run();
        return new Response(JSON.stringify({ success: true, message: `User role updated to ${newRole}.` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (action === 'rename') {
        const newName = (body.name || '').trim();
        if (!newName) {
          return new Response(JSON.stringify({ error: 'Name cannot be empty.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(newName, targetUserId).run();
        return new Response(JSON.stringify({ success: true, message: 'User name updated.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (action === 'reset_password') {
        const newPassword = body.newPassword || '';
        if (newPassword.length < 6) {
          return new Response(JSON.stringify({ error: 'New password must be at least 6 characters.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const salt = generateSalt();
        const hash = await hashPassword(newPassword, salt);
        await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').bind(hash, salt, targetUserId).run();
        // Invalidate active sessions for that user
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetUserId).run();

        return new Response(JSON.stringify({ success: true, message: 'Password reset successfully.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Unknown action.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Handle DELETE - delete user account
  if (request.method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const userIdParam = url.searchParams.get('userId');
      const targetUserId = parseInt(userIdParam, 10);

      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'Valid userId query parameter required.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (targetUserId === currentUser.id) {
        return new Response(JSON.stringify({ error: 'You cannot delete your own account.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const targetUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(targetUserId).first();
      if (!targetUser) {
        return new Response(JSON.stringify({ error: 'User not found.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (targetUser.role === 'owner') {
        return new Response(JSON.stringify({ error: 'Cannot delete an owner account.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Delete sessions and user
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetUserId).run();
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetUserId).run();

      return new Response(JSON.stringify({ success: true, message: 'User account deleted.' }), {
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

  return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
