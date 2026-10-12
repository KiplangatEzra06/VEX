# Vex

Vex is a personal AI chat assistant built with Node.js, Express, and Ollama Cloud.

## Local setup

1. Install the dependencies with `npm ci`.
2. Create a `.env` file in the project root with the variables described below.
3. Apply the database schema to Neon if using the existing server-backed history and settings:
   `psql "$DATABASE_URL" -f schema.sql`
4. Start the server with `npm start`.
5. Open http://localhost:3000 and enter your VEX passcode when prompted.

The chat request sends up to the 20 most recent messages to Ollama Cloud. Set `ALLOWED_ORIGIN` to `http://localhost:3000` when testing locally.

## Environment variables

- `OLLAMA_API_KEY` — Ollama Cloud API key.
- `OLLAMA_MODEL` — hosted model name; defaults to `gpt-oss:20b`.
- `VEX_PASSCODE` — private passcode required for all API requests.
- `ALLOWED_ORIGIN` — the exact allowed browser origin, including scheme (for example `https://your-service.onrender.com`).
- `DATABASE_URL` — Neon/Postgres connection string for the existing server-backed conversation history and settings endpoints.

Keep secrets in environment variables. The local `.env` file is ignored by Git and must not be committed.

## Render deployment

Create a Node web service and set:

- Build command: `npm ci`
- Start command: `npm start`
- Node version: `24.x` (also enforced by `package.json`)

Add the environment variables listed above in the Render dashboard. For `ALLOWED_ORIGIN`, use the exact deployed `https://<service>.onrender.com` origin. `DATABASE_URL` is required if you want to keep the existing Postgres-backed history and settings; apply `schema.sql` to that database before deployment.

Run `npm audit` locally after installing dependencies to check for vulnerable packages.
