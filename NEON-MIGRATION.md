# Neon migration: staged rollout (not live)

## Current state
- The migration branch has a safe Vercel maintenance handler (503) and an authenticated Telegram webhook route in the local createServer application.
- The deployed application is **not** wired to Neon yet. src/store.js, src/phase4.js and src/pos.js still use synchronous SQLite calls.
- Do **not** merge this branch or register the webhook until the complete asynchronous PostgreSQL refactor and tests are finished.

## Database setup
Connect Neon to the **correct Vercel project** and check Settings > Environment Variables for a connection string (often DATABASE_URL, POSTGRES_URL or NEON_DATABASE_URL). Keep its value secret. This is a development migration; use an isolated development database or branch, not an existing production database.

The schema is in db/postgres-schema.sql. scripts/migrate-postgres.js applies it within a transaction using:

```sh
npm install
npm run db:migrate
```

The command requires a connection string in your **local environment**. Do not commit .env. Check that the installed PostgreSQL client package matches package.json; regenerate and commit package-lock.json with npm install before using npm ci or a CI deployment.

This command creates tables only, it does **not** copy any records from your SQLite database, change the current application to PostgreSQL, migrate product photos, or activate Telegram.

## Source of truth
Back up the entire Windows data folder and uploaded images before changing the application. Schema creation is not a substitute for a tested SQLite-to-PostgreSQL data copy. Preserve record IDs and identity sequences when importing existing records.

## Next engineering changes
1. Replace the synchronous store and raw SQL calls with asynchronous pg queries; audit every call in bot.js, orderflow.js, ai.js, server.js, phase4.js and pos.js.
2. Replace SQLite BEGIN IMMEDIATE with database transactions on one dedicated PostgreSQL client, use row locks and atomic conditional inventory updates for checkout/transfer confirmation.
3. Add durable webhook update deduplication and concurrency handling with a unique processed_updates primary key.
4. Replace local product image writes with object storage and update image URLs.
5. Run integration tests against temporary Neon development tables and perform a dry-run import of existing SQLite records.
6. Restore the Vercel Express entry only after database tests pass; enable Telegram webhook after the deployment is verified.
