// Outgoing e-mail (SMTP). Settings come from .env:
//   SMTP_HOST, SMTP_PORT (465 = SSL, 587 = STARTTLS), SMTP_USER, SMTP_PASS, MAIL_FROM
// e.g. Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=thanjairestaurant@gmail.com,
//             SMTP_PASS=<16-letter app password>, MAIL_FROM="Thanjai Restaurant <thanjairestaurant@gmail.com>"
// Without SMTP_HOST nothing is sent: each message is written to the server log instead, so the rest of
// the app keeps working while e-mail is being set up.
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  nodemailer = null;
}

let transporter = null;
const configured = () => !!(process.env.SMTP_HOST && nodemailer);

const transport = () => {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465 || process.env.SMTP_SECURE === 'Y',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
    });
  }
  return transporter;
};

const list = (to) => (Array.isArray(to) ? to : String(to || '').split(/[,;]/)).map((s) => s.trim()).filter(Boolean);

/** Sends one e-mail. Never throws: returns { sent: true } or { sent: false, reason }. */
const send = async ({ to, subject, html, text, replyTo }) => {
  const rcpt = list(to);
  if (!rcpt.length) return { sent: false, reason: 'no recipient' };
  if (!configured()) {
    console.info(`[mail] not sent (SMTP not set up) to ${rcpt.join(', ')}: ${subject}`);
    return { sent: false, reason: 'not configured' };
  }
  try {
    await transport().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: rcpt.join(', '),
      subject,
      html,
      text,
      replyTo: replyTo || undefined,
    });
    return { sent: true };
  } catch (e) {
    console.error(`[mail] failed to ${rcpt.join(', ')}: ${e.message}`);
    return { sent: false, reason: e.message };
  }
};

const escapeHtml = (s) => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = { send, configured, escapeHtml };
