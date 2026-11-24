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

## Different Neon environment-variable name

If Vercel's Neon integration injects a custom key such as `NEON_PROJECT_DATABASE_URL`, create an additional **name-only** environment variable:
```
DATABASE_URL_ENV=NEON_PROJECT_DATABASE_URL
```
The value of `DATABASE_URL_ENV` is the **name** of the existing variable, not the database password or connection string. The resolver also recognizes `DATABASE_URL`, `POSTGRES_URL`, `NEON_DATABASE_URL`, `NEON_POSTGRES_URL`, and `POSTGRES_URL_NON_POOLING`. Only use one intended database connection per environment; prefer a separate Neon development branch for migration tests.

## Import existing Windows records (only after schema is created)

Make a backup of the Windows `data` folder, including `business.sqlite`, `business.sqlite-wal`, `business.sqlite-shm` if present, and `product-images`. Stop the old bot before making the final copy.

The migration branch now includes `npm run db:import-sqlite`. Set `SQLITE_SOURCE` to the **backed-up SQLite file** and set `DATABASE_URL` or `DATABASE_URL_ENV` as above. Run `npm run db:migrate` first. The importer refuses to run if any destination application table already has rows. Import all 14 tables in one PostgreSQL transaction, preserve existing IDs, and reset identity sequences. It does not upload image files or enable production traffic.

**Do not run the importer against a live production database.** Verify record counts, stock, payment reconciliation state, and a sample of orders in isolated Neon development storage. The new PostgreSQL application adapter is not yet complete.

## Dependencies and verification caveat

The branch declares `pg` as a dependency, but the checked-in `package-lock.json` has not yet been regenerated. On a development workstation with registry access, run `npm install` to update the lockfile, commit the resulting change, then run `npm test` and `npm run check`. Do not assume `npm ci` will succeed before the lockfile is updated. Tests have been added but no live Neon database tests have run.
