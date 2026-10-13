# Non-Zero

A self-hosted habit tracker that installs on your phone and laptop. Named after the "no zero days" idea: do at least one thing every day.

- **Month sheet** on a laptop, like a paper habit tracker: one row per habit, one square per day
- **Day sheet** on a phone, with a week strip to move between days
- Tick-off habits and amount habits ("8 glasses", "20 minutes")
- Streaks, completion rates, a year heatmap and weekly bars
- Several profiles, each behind its own PIN
- Works offline; changes sync when the server is reachable
- Optional push reminders, sent only if the habit is not done yet

## Run with Docker

```bash
docker build -t non-zero .
```

```bash
docker run -d --name non-zero --restart unless-stopped -p 3210:3210 -v non-zero-data:/app/data non-zero
```

Open http://localhost:3210. The first visit on each device asks for the **admin key**:

```bash
docker exec non-zero cat /app/data/admin-key.txt
```

## Run without Docker

Needs Node 24.

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

`npm run dev` starts the API and a hot-reloading web app for development. Settings are in `.env`; see `.env.example`.

## Using it on a phone

Phones only install the app, keep you signed in, and allow reminders over **HTTPS**. Put the server behind one of:

- **Tailscale** (`tailscale serve 3210`): reachable only from your own devices
- **Cloudflare Tunnel** or **Caddy** on a server with a domain: reachable from anywhere

Set `TRUST_PROXY=1` when running behind any of these. Then open the address on the phone and choose "Add to Home Screen".

## Security

- A browser must be paired once with the admin key before it can see profiles or try a PIN.
- PINs are 4 to 8 digits, stored as salted scrypt hashes; repeated wrong attempts lock the profile for increasing periods.
- The PIN separates profiles on a shared device. It does not encrypt the copy of your data cached on that device for offline use.

## Backup

Everything lives in the data folder (the `non-zero-data` volume, or `data/`): the SQLite database, the admin key and the push keys. Each profile can also export and import a JSON file from Settings.

## Development

| Command | What it does |
|---|---|
| `npm run dev` | API and web dev server together |
| `npm test` | Unit and API tests |
| `npm run typecheck` | Type-check server and web |
| `npm run build` | Build the web app into `web/dist` |

`shared/` holds types and streak logic, `server/` the Fastify + SQLite API, and `web/` the React app and service worker.
