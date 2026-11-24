# Luxora Paystack integration starter

This is a starter package, **not a deployed/live website**. It contains a server-side Paystack checkout, transaction verification, signed webhook validation, QR ticket generation, SMTP email delivery, and a protected check-in API endpoint.

## Setup
1. Use Node.js 20+ hosting with persistent storage.
2. Copy `.env.example` to `.env`; fill it privately with your Paystack TEST secret key and SMTP credentials.
3. Run `npm install` then `npm start`.
4. Set `SITE_URL` to your public HTTPS domain.
5. In Paystack, set webhook URL to `https://YOUR-DOMAIN/api/paystack-webhook`.

Never put `PAYSTACK_SECRET_KEY`, SMTP password, or `ADMIN_TOKEN` in public HTML, browser JavaScript, screenshots, or chat. Do not send these credentials to anyone.

## Before live launch
- Keep using the test key until the full payment, verification, and email process is tested.
- Confirm Paystack has fully enabled live transactions, not just pre-approved initial checks.
- Configure a verified sender email domain and SMTP provider.
- Deploy to secure HTTPS hosting with persistent database, backups, monitoring, and a production security review.
- The included check-in route is an API only; a staff-facing QR scanner/admin dashboard still needs building.
- Domain purchase, DNS setup, hosting deployment, and SMTP account creation are not included.
