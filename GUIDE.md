# SIGNATUS — Backend Setup Guide

A complete, self-hosted Node.js backend that receives contact form submissions
from your SIGNATUS website and forwards them by email to your private inbox.

The recipient email address is **stored only on the server** — it is never sent
to the browser, never visible in your HTML, and not exposed in network requests.

---

## What's in this folder

```
signatus-backend/
├── server.js          ← The Express server (handles requests, sends emails)
├── package.json       ← Dependencies & scripts
├── .env.example       ← Template for your secrets — copy to .env
├── .gitignore         ← Keeps secrets out of git
├── public/            ← (optional) Place index.html here to serve frontend + backend together
└── GUIDE.md           ← This file
```

---

## Step 1 — Install Node.js

If you don't already have it:

- macOS: `brew install node`
- Windows: download from [nodejs.org](https://nodejs.org/) (LTS version)
- Linux: `sudo apt install nodejs npm` (or use [nvm](https://github.com/nvm-sh/nvm))

You need **Node 18 or newer**. Check with: `node --version`

---

## Step 2 — Install backend dependencies

In a terminal, navigate into the `signatus-backend/` folder and run:

```bash
npm install
```

This installs Express, Nodemailer, CORS, dotenv, and rate-limiting.

---

## Step 3 — Get a Gmail App Password

Gmail does not allow regular passwords for SMTP — you need an **App Password**.

1. Go to your Google Account: [https://myaccount.google.com/](https://myaccount.google.com/)
2. Navigate to **Security**
3. Under "How you sign in to Google", make sure **2-Step Verification is ON**.
   (App Passwords only work when 2FA is enabled.)
4. Click **App Passwords** ([direct link](https://myaccount.google.com/apppasswords))
5. Create a new app password — name it "SIGNATUS Backend" or similar
6. Google gives you a 16-character password like: `abcd efgh ijkl mnop`
7. Copy it (you'll only see it once) — remove the spaces, you'll have something
   like `abcdefghijklmnop`

This is the password you'll put in your `.env` file under `SMTP_PASSWORD`.

---

## Step 4 — Create your `.env` file

Copy the template:

```bash
cp .env.example .env
```

Open `.env` in your editor and fill in real values:

```env
PORT=3000
ATELIER_EMAIL=wnq.offical@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=wnq.offical@gmail.com
SMTP_PASSWORD=abcdefghijklmnop          ← your App Password from Step 3
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:5500
```

**Important:**
- `SMTP_USER` and `ATELIER_EMAIL` can be the same account — Gmail will send mail to itself, which is perfectly fine and convenient.
- Never commit `.env` to git. The `.gitignore` is already configured to skip it.

---

## Step 5 — Start the server (local testing)

```bash
npm start
```

You should see:

```
[SIGNATUS] SMTP connection verified — ready to send.
[SIGNATUS] Backend running on http://localhost:3000
[SIGNATUS] Contact endpoint: POST /api/contact
[SIGNATUS] Health check:    GET  /api/health
```

If SMTP verification fails, double-check your App Password and that 2FA is enabled.

---

## Step 6 — Connect the frontend

You have two options:

### Option A — Serve frontend & backend together (simplest, no CORS)

1. Copy your `signatus.html` into the `public/` folder and rename it to `index.html`
2. With the server running, open: [http://localhost:3000](http://localhost:3000)
3. The contact form will automatically use `/api/contact` (same origin) — no CORS configuration needed.

### Option B — Frontend & backend on different domains

If your website lives at `https://signatus.at` and the backend at `https://api.signatus.at`:

1. In `signatus.html`, find this code block (in the JavaScript section):

   ```js
   const API_ENDPOINT = (() => {
     const host = window.location.hostname;
     if (host === 'localhost' || host === '127.0.0.1' || host === '') {
       return 'http://localhost:3000/api/contact';
     }
     return '/api/contact';
   })();
   ```

2. Change the production return to your full backend URL:

   ```js
   return 'https://api.signatus.at/api/contact';
   ```

3. In your `.env` on the server, add the website's domain to `ALLOWED_ORIGINS`:

   ```env
   ALLOWED_ORIGINS=https://signatus.at,https://www.signatus.at
   ```

---

## Step 7 — Test it

1. Open the website
2. Scroll to the **Contact** section
3. Fill in name, email, subject, message
4. Click **Send Message**
5. Within a few seconds, the message should arrive in `wnq.offical@gmail.com`
6. The email's "Reply" button will reply to the sender, not to yourself

If you don't receive it:
- Check the server's terminal output for errors
- Check your Gmail **Spam** folder (first messages sometimes land there)
- Verify the App Password is correct (no spaces)
- Verify 2FA is enabled on the Google account

---

## Step 8 — Deploy to production

### Option 1 — Render.com (recommended, free tier)

1. Push your `signatus-backend/` folder to a GitHub repo (without `.env`!)
2. Sign up at [render.com](https://render.com)
3. Create a new **Web Service**, connect your repo
4. Build command: `npm install`
5. Start command: `node server.js`
6. Add your environment variables (the contents of `.env`) under **Environment**
7. Deploy. You get a URL like `https://signatus-backend.onrender.com`
8. Update your frontend's `API_ENDPOINT` to point to this URL

### Option 2 — Railway, Fly.io, or any VPS

Same general process — install Node, copy files, set environment variables, run `npm start`. Use a process manager like `pm2` for production:

```bash
npm install -g pm2
pm2 start server.js --name signatus
pm2 save
pm2 startup
```

### Option 3 — Vercel / Netlify (serverless)

These work too, but require restructuring `server.js` into separate function files. The Express setup above is designed for traditional hosting.

---

## Security checklist

- [x] Recipient email never appears in HTML or browser-side JS
- [x] App Password used (never the main Google password)
- [x] `.env` is in `.gitignore` and not committed
- [x] Honeypot field traps bots
- [x] Rate limiter caps submissions at 5 per IP per 15 minutes
- [x] Input validation on all fields (length, format)
- [x] HTML escaping in the email body prevents injection
- [x] CORS restricted to your own domain in production

---

## What gets sent to your inbox

A nicely formatted email with:
- **Subject:** `[SIGNATUS · <category>] <sender name>`
- **From:** the SMTP account (your atelier email)
- **Reply-To:** the sender's email — so a normal "Reply" goes to them
- **Body:** name, email, subject, timestamp, IP, and the full message

You can reply directly from Gmail without ever exposing your address publicly.

---

## Troubleshooting

**"Missing required environment variables"**
→ Make sure `.env` exists in the same folder as `server.js` and contains all keys.

**"SMTP connection failed"**
→ Most often a wrong App Password or 2FA not enabled. Generate a fresh App Password and try again.

**"Origin ... is not allowed by CORS policy"**
→ Add your website's URL to `ALLOWED_ORIGINS` in `.env`, then restart the server.

**Form says "Unable to reach our atelier right now"**
→ Backend isn't running, or `API_ENDPOINT` in the frontend points to the wrong URL. Check the browser DevTools Network tab.

**Spam concerns**
→ The honeypot + rate limit handle 95% of bots. If you still get spam, add Google reCAPTCHA v3 (server-side check in `server.js` before sending).
