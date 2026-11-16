# Telegram AI Business Bot — Phase 5 (Public Website + Admin)

This is a **complete upgrade of Phase 4**. It includes:

- Public-facing responsive website: `/`, `/products`, `/services`, `/contact`
- Private dashboard: `/admin` (password protected)
- New **Website Settings** section inside the admin dashboard
- Public catalog that reads **active products** from the existing SQLite database
- Optional public Telegram link to your bot
- All prior features: Telegram AI support via OpenRouter, guided order requests, customers, conversations, inventory, Paystack test/live integration, reports, consent-based follow-ups
- Data persistence in SQLite. Existing Phase 4 records can be carried over.

**Architecture:** Single-business website, not yet a multi-tenant SaaS platform. The public site does **not** display customer accounts, order history, payment records or admin API keys. It does **not** process public website orders directly: the call-to-action opens your Telegram bot. A submitted Telegram order remains pending until staff confirm it.

## Windows 10/11 installation

1. **Stop the old bot first.** In the Command Prompt that runs Phase 4, press `Ctrl+C` and respond `Y` if Windows asks to terminate. Only one bot instance should poll the same Telegram token. If it was still on port 3000, stop it before starting Phase 5.
2. Extract the ZIP, and open Command Prompt in the folder named `telegram-business-bot-phase5`.
3. Check Node.js: `node -v`. Use **Node 22.13+** (Node 24 also works, but may show an experimental SQLite warning).
4. Run `npm install`.
5. **Migration from Phase 4:** With Phase 4 fully stopped, make a copy of its `data` folder and `.env` for safekeeping. Copy the entire `data` directory and `.env` into your new Phase 5 folder, **before running Phase 5**. Never delete the source Phase 4 folder until the upgrade has been checked. SQLite creates any necessary new tables/settings as needed.
6. **Fresh install only:** `copy .env.example .env`, then `notepad .env`.
7. In `.env`, configure `TELEGRAM_BOT_TOKEN`, `OPENROUTER_API_KEY`, `ADMIN_PASSWORD` (12+ chars), `SESSION_SECRET` (32+ chars). Optionally add `ADMIN_CHAT_ID`, `PAYSTACK_SECRET_KEY`, and `TELEGRAM_BOT_USERNAME` (just your BotFather username, *without* `@` or a URL). For an existing Phase 4 installation, keep your keys as they are; **do not overwrite the migrated `.env`**.
8. Run `npm test`, `npm run check`, and `npm start`.
9. Visit `http://127.0.0.1:3000/` for the **public homepage** and `http://127.0.0.1:3000/admin` for the **admin dashboard**. Log in with `ADMIN_PASSWORD`.
10. In **Admin → Website Settings**, edit the site name, title, introduction, services (one per line), service area, hours, email, phone and Telegram bot username. Save. In **Admin → Products**, add products and make sure **Active** is checked. Refresh the homepage to see them.

### Fix "EADDRINUSE: address already in use 127.0.0.1:3000"

This means another program is listening on port 3000—often your old Phase 3 or Phase 4 instance. On Windows:

```bat
netstat -ano | findstr :3000
tasklist /FI "PID eq 12345"
```

Use the PID shown by `netstat`, not the example number above. If it belongs to your old bot, shut down that old process. Alternatively set `PORT=3001` in `.env` and open `http://127.0.0.1:3001/` and `/admin`. **Changing ports does not solve Telegram polling conflicts**; stop the old bot if it shares the same Telegram token.

### Generate local login credentials (new install only)

```bat
node -e "const c=require('node:crypto');console.log('ADMIN_PASSWORD='+c.randomBytes(18).toString('hex'));console.log('SESSION_SECRET='+c.randomBytes(32).toString('hex'))"
```

Copy the generated lines into `.env` and keep them private. The `.env` file is ignored by Git. Don't use credentials posted in public chats.

## Pages and APIs

| Route | Purpose | Access |
|---|---|---|
| `/` | Public homepage | Public |
| `/products` | Catalog section | Public |
| `/services` | Services section | Public |
| `/contact` | Contact information & Telegram link | Public |
| `/admin` | Dashboard and Website Settings | Password login |
| `/public-api/site` | Read-only public business information & active products | Public |
| `/api/site-settings` | Read/edit website information | Admin session required |

