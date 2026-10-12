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

Conversation data is kept in browser storage so unsaved conversations survive refreshes. When `DATABASE_URL` is configured, completed chat turns are also saved to the existing Postgres history; if that sync is unavailable, the reply remains saved locally and the composer reports the sync issue. Markdown rendering is performed with DOM nodes (not HTML injection). Code blocks include a copy action, and supported common languages receive lightweight token coloring.

The composer retains browser voice input where available. The file picker currently selects a local file name only; file contents are not uploaded or sent to the model.

## Interface

- Use **Settings → Appearance** to choose System, Dark (Midnight Circuit), or Light (Arctic Signal). Explicit choices are stored in this browser; System follows the device preference.
- Use the sidebar collapse control and the conversation-history control in the header to adjust the desktop workspace.
- On narrow screens, use the menu and history buttons to open the navigation and history drawers.
- Press `/` outside a text field to focus conversation search; press `Escape` to close a drawer or dialog.
- Assistant Markdown supports headings, emphasis, lists, links, blockquotes, inline code, and fenced code blocks. External links open safely in a separate tab.

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
