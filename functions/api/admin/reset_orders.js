/**
 * Cloudflare Pages Function: DELETE /api/admin/reset_orders
 * Deletes all orders from Cloudflare D1 and resets the auto-increment counter.
 */

export async function onRequestDelete(context) {
  const { env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'DB binding missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Delete all orders
    await env.DB.prepare('DELETE FROM orders').run();
    // Zero SQLite sequence
    await env.DB.prepare("DELETE FROM sqlite_sequence WHERE name='orders'").run();

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
