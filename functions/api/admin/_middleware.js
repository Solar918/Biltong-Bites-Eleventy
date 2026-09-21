/**
 * Cloudflare Pages Middleware - Admin API Authentication Guard
 * Protects all `/api/admin/*` endpoints.
 * Validates session cookie for role 'staff' or 'owner'.
 */

import { authenticateSession } from '../_auth_utils.js';

export async function onRequest(context) {
  const { request, env, next } = context;

  const user = await authenticateSession(request, env);

  if (user && (user.role === 'owner' || user.role === 'staff')) {
    // Attach user to context for downstream handlers
    context.data = context.data || {};
    context.data.currentUser = user;
    return next();
  }

  // Fallback Basic Auth check for backwards compatibility
  const authHeader = request.headers.get('Authorization');
  const expectedUser = env.ADMIN_USERNAME || 'admin';
  const expectedPass = env.ADMIN_PASSWORD || 'biltong';
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme && scheme.toLowerCase() === 'basic' && encoded) {
      try {
        const decoded = atob(encoded);
        const [username, password] = decoded.split(':');
        if (username === expectedUser && password === expectedPass) {
          return next();
        }
      } catch (_e) {}
    }
  }

  if (user && user.role === 'customer') {
    return new Response(JSON.stringify({ error: 'Forbidden: Staff or owner permissions required.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Unauthorized: Admin authentication required.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
