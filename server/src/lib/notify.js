/**
 * Optional email notification when a contact-form message arrives.
 *
 * Off unless SMTP_URL and NOTIFY_EMAIL are set, e.g. in .env:
 *   SMTP_URL=smtps://user:password@smtp.example.com:465
 *   NOTIFY_EMAIL=you@example.com
 *   SMTP_FROM=Trellis <noreply@example.com>   (optional; default: NOTIFY_EMAIL)
 *
 * The message is always saved in the inbox first; a failed email is only
 * logged. Reply-To is the visitor's address, so "Reply" in your mail app
 * answers them directly.
 */
import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport = null;
let checked = false;

export const notificationsEnabled = () => Boolean(config.smtpUrl && config.notifyEmail);

function getTransport() {
  if (checked) return transport;
  checked = true;
  if (!notificationsEnabled()) return null;
  try {
    transport = nodemailer.createTransport(config.smtpUrl);
  } catch (err) {
    console.warn(`[notify] SMTP_URL is not usable: ${err.message}`);
  }
  return transport;
}

/** Strip line breaks from header values (no header injection). */
const oneLine = (s, max = 200) => String(s || '').replace(/[\r\n]+/g, ' ').slice(0, max);

/**
 * @param {{ name: string, email: string, phone?: string, message: string }} msg
 * @param {{ siteName: string }} site
 */
export async function notifyContactMessage(msg, { siteName }) {
  const t = getTransport();
  if (!t) return;
  const lines = [
    `New message from your page ${siteName}:`,
    '',
    `Name:  ${msg.name}`,
    `Email: ${msg.email}`,
    msg.phone ? `Phone: ${msg.phone}` : null,
    '',
    msg.message,
    '',
    '—',
    'Reply to this email to answer the visitor. The message is also in your editor: More → Inbox.',
  ].filter((l) => typeof l === 'string');
  try {
    await t.sendMail({
      from: config.smtpFrom || config.notifyEmail,
      to: config.notifyEmail,
      replyTo: { name: oneLine(msg.name, 100), address: oneLine(msg.email) },
      subject: oneLine(`New message from ${msg.name} (${siteName})`, 150),
      text: lines.join('\n'),
    });
  } catch (err) {
    console.warn(`[notify] Could not send the notification email: ${err.message}`);
  }
}
