/**
 * Cloudflare Pages Function: GET /api/admin/data
 * Returns all customers and orders stored in Cloudflare D1 for the Admin Dashboard.
 */

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'D1 Database binding (DB) is missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // 1. Fetch all customers
    const { results: customers } = await env.DB.prepare(
      'SELECT * FROM customers ORDER BY id ASC'
    ).all();

    // 2. Fetch all orders joined with customer contact info
    const { results: orderRows } = await env.DB.prepare(`
      SELECT orders.*, 
             customers.name as customer_name, 
             customers.email as customer_email, 
             customers.phone as customer_phone
      FROM orders 
      JOIN customers ON orders.customer_id = customers.id 
      ORDER BY orders.id DESC
    `).all();

    const orders = orderRows.map(row => {
      let cart = [];
      try {
        cart = JSON.parse(row.cart);
      } catch (_e) {
        cart = [];
      }
      return {
        ...row,
        cart
      };
    });

    return new Response(JSON.stringify({
      customers: customers || [],
      orders: orders || []
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
