# Phase 6 — Features retained and migration checklist

Phase 6 is a **full project**, not a POS-only patch. Its source files were compared against the final Phase 5 Enquire/Order FIXED ZIP. All Phase 5 project files are present, along with the new POS implementation.

## Existing Phase 5 functionality retained

- [x] Responsive public business website at `/`, with `/products`, `/services`, `/contact` sections
- [x] Password-protected admin dashboard at `/admin`
- [x] Website Settings: business name, headings, contact details, Telegram username
- [x] Product catalog with product images, upload support and external HTTPS images
- [x] Multiple-product CSV/paste importer
- [x] Product-specific Telegram Enquire / Order deep links and preselected order drafts
- [x] OpenRouter-powered Telegram customer support and conversation history
- [x] Telegram order requests, order status, human handover, admin alerts
- [x] Customer, product, order and conversation records stored in SQLite
- [x] Inventory and stock movements
- [x] Paystack payment workflow and verification (separate from cash/register POS)
- [x] Sales/reports and consent-gated customer follow-ups

## New Phase 6 POS functions

- [x] `/admin/pos` product tiles, search, cart and quantity changes
- [x] Cash checkout with receipt
- [x] Pending bank transfers with staff confirmation
- [x] Sales history and printable receipts
- [x] Stock deductions only on completed sales

## VERY IMPORTANT: Preserve your actual information

The ZIP is application source code only. It **cannot contain the customer records, orders, uploaded photos, passwords, or settings currently on your Windows computer**. To retain those, migrate the real data from the old installation:

1. Stop the old bot using Ctrl+C (confirm Y if prompted). Do not run old and new bots with the same Telegram token.
2. Make a separate backup copy of the old installation's entire `data` folder and `.env` file. The `data` folder may contain the SQLite database *and* `product-images` uploads.
3. Extract this ZIP into a **new folder**; do not overwrite the old working folder.
4. Copy your backed-up `.env` and **entire `data` folder** into the extracted `telegram-business-bot-phase5` directory *before first start*. If your `.env` uses `DATABASE_PATH` pointing somewhere else, preserve that actual database instead.
5. Confirm the `business.json` business details and any custom edits in the old installation; manually carry over differences as needed. The source defaults in this ZIP may be generic.
6. Run `npm install`, `npm test`, `npm run check`, and `npm start` from the new project folder.
7. Verify `/`, `/products`, `/admin`, `/admin/pos`; verify product photos, product enquiry links, existing customer orders, and stock amounts before processing new sales.
8. Keep the old directory and its backup until you have verified the new installation.

Never publish `.env`, the `data` directory, or your live SQLite database. For production, deploy behind HTTPS and implement stronger operational safeguards and access controls.

## Troubleshooting

- `EADDRINUSE 127.0.0.1:3000`: an old app is still using port 3000; stop that process or configure another `PORT` in `.env`.
- Telegram polling conflict: stop all other bots using the same `TELEGRAM_BOT_TOKEN`.
- Missing images: make sure you copied the **entire** `data` directory, not just the `.sqlite` database file.
- Missing records: check `DATABASE_PATH` in `.env` and verify you copied the correct database from the previous install.
- Admin login rejected: make sure `ADMIN_PASSWORD` is 12+ characters and `SESSION_SECRET` is 32+ characters in the actual `.env` file.

## Test coverage

Automated tests confirm core functionality but do not substitute for live Telegram, OpenRouter, Paystack or browser end-to-end testing with your real services.
