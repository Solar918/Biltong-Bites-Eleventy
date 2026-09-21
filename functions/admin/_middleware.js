/**
 * Cloudflare Pages Middleware - Admin Authentication Guard
 * Protects the `/admin/` web interface using HTTP Basic Authentication.
 */

export async function onRequest(context) {
  const { request, env, next } = context;
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

  return new Response('Unauthorized: Admin credentials required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Biltong Bites Admin Access"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
