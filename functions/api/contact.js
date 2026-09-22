/**
 * Cloudflare Pages Function: POST /api/contact
 * Receives customer messages and forwards them to the business owner via Email API.
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();
    const name = (data.name || 'Anonymous').trim();
    const email = (data.email || '').trim();
    const message = (data.message || '').trim();

    if (!email || !message) {
      return new Response(JSON.stringify({ error: 'Email and message are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const recipient = env.SENDER_EMAIL || env.RECEIVER_EMAIL || 'biltongbites25@gmail.com';
    const senderPassword = env.SENDER_PASSWORD;

    if (recipient && senderPassword) {
      try {
        const { sendGmailSmtp } = await import('./_email_utils.js');
        await sendGmailSmtp({
          user: recipient,
          pass: senderPassword,
          to: [recipient],
          replyTo: email,
          subject: `New Inquiry from ${name} - Biltong Bites Contact Form`,
          text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
          html: `<div style="font-family: sans-serif; line-height: 1.6;"><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong></p><p style="white-space: pre-wrap;">${message}</p></div>`
        });
      } catch (smtpErr) {
        console.error('Contact email dispatch failed via Gmail SMTP:', smtpErr);
      }
    } else if (env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: `Biltong Bites Contact <orders@biltongbites.koines.org>`,
            to: [recipient],
            reply_to: email,
            subject: `New Inquiry from ${name} - Biltong Bites Contact Form`,
            text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
          })
        });
      } catch (e) {
        console.error('Contact email dispatch failed:', e);
      }
    }

    return new Response(JSON.stringify({ status: 'success' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