**Note:** All four public routes currently use the same responsive layout and scroll to the relevant section; they are not separately designed page templates. The public pages are intended to be served on an HTTPS domain for customers. Local `127.0.0.1` only works on your own computer, not on customers' phones.

## Testing Phase 5

- Run `npm test` to test prior Phase 3/4 persistence, order handling, payments, and follow-ups, plus site settings and public-catalog filtering.
- Start the app and verify both `/` and `/admin` resolve to different pages.
- Add one active and one inactive product in `/admin`; only the active product should appear on `/products`.
- Change the website headline using Website Settings and refresh `/`.
- Set Telegram username and verify **Chat on Telegram** opens your bot.
- Send `/start` and `/order` from Telegram to verify the bot still works.
- A live Paystack transaction must only be tested with test credentials initially; verify payments before fulfillment.

## Security and deployment notes

- Default `HOST=127.0.0.1` binds locally, which is safer for Windows testing. To publish it, use a trusted HTTPS reverse proxy and production hardening, not a directly exposed dashboard.
- Do not upload `.env`, SQLite files, backups, API tokens, customer data, or secret keys to a public repository.
- `ADMIN_PASSWORD` and `SESSION_SECRET` protect the dashboard. Keep them confidential.
- `PAYSTACK_SECRET_KEY` is used only on the backend; checkout links alone do not prove payment.
- Telegram bot usernames are public identifiers (not tokens). Set them in `Admin → Website Settings`.
- The existing Phase 4 login design is retained. For a commercial multi-user deployment, add account-level authentication, CSRF protection, audit logging, backups, monitoring and comprehensive integration tests.
- Don't run Phase 4 and Phase 5 simultaneously with the same bot token.

## Known limitations

- This is **one business**, not yet the multi-business registration/subscription SaaS platform.
- Public customers interact via Telegram rather than a built-in live website chat widget.
- Product prices are displayed as administrator-entered text and are not verified stock availability.
- On the public site, the service lines are pulled from your Website Settings; business AI instructions still read `business.json` and dashboard product records. If you change core business policies, also update `business.json`.
- Automated tests do **not** replace a live end-to-end test of Telegram/OpenRouter, Paystack, and your browser.

## Product catalog upgrade: images and bulk paste

This upgraded Phase 5 project adds a real product-image field without deleting existing SQLite records. It uses your existing `DATABASE_PATH` SQLite database and creates a `data/product-images/` directory for photos. **Back up your entire `data` directory and `.env` first.** Stop the old bot before copying data into the upgraded project.

1. Start this upgraded project and sign in at `http://127.0.0.1:3000/admin`.
2. Open **Products → Edit** on an existing item (or **Add product**).
3. Select a JPG, PNG or WebP image under **2 MB** from your computer, or paste a public **HTTPS image URL**. Click **Save product**.
4. Open `http://127.0.0.1:3000/products` and refresh. Each item shows the saved photo, name, description, formatted ₦ price, **Copy details**, and **Enquire / Order** buttons.
5. In **Website Settings**, enter your Telegram bot **username** (without `@`). This enables customer enquiry links. The link opens your bot; customers can mention the item or type `/order`. It is not an automatic checkout.

### Add multiple products in one paste

Open **Products → Paste multiple products**. Paste CSV text, or copy a group of cells from Excel / Google Sheets (tab-delimited). Include a first row with these headers: `name,price,description,image_url`. The image_url column is optional; you can add photos later. Click **Import / update products**. Matching names will update existing items rather than creating duplicates. Price is a plain amount in naira (example: `8500`); the public storefront formats it as `₦8,500`.

```csv
name,price,description,image_url
Premium Cotton T-Shirt,8500,"Unisex cotton T-shirt", 
Wireless Bluetooth Earbuds,15000,"Wireless earbuds with case", 
Ladies Crossbody Bag,18500,"Everyday handbag", 
```

