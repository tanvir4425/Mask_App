// mask-backend/services/mailer.js
let transporter = null;

function mode() {
  return String(process.env.EMAIL_TRANSPORT || 'console').toLowerCase();
}

async function getTransport() {
  if (transporter) return transporter;

  // lazy-load nodemailer only when needed
  const nodemailer = require('nodemailer');

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true', // false for 587 (STARTTLS)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    requireTLS: true,
    logger: !!process.env.DEBUG_MAILER, // show nodemailer logs
    debug:  !!process.env.DEBUG_MAILER,
  });

  // Verify connection/auth up front so we see a helpful error if it fails
  if (process.env.DEBUG_MAILER) {
    try {
      await transporter.verify();
      console.log('[mail] SMTP verify OK');
    } catch (e) {
      console.error('[mail] SMTP verify FAILED:', e.message);
      throw e;
    }
  }
  return transporter;
}

async function sendMail(to, subject, text, html) {
  if (mode() !== 'smtp') {
    console.log(`[mail:console] would send to ${to}\nSubject: ${subject}\n${text}`);
    return { ok: true, dev: true };
  }

  const tx = await getTransport();
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const info = await tx.sendMail({
    from,
    to,
    subject,
    text,
    html: html || `<pre>${text}</pre>`,
  });
  console.log('[mail] sent messageId:', info.messageId);
  return { ok: true, id: info.messageId };
}

module.exports = { sendMail };
