# Vex

Vex is a personal AI chat assistant built with Node.js, Express, and Ollama Cloud.

## Local setup

1. Install dependencies:
   npm ci
2. Create a `.env` file in the project root with `OLLAMA_API_KEY`, `OLLAMA_MODEL`, `VEX_PASSCODE`, `ALLOWED_ORIGIN`, and `DATABASE_URL`.
   Set `ALLOWED_ORIGIN` to the local app origin, such as `http://localhost:3000`.
3. Apply the database schema once to your Neon database before running the app:
   psql $DATABASE_URL -f schema.sql
4. Start the app:
   npm start

The app will run at http://localhost:3000 by default unless overridden with `PORT`.

## Neon database setup

This project now stores conversations and settings in Neon Postgres instead of local JSON files.

Before first use, run the SQL in `schema.sql` against your Neon database. This can be done from the Neon SQL editor or locally with:

psql $DATABASE_URL -f schema.sql

The schema creates the `conversations`, `messages`, and `settings` tables needed for message history and configuration persistence.

## Render deployment

Render can host this app as a Node web service using the same Express app. The frontend is served from the project’s `public/` folder, so there is no separate static host required.

Set these environment variables directly in the Render dashboard for the web service:

- `OLLAMA_API_KEY`
- `OLLAMA_MODEL` (optional; defaults to `gpt-oss:20b`)
- `VEX_PASSCODE`
- `ALLOWED_ORIGIN` (the exact deployed origin, such as `https://your-service.onrender.com`)
- `DATABASE_URL`

Set the Render build command to `npm ci`. Render provides `PORT` automatically. Do not commit or deploy a `.env` file; `.env` is gitignored.

Database schema must be applied to the Neon database once before first deploy (see `schema.sql`).

No persistent disk is required for Render. Neon is now the source of truth, so the app can restart or scale freely without losing conversation data.
