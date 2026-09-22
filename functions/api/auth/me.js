import { authenticateSession } from '../_auth_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const user = await authenticateSession(request, env);
  if (!user) {
    return new Response(JSON.stringify({ authenticated: false, user: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch orders associated with this user's email
  let orders = [];
  try {
    const ordersResult = await env.DB.prepare(`
      SELECT orders.*
      FROM orders
      JOIN customers ON orders.customer_id = customers.id
      WHERE customers.email = ?
      ORDER BY orders.id DESC
    `).bind(user.email).all();

    orders = (ordersResult.results || []).map(row => {
      let cart = [];
      try {
        cart = JSON.parse(row.cart);
      } catch (_e) {}
      return {
        id: row.id,
        cart,
        total: row.total,
        status: row.status,
        created_at: row.created_at,
      };
    });
  } catch (_e) {}

  return new Response(JSON.stringify({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone || '',
      role: user.role,
      canAccessAdmin: user.role === 'owner' || user.role === 'staff',
      isOwner: user.role === 'owner',
    },
    orders,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
