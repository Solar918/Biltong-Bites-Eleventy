/**
 * Cloudflare Pages Function: POST /api/orders
 * Receives customer checkout orders, persists customer & order into Cloudflare D1,
 * and optionally dispatches email notifications via email API (e.g., Resend, Mailchannels, SendGrid).
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();
    const email = (data.email || '').trim().toLowerCase();
    const name = (data.name || 'Valued Customer').trim();
    const emailName = (data.emailName || name).trim();
    const phone = (data.phone || '').trim();
    const cart = Array.isArray(data.cart) ? data.cart : [];
    const total = parseFloat(data.total) || 0.0;

    // Validation
    if (!email || cart.length === 0 || total <= 0) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Invalid order data: cart is empty or total is zero.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Database binding (DB) is not configured in Cloudflare Pages.'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Deduplicate / Insert Customer
    let customer = await env.DB.prepare('SELECT id FROM customers WHERE email = ?')
      .bind(email)
      .first();

    let customerId;
    if (customer) {
      customerId = customer.id;
      await env.DB.prepare('UPDATE customers SET name = ?, phone = ? WHERE id = ?')
        .bind(name, phone, customerId)
        .run();
    } else {
      const custResult = await env.DB.prepare(
        'INSERT INTO customers (email, name, phone) VALUES (?, ?, ?)'
      )
        .bind(email, name, phone)
        .run();
      customerId = custResult.meta.last_row_id;
    }

    // 2. Insert Order linked to customerId
    const orderResult = await env.DB.prepare(
      'INSERT INTO orders (customer_id, cart, total, status) VALUES (?, ?, ?, ?)'
    )
      .bind(customerId, JSON.stringify(cart), total, 'Pending')
      .run();

    const orderId = orderResult.meta.last_row_id;

    // 3. Optional: Send Outbound Email if RESEND_API_KEY or SENDGRID_API_KEY is configured
    const accountNumber = env.ACCOUNT_NUMBER || '12345678';
    const contactPhone = env.PHONE_NUMBER || '+64 27 305 7992';
    const senderEmail = env.SENDER_EMAIL || 'orders@biltongbites.koines.org';

    if (env.RESEND_API_KEY) {
      try {
        const itemsListHtml = cart.map(i => `<li><strong>${i.title}</strong> × ${i.quantity} @ $${parseFloat(i.price || 0).toFixed(2)}</li>`).join('');
        const html = `
          <div style="font-family: sans-serif; line-height: 1.6; color: #241614;">
            <h2 style="color: #8b1e1f;">Thank you for your order with Biltong Bites!</h2>
            <p>Dear ${emailName},</p>
            <p>To finalize your purchase, please complete a bank transfer with the details below:</p>
            <div style="background: #faf7f2; border: 1px solid #e6ded3; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
              <p style="margin: 0.25rem 0;"><strong>Account Name:</strong> Ethan ARMSTRONG</p>
              <p style="margin: 0.25rem 0;"><strong>Account Number:</strong> ${accountNumber}</p>
              <p style="margin: 0.25rem 0;"><strong>Total Amount Due:</strong> $${total.toFixed(2)} NZD</p>
              <p style="margin: 0.25rem 0;"><strong>Reference:</strong> Order #${orderId}</p>
            </div>
            <h3>Order #${orderId} Summary</h3>
            <ul>${itemsListHtml}</ul>
            <p><strong>Pickup Location:</strong> Long Bay College, Auckland 0630. We'll notify you as soon as your biltong is ready!</p>
            <p>Questions? Contact us at ${contactPhone} or reply to this email.</p>
          </div>
        `;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: `Biltong Bites <${senderEmail}>`,
            to: [email],
            subject: `Order #${orderId} Received - Biltong Bites`,
            html: html
          })
        });
      } catch (emailErr) {
        console.error('Failed to send email via Resend API:', emailErr);
      }
    }

    return new Response(JSON.stringify({
      status: 'success',
      order_id: orderId
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      status: 'error',
      message: err.message || 'Server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