Uploaded images remain in your local data directory; copy **the entire `data` folder, including `product-images`, when moving computers or deploying**. If you use an external image link, it must remain publicly available. Other dashboard screens and Telegram features are preserved.

If port 3000 is occupied, stop the previous bot or change `PORT=3001` in `.env`. Only one bot instance should poll the same Telegram token at a time.

## Product-specific Enquire / Order button fix (Phase 5.1)

The public catalog's **Enquire / Order** button now opens a Telegram deep link such as `https://t.me/YourBotUsername?start=p_12` where 12 is the saved product ID. When the visitor taps **Start** (or follows the link in an existing conversation), the bot checks the active product in SQLite, fills its name into a pending order draft, and asks for **quantity**. The normal order questions continue (customer name, phone, delivery location, notes, and YES confirmation). Final submission creates a **pending enquiry** and notifies the configured admin. A product that's been deactivated or deleted cannot start a new linked order.

### Install on Windows (without losing your products)

1. **Stop the old Phase 5 process** (`Ctrl+C`, and `Y` if prompted). Do not run both versions with the same Telegram token.
2. Back up the entire old `data` folder (which includes `business.sqlite` and `product-images`) and `.env` file.
3. Extract this new ZIP into a new folder. Copy the backed-up `data` folder and `.env` into that folder. Do not overwrite the old installation until the new one is tested.
4. In a Command Prompt opened in the new `telegram-business-bot-phase5` folder, run `npm install`, `npm test`, then `npm start`.
5. The server tries to identify the Telegram username from your bot token automatically via Telegram `getMe`. It will log `Telegram bot username detected: @...`. If detection fails, go to `http://127.0.0.1:3000/admin` → **Website Settings** → **Telegram Bot Username**, enter just the BotFather username without @, and save. If you previously entered a *wrong* username, correct it there; your manual setting takes priority.
6. Visit `http://127.0.0.1:3000/products` and refresh. Click **Enquire / Order** on a product. Telegram should open your bot, with a Start button or a prompt to continue the conversation. Tap **Start**. Your product name and price should appear, followed by a quantity question. Test submission by sending quantity, name, phone, location, notes, and YES. You should then see a pending order in `/admin` → Orders.
7. On your local machine this public website runs only on `127.0.0.1`, so customers cannot access it from their own devices until you host the website on a public HTTPS domain. Telegram links themselves work from other devices once shared.

### Troubleshooting

- Button says Telegram username needs configuring: confirm Website Settings → Telegram Bot Username is correct, and reload the page.
- Telegram opens the wrong bot: fix Website Settings.
- Telegram opens your bot but does not preselect the item: restart the *new* project and stop previous instances; be sure to tap Telegram's Start/Continue button to send the `/start p_<product_id>` payload.
- Product link says unavailable: ensure the product is **Active** and still exists in your product catalog.
- Telegram replies but order is missing: complete the questions and reply YES; submission is not automatic just by clicking.
- Port 3000 busy: shut down the older bot, or set PORT=3001; never poll Telegram from two instances using the same token.

Run `npm test` to verify the new deep-link tests. Live Telegram/browser testing requires your own credentials.

---

# Phase 6 — Point of Sale (POS) upgrade

A new full-screen POS interface is available at **http://127.0.0.1:3000/admin/pos**. Log in to **/admin** first, then click **Point of Sale** in the left navigation. This is an upgrade of the existing Phase 5 Telegram/OpenRouter app and retains the existing `data/business.sqlite` database.

Features:
- Product grid with photos, search, and in-stock/low-stock filtering (uses your existing Products images).
- Live sale cart with + / −, remove, clear, and NGN discounts.
- Cash checkout with amount received and change calculation; cash sale marked completed by the cashier.
- Bank transfer checkout recorded as **pending**, not paid. Staff must verify receipt in the bank account before pressing **Confirm received** in Sales History. This is **manual confirmation**, not an automatic bank verification integration.
- Completed sales automatically deduct recorded stock and create stock movement records; no negative inventory.
- Sales history, receipt details, printable receipt, completed revenue totals and pending transfer count.
- Existing Telegram bot, product database, product image upload, orders, Paystack tracking, and website stay intact.

