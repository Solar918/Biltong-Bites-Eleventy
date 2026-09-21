/**
 * Cloudflare Pages Function: DELETE /api/admin/orders/:id
 * Removes a specific order from Cloudflare D1.
 */

export async function onRequestDelete(context) {
  const { params, env } = context;
  const orderId = params.id;

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'DB binding missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await env.DB.prepare('DELETE FROM orders WHERE id = ?')
      .bind(orderId)
      .run();

    return new Response(JSON.stringify({ status: 'success' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
