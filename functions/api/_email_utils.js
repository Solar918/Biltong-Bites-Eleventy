/**
 * SMTP Client for Cloudflare Workers / Pages Functions
 * Uses raw TLS connection via cloudflare:sockets to connect to smtp.gmail.com:465.
 * Authenticates with Gmail App Password and sends RFC 2822 formatted emails.
 */

import { connect } from 'cloudflare:sockets';

/**
 * Sends an email using Gmail SMTP over SSL/TLS (port 465).
 * 
 * @param {Object} options
 * @param {string} options.user - Sender Gmail address (e.g. biltongbites25@gmail.com)
 * @param {string} options.pass - Gmail 16-character app password
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} [options.from] - Friendly From name & address
 * @param {string} [options.replyTo] - Reply-To address
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text body
 * @param {string} [options.html] - HTML body
 */
export async function sendGmailSmtp({ user, pass, to, from, replyTo, subject, text, html }) {
  if (!user || !pass) {
    throw new Error('Gmail username and app password are required.');
  }

  const recipients = Array.isArray(to) ? to : [to];
  const senderAddress = user.trim();
  const cleanPass = pass.replace(/\s+/g, ''); // strip any spaces from app password
  const fromHeader = from || `Biltong Bites <${senderAddress}>`;

  // Connect to smtp.gmail.com on port 465 (implicit TLS)
  const socket = connect({
    hostname: 'smtp.gmail.com',
    port: 465,
  }, {
    secureTransport: 'on'
  });

  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let buffer = '';

  async function readReply() {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\r\n');
      // Look for a complete multi-line or single-line SMTP status response
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (line.length >= 4 && line[3] === ' ') {
          const code = parseInt(line.substring(0, 3), 10);
          buffer = lines.slice(i + 1).join('\r\n');
          return { code, message: line };
        }
      }
    }
    return { code: 0, message: buffer };
  }

  async function sendCommand(cmd, expectedCode) {
    await writer.write(encoder.encode(cmd + '\r\n'));
    const res = await readReply();
    if (expectedCode && res.code !== expectedCode) {
      throw new Error(`SMTP Error [${cmd.split(' ')[0]}]: Expected ${expectedCode}, got ${res.code} - ${res.message}`);
    }
    return res;
  }

  try {
    // 1. Initial greeting (220)
    const greet = await readReply();
    if (greet.code !== 220) {
      throw new Error(`SMTP greeting failed: ${greet.message}`);
    }

    // 2. EHLO
    await sendCommand('EHLO cloudflare.pages', 250);

    // 3. AUTH LOGIN
    await sendCommand('AUTH LOGIN', 334);
    await sendCommand(btoa(senderAddress), 334);
    await sendCommand(btoa(cleanPass), 235);

    // 4. MAIL FROM
    await sendCommand(`MAIL FROM:<${senderAddress}>`, 250);

    // 5. RCPT TO for each recipient
    for (const r of recipients) {
      const cleanR = r.trim().toLowerCase();
      if (cleanR) {
        await sendCommand(`RCPT TO:<${cleanR}>`, 250);
      }
    }

    // 6. DATA
    await sendCommand('DATA', 354);

    // Build MIME message
    const boundary = '----=_Part_' + Math.random().toString(36).substring(2);
    const dateStr = new Date().toUTCString();

    let mime = `From: ${fromHeader}\r\n`;
    mime += `To: ${recipients.join(', ')}\r\n`;
    if (replyTo) {
      mime += `Reply-To: ${replyTo}\r\n`;
    }
    mime += `Subject: ${subject}\r\n`;
    mime += `Date: ${dateStr}\r\n`;
    mime += `MIME-Version: 1.0\r\n`;

    if (html && text) {
      mime += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
      mime += `--${boundary}\r\n`;
      mime += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
      mime += `${text}\r\n\r\n`;
      mime += `--${boundary}\r\n`;
      mime += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
      mime += `${html}\r\n\r\n`;
      mime += `--${boundary}--\r\n`;
    } else if (html) {
      mime += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
      mime += `${html}\r\n`;
    } else {
      mime += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
      mime += `${text || ''}\r\n`;
    }

    // End of message is indicated by <CRLF>.<CRLF>
    await sendCommand(`${mime}\r\n.`, 250);

    // 7. QUIT
    await sendCommand('QUIT', 221);
    return { success: true };
  } finally {
    try {
      reader.releaseLock();
      writer.releaseLock();
      await socket.close();
    } catch (_e) {}
  }
}