## Upgrade instructions for Windows

1. Stop the older Phase 5 bot with `Ctrl+C` and confirm with `Y` if prompted. **Do not run two versions of the same Telegram bot simultaneously.**
2. Back up the **entire** previous `data` folder (including `business.sqlite` and `product-images`) and `.env` file to a safe location before making changes.
3. Extract this ZIP. Open the new `telegram-business-bot-phase5` folder.
4. Copy your previous `.env` and `data` folder into the new folder. **Do not overwrite the backup.** This uses the same database, and the POS tables are created when the program starts.
5. Open Command Prompt in the extracted project folder:

```bat
node -v
npm install
npm test
npm start
```

6. Visit `http://127.0.0.1:3000/admin` and sign in. Select **Point of Sale** from the sidebar, or visit `/admin/pos`.
7. Add products and real images from **Products**. Use **Inventory** to add stock: POS checkout rejects purchases of items with no recorded stock.
8. Add items to the cart, choose Cash or Bank Transfer, then save checkout. **Use test products and test transactions first.**
9. In POS, click **Sales history** to open past sales, print receipts, and confirm genuinely received transfers.

### Troubleshooting

- `EADDRINUSE` on port 3000: stop the previous server; or change `PORT=3001` in `.env`, and open `http://127.0.0.1:3001/admin/pos`.
- A product says **Out of stock**: increase its recorded quantity under Admin → Inventory. The old description text `Stock: 25` is not a real stock record.
- POS says **Please log in**: open `/admin` and sign in before using `/admin/pos`.
- No product photos: upload photos through Admin → Products; POS reuses the same image URL as the public catalog.
- Cash sales are recorded as completed when the cashier confirms receipt of money; this is not a payment-gateway verification. Bank transfers remain pending until an authorized person manually confirms the deposit.
- If you previously created a transfer checkout, do not click **Confirm received** unless you independently verify the incoming funds.

## Validation

Run `npm test` and `npm run check`. Automated tests cover migration and stock/payment logic; browser end-to-end testing with your actual Telegram credentials and real payments must still be done on your computer. Use Node.js 22.13+ (Node 24 is suitable; `node:sqlite` may print an experimental warning).

## Phase 7: OpenRouter AI assistant upgrade

- The AI now reads current active products and inventory from the same SQLite database as the POS. It distinguishes **out of stock** from **stock not recorded**.
- Customer-specific order status context is limited to the sender's own Telegram chat ID. The AI cannot change orders, confirm payments, or adjust stock.
- Telegram `/products` returns the live catalog without using an AI model. `/order`, `/myorders`, and `/human` continue to work.
- Admin → **AI Settings → Test your AI with live product information** lets you test an OpenRouter reply without messaging a customer. Test calls use API tokens and may incur OpenRouter charges.
- Existing public site, image uploads, product importer, checkout, POS, payments, staff handover, orders and follow-ups remain included.

### Upgrading without losing business data (Windows)

1. Close the old Node.js bot (`Ctrl+C`) and **back up** the entire old `data` directory plus `.env` and any customized `business.json`.
2. Extract this ZIP to a **new** folder. Copy your backed-up `data` directory and `.env` into its `telegram-business-bot-phase5` folder; optionally copy your customized `business.json`.
3. Run `npm install`, `npm test`, then `npm start`. Only one version must poll your Telegram token. If port 3000 is occupied, stop the old server (or set `PORT=3001` in `.env`).
4. Open `/admin` → **AI Settings** and test a product or stock question. Open `/admin/pos` to verify existing POS records.
5. The Telegram bot still requires a valid `TELEGRAM_BOT_TOKEN`, `OPENROUTER_API_KEY`, model, `ADMIN_PASSWORD` (12+ characters) and `SESSION_SECRET` (32+ characters).

**Important:** The live-stock AI uses stock levels entered under Inventory. A product description mentioning “Stock: 25” does not establish recorded stock. The test interface never sends a Telegram message. The AI's generated text is not a substitute for verified payment or inventory operations.
"# telegram-business-bot" 
