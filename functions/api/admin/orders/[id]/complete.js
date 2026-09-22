/**
 * Cloudflare Pages Function: POST /api/admin/orders/:id/complete
 * Marks an order as 'Completed' and optionally dispatches an email notifying the customer
 * that their order is ready for collection at Long Bay College.
 */

export async function onRequestPost(context) {
  const { params, env } = context;
  const orderId = params.id;

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'DB binding missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // 1. Update order status
    await env.DB.prepare('UPDATE orders SET status = "Completed" WHERE id = ?')
      .bind(orderId)
      .run();

    // 2. Fetch order and customer details
    const orderData = await env.DB.prepare(`
      SELECT orders.cart, orders.total, customers.name, customers.email 
      FROM orders 
      JOIN customers ON orders.customer_id = customers.id 
      WHERE orders.id = ?
    `)
      .bind(orderId)
      .first();

    // 3. Send Completion Email via Gmail SMTP or Resend
    const contactPhone = env.PHONE_NUMBER || '+64 27 305 7992';
    const senderEmail = env.SENDER_EMAIL || 'biltongbites25@gmail.com';
    const senderPassword = env.SENDER_PASSWORD;

    if (orderData && senderEmail && senderPassword) {
      try {
        let cartList = [];
        try {
          cartList = JSON.parse(orderData.cart);
        } catch (_e) {}

        const itemsText = cartList.map(i => `${i.title} (×${i.quantity})`).join(', ');

        const html = `
          <div style="font-family: sans-serif; line-height: 1.6; color: #241614; max-width: 600px;">
            <h2 style="color: #8b1e1f;">Your Biltong Bites Order is Ready!</h2>
            <p>Dear ${orderData.name},</p>
            <p>We are pleased to let you know that your order <strong>#${orderId}</strong> has been completed and is packed ready for you.</p>
            <p><strong>Items:</strong> ${itemsText}</p>
            <div style="background: #faf7f2; border: 1px solid #e6ded3; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
              <p style="margin: 0;"><strong>Collection Location:</strong> Long Bay College, Auckland 0630.</p>
              <p style="margin: 0.5rem 0 0;">Please reply to this email or text us at <strong>${contactPhone}</strong> to arrange a convenient pickup time.</p>
            </div>
            <p>Thank you again for supporting Biltong Bites!</p>
          </div>
        `;

        const { sendGmailSmtp } = await import('../../../_email_utils.js');
        await sendGmailSmtp({
          user: senderEmail,
          pass: senderPassword,
          to: [orderData.email],
          subject: `Order #${orderId} Ready for Collection - Biltong Bites!`,
          text: `Dear ${orderData.name},\n\nYour order #${orderId} has been completed and is ready for pickup!\nItems: ${itemsText}\nCollection Location: Long Bay College, Auckland 0630\nContact: ${contactPhone}`,
          html: html,
        });
      } catch (e) {
        console.error('Completion email error via Gmail SMTP:', e);
      }
    } else if (orderData && env.RESEND_API_KEY) {
      try {
        let cartList = [];
        try {
          cartList = JSON.parse(orderData.cart);
        } catch (_e) {}

        const itemsText = cartList.map(i => `${i.title} (×${i.quantity})`).join(', ');

        const html = `
          <div style="font-family: sans-serif; line-height: 1.6; color: #241614;">
            <h2 style="color: #8b1e1f;">Your Biltong Bites Order is Ready!</h2>
            <p>Dear ${orderData.name},</p>
            <p>We are pleased to let you know that your order <strong>#${orderId}</strong> has been completed and is packed ready for you.</p>
            <p><strong>Items:</strong> ${itemsText}</p>
            <div style="background: #faf7f2; border: 1px solid #e6ded3; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
              <p style="margin: 0;"><strong>Collection Location:</strong> Long Bay College, Auckland 0630.</p>
              <p style="margin: 0.5rem 0 0;">Please reply to this email or text us at <strong>${contactPhone}</strong> to arrange a convenient pickup time.</p>
            </div>
            <p>Thank you again for supporting Biltong Bites!</p>
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
            to: [orderData.email],
            subject: `Order #${orderId} Ready for Collection - Biltong Bites!`,
            html: html
          })
        });
      } catch (e) {
        console.error('Completion email error via Resend:', e);
      }
    }

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
