/**
 * Cloudflare Pages Middleware - Admin Authentication Guard
 * Protects `/admin/` web interface using session cookie authentication.
 * Only users with role 'staff' or 'owner' are permitted.
 */

import { authenticateSession } from '../api/_auth_utils.js';

export async function onRequest(context) {
  const { request, env, next } = context;

  const user = await authenticateSession(request, env);

  // If user is authenticated and is staff or owner, allow access
  if (user && (user.role === 'owner' || user.role === 'staff')) {
    return next();
  }

  // Fallback: If legacy Basic Auth matches ADMIN_USERNAME/ADMIN_PASSWORD, allow backward compatibility
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

  // If user is logged in but is only a customer, block with 403 Forbidden
  if (user && user.role === 'customer') {
    return new Response(
      `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Access Denied - Biltong Bites</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #120c0b; color: #fff; text-align: center; padding: 1rem; }
          .box { max-width: 480px; padding: 2.5rem; background: #1f1413; border: 1px solid #362220; border-radius: 12px; }
          h1 { color: #f59e0b; margin-top: 0; }
          p { color: #a89f91; line-height: 1.6; }
          .btn { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #e53935; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Access Restricted</h1>
          <p>Your account does not have staff or administrator privileges to view this area.</p>
          <p>If you need access, please contact the site owner.</p>
          <a class="btn" href="/account/">Return to My Account</a>
        </div>
      </body>
      </html>`,
      {
        status: 403,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }

  // Otherwise, redirect unauthenticated users to login with return redirect
  return Response.redirect(new URL('/login/?redirect=/admin/', request.url), 302);
}
