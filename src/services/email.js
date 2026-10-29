import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transport;

function getTransport() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transport;
}

// Best effort: an email failure must never lose the enquiry, which is already saved.
export async function notifyNewEnquiry(enquiry) {
  const t = getTransport();
  if (!t || !env.NOTIFY_EMAIL) return false;
  const lines = [
    `Name: ${enquiry.name}`,
    `Phone: ${enquiry.phone}`,
    enquiry.email && `Email: ${enquiry.email}`,
    enquiry.location && `Location: ${enquiry.location}`,
    enquiry.projectType && `Project type: ${enquiry.projectType}`,
    enquiry.message && `\n${enquiry.message}`,
  ].filter(Boolean);
  try {
    await t.sendMail({
      from: env.SMTP_USER,
      to: env.NOTIFY_EMAIL,
      subject: `New enquiry from ${enquiry.name}`,
      text: lines.join('\n'),
    });
    return true;
  } catch (err) {
    console.error('Enquiry email failed:', err.message);
    return false;
  }
}
