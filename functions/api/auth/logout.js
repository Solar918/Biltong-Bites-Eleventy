import { getCookie, clearSessionCookie } from '../_auth_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const sessionId = getCookie(request);
  if (sessionId && env.DB) {
    try {
      await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    } catch (_e) {}
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
    },
  });
}
