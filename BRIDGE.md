# Site bridge — this bot ↔ the VARNOX website

The website (the Vercel project that serves the pairing page and the dashboard) is driven
entirely by Postgres. It writes requests into a table and polls for the answer. This bot had
no database code at all, so the two could not see each other: the dashboard showed zero
sessions and the servers looked offline no matter what the bot was doing.

`lib/siteBridge.js` closes that gap. It is wired into `web.js`, which is what both deployment
targets start (`npm start` on Render, `node web.js` on Railway).

## What it does

| Table | Direction | Effect |
|---|---|---|
| `varnox_pairing_requests` | reads + writes | Claims pending rows, asks this bot's own `/code` route for a pairing code, writes the code back |
| `varnox_server_heartbeats` | writes | Refreshes this host's `last_seen` every 45 s → dashboard shows **BOT ONLINE** |
| `varnox_sessions` | writes | Mirrors live sessions → they appear in the dashboard and in the online count |

The status strings are the site's, not ours: `pending` → `code_generated` (with
`pairing_code`) or `failed` (with `error`), plus `expired` for rows that timed out.

## Enable it

One variable is required — the same database the website uses:

```bash
DATABASE_URL=postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

On Render this goes in the service's Environment tab; on Railway, in the service Variables.
Both accept pasting the Neon connection string as-is; `?sslmode=require` is kept and the
other query parameters are stripped, because the Node driver needs `sslmode` and ignores the rest.

Set it once and redeploy. **Without it the bridge logs one line and stays completely inert** —
no connection attempt, no timers, no behaviour change. There is also a hard off switch:

```bash
SITE_BRIDGE=off
```

## Optional settings

| Variable | Default | Purpose |
|---|---|---|
| `SITE_SERVER_ID` | `1` | Which host this is, 1–3. The dashboard has three slots. |
| `SITE_SERVER_NAME` | `Server <id>` | Label shown in the dashboard. |
| `SITE_BOT_URL` | `http://127.0.0.1:$PORT` | Where to reach this bot's `/code` route. Only change it if the bot is behind a proxy. |
| `SITE_HEARTBEAT_MS` | `45000` | Heartbeat interval. Keep under 120 000 or the dashboard marks the host offline. |
| `SITE_POLL_MS` | `5000` | How often the request queue is checked. |
| `SITE_SESSIONS_MS` | `30000` | How often sessions are mirrored. |
| `SITE_MAX_PER_TICK` | `2` | Cap on pairing codes requested per poll, so a burst cannot trip WhatsApp's rate limit. |

## Why it calls the bot's own `/code` route

`web.js` already owns pairing: rate limiting (`PAIRING_RATE_MAX`), the 515 restart dance, the
per-number session directory, socket recovery. A second Baileys implementation inside the
bridge would drift from that, and two live sockets for one number invalidate each other's
codes. So the bridge is transport only — it never touches Baileys.

## Running more than one host

The claim is a single `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)`, so with servers 1–3
all draining the same queue, each request is taken by exactly one host. None is taken twice,
and WhatsApp never issues two codes for one number.

## Which database it talks to

If you switch databases from the site's admin panel, the chosen URL is stored in
`varnox_settings` and the bridge reads it every 60 s — so the bot follows the website instead
of polling a database nobody writes to. Set `DATABASE_URL` to the site's *original* database
(the one in its Vercel env); that is the anchor the site itself bootstraps from.

## Checking it is live

```bash
curl -s "$SITE/api/stats"        # botOnline should be true, servers[] fresh
```

In the bot's logs:

```
[site-bridge] online as "Server 1" → ep-xxxx-pooler.region.aws.neon.tech
[site-bridge] request #12 for 254712345678
[site-bridge] request #12 -> code issued
```

## Troubleshooting

- **`[site-bridge] inactive`** — `DATABASE_URL` is not set on the service.
- **`[site-bridge] database unreachable`** … `bridge disabled` — the URL is wrong, the role
  password is stale, or the database has hit its usage limit. The bridge disables itself
  rather than retrying every five seconds forever; fix the URL and restart.
- **`heartbeat: relation "varnox_server_heartbeats" does not exist`** — you pointed at a
  different database than the site's. The site creates that schema on its first request.
- **Site says "BOT OFFLINE" while the bot logs look fine** — `SITE_SERVER_ID` is colliding
  with another host, or the heartbeat interval is above two minutes.
