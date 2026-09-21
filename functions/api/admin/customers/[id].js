/**
 * Cloudflare Pages Function: DELETE /api/admin/customers/:id
 * Removes a specific customer and their associated orders from Cloudflare D1.
 */

export async function onRequestDelete(context) {
  const { params, env } = context;
  const customerId = params.id;

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'DB binding missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Delete linked orders first
    await env.DB.prepare('DELETE FROM orders WHERE customer_id = ?')
      .bind(customerId)
      .run();

    // Delete customer
    await env.DB.prepare('DELETE FROM customers WHERE id = ?')
      .bind(customerId)
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
