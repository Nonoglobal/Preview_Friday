/**
 * SIGNATUS — Contact Form Backend
 * --------------------------------
 * A minimal Express server that receives contact form submissions from the
 * SIGNATUS website and forwards them by email to the atelier's inbox.
 *
 * The recipient address is held server-side only — the browser never sees it.
 * Spam protection: honeypot field + rate limiting + input validation.
 *
 * Environment variables (set in .env):
 *   PORT                — Port to listen on (default: 3000)
 *   ATELIER_EMAIL       — The recipient email (your private inbox)
 *   SMTP_HOST           — SMTP server (e.g. smtp.gmail.com)
 *   SMTP_PORT           — SMTP port (e.g. 465 for SSL, 587 for TLS)
 *   SMTP_SECURE         — "true" for SSL (port 465), "false" for STARTTLS (587)
 *   SMTP_USER           — SMTP username (the sending account)
 *   SMTP_PASSWORD       — SMTP password / app password
 *   ALLOWED_ORIGINS     — Comma-separated list of allowed CORS origins
 *                         (e.g. "https://signatus.at,http://localhost:8080")
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// -------- Configuration sanity check --------
const REQUIRED_ENV = ['ATELIER_EMAIL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('\n[SIGNATUS] Missing required environment variables:');
  missing.forEach((k) => console.error('   - ' + k));
  console.error('\nCopy .env.example to .env and fill in the values before starting.\n');
  process.exit(1);
}

// -------- CORS --------
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow tools like curl & same-origin requests (no Origin header)
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) return callback(null, true); // permissive in dev
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Origin ' + origin + ' is not allowed by CORS policy'));
    },
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

app.use(express.json({ limit: '10kb' })); // small body limit — contact form only

// -------- Static frontend (optional) --------
// If you place index.html in ./public, the backend will serve it too,
// so the frontend & API share an origin and you avoid CORS issues entirely.
app.use(express.static(path.join(__dirname, 'public')));

// -------- Rate limiter for the contact endpoint --------
// Max 5 submissions per IP per 15 minutes — generous for legit users, tight for spam.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this address. Please try again in fifteen minutes.',
  },
});

// -------- Email transporter --------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Verify SMTP connection on startup (helpful during setup)
transporter.verify((err) => {
  if (err) {
    console.error('[SIGNATUS] SMTP connection failed:', err.message);
    console.error('Check your SMTP_* environment variables.');
  } else {
    console.log('[SIGNATUS] SMTP connection verified — ready to send.');
  }
});

// -------- Validation helpers --------
function isValidEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length < 254;
}
function isClean(s, max) {
  return typeof s === 'string' && s.trim().length > 0 && s.length <= max;
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// -------- Health check --------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'signatus-contact', timestamp: new Date().toISOString() });
});

// -------- Contact endpoint --------
app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name, email, subject, message, website } = req.body || {};

    // Honeypot trap — if `website` is filled, it's a bot
    if (website && website.length > 0) {
      // Pretend success so the bot doesn't retry
      console.log('[SIGNATUS] Honeypot triggered — submission silently discarded.');
      return res.json({ ok: true });
    }

    // Validation
    if (!isClean(name, 200)) return res.status(400).json({ error: 'Please provide your name.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Please provide a valid email address.' });
    if (!isClean(message, 5000)) return res.status(400).json({ error: 'Please provide a message.' });

    const safeName = name.trim().slice(0, 200);
    const safeEmail = email.trim().toLowerCase();
    const safeSubject = (subject && typeof subject === 'string' ? subject : 'General Enquiry').slice(0, 200);
    const safeMessage = message.trim().slice(0, 5000);

    // Build email
    const submittedAt = new Date().toISOString();
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    const mailOptions = {
      from: `"SIGNATUS Contact Form" <${process.env.SMTP_USER}>`,
      to: process.env.ATELIER_EMAIL,
      replyTo: `"${safeName}" <${safeEmail}>`, // clicking "Reply" replies to the sender
      subject: `[SIGNATUS · ${safeSubject}] ${safeName}`,
      text: [
        '— New SIGNATUS contact submission —',
        '',
        `From:    ${safeName} <${safeEmail}>`,
        `Subject: ${safeSubject}`,
        `Date:    ${submittedAt}`,
        `IP:      ${ip}`,
        '',
        '— Message —',
        '',
        safeMessage,
        '',
        '— End of message —',
      ].join('\n'),
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 30px; background: #fafafa; color: #1a1a1a;">
          <div style="border-bottom: 2px solid #6b1220; padding-bottom: 16px; margin-bottom: 24px;">
            <h2 style="margin: 0; font-weight: 300; letter-spacing: 0.2em; color: #1a1a1a;">SIGNATUS</h2>
            <p style="margin: 4px 0 0; font-style: italic; color: #6b1220; font-size: 13px;">— New contact submission —</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 8px 0; color: #888; width: 100px;">From</td><td style="padding: 8px 0;"><strong>${escapeHtml(safeName)}</strong> &lt;<a href="mailto:${escapeHtml(safeEmail)}" style="color: #6b1220;">${escapeHtml(safeEmail)}</a>&gt;</td></tr>
            <tr><td style="padding: 8px 0; color: #888;">Subject</td><td style="padding: 8px 0;">${escapeHtml(safeSubject)}</td></tr>
            <tr><td style="padding: 8px 0; color: #888;">Received</td><td style="padding: 8px 0;">${escapeHtml(submittedAt)}</td></tr>
            <tr><td style="padding: 8px 0; color: #888;">IP</td><td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${escapeHtml(String(ip))}</td></tr>
          </table>

          <div style="margin-top: 30px; padding: 24px; background: #fff; border-left: 3px solid #6b1220;">
            <div style="font-size: 11px; letter-spacing: 0.2em; color: #888; text-transform: uppercase; margin-bottom: 12px;">— Message —</div>
            <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${escapeHtml(safeMessage)}</div>
          </div>

          <p style="margin-top: 30px; font-size: 11px; color: #888; font-style: italic; text-align: center;">Reply directly to this email to respond to the sender.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[SIGNATUS] Message forwarded from ${safeEmail} (${safeSubject})`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[SIGNATUS] Failed to send mail:', err);
    return res.status(500).json({ error: 'We could not deliver your message. Please try again later.' });
  }
});

// -------- 404 & error fallback --------
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found.' });
  }
  // Otherwise let static files handle it; if no file matches, 404
  res.status(404).send('Not found.');
});

app.listen(PORT, () => {
  console.log(`\n[SIGNATUS] Backend running on http://localhost:${PORT}`);
  console.log(`[SIGNATUS] Contact endpoint: POST /api/contact`);
  console.log(`[SIGNATUS] Health check:    GET  /api/health\n`);
});
