# How to Run and Deploy This Project

Everything needed to get it running locally and in production, plus an explicit
list of the things **you** have to do by hand (secrets, accounts, DNS, measured
benchmark numbers).

Related docs: [README.md](./README.md) (architecture, design decisions, API),
[openapi.yaml](./openapi.yaml) (API spec).

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Manual setup checklist](#2-manual-setup-checklist)
3. [Run locally — the easy way (Docker)](#3-run-locally--the-easy-way-docker)
4. [Run locally — the bare way (no Docker)](#4-run-locally--the-bare-way-no-docker)
5. [Verify it works](#5-verify-it-works)
6. [Run the tests](#6-run-the-tests)
7. [Run the benchmark](#7-run-the-benchmark)
8. [Deploy — Render (recommended)](#8-deploy--render-recommended)
9. [Deploy — Railway](#9-deploy--railway)
10. [Deploy — a VPS with Docker](#10-deploy--a-vps-with-docker)
11. [Environment variables](#11-environment-variables)
12. [Post-deploy manual steps](#12-post-deploy-manual-steps)
13. [Operations and troubleshooting](#13-operations-and-troubleshooting)
14. [Manual tasks summary](#14-manual-tasks-summary)

---

## 1. Prerequisites

| Tool | Version | Needed for | How to check |
|---|---|---|---|
| Node.js | **20 or newer** | running the app | `node -v` |
| npm | 10+ (bundled with Node 20) | installing deps | `npm -v` |
| Docker Desktop | 4.x+ | the one-command path | `docker -v` |
| Git | any | version control | `git --version` |
| A code editor | — | obviously | — |

Node 20 is the floor because the app uses the built-in `fetch` (load-test script,
Docker healthcheck) and modern ESM. Node 18 will fail.

On Windows, if `npm` blocks with a PowerShell execution-policy error, run commands
in **Git Bash** (this shell) or use `npm.cmd` in PowerShell.

---

## 2. Manual setup checklist

These are the steps that cannot be automated. Do them once.

### 2.1 Generate secrets

You need three random secrets. **Never reuse the defaults in production.**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run it three times and save the output. Label them:

| Label | Goes in | Min length |
|---|---|---|
| JWT access secret | `JWT_ACCESS_SECRET` | 32 chars |
| JWT refresh secret | `JWT_REFRESH_SECRET` | 32 chars |
| Visitor salt | `VISITOR_SALT` | 32 chars |

> **On `VISITOR_SALT`:** this is the HMAC key used to hash visitor IPs. Changing
> it invalidates every existing unique-visitor count. Set it once and leave it.
> If you ever leak it, rotate it and accept the reset.

Keep these in a password manager or your platform's secret store, **not** in the
repo. The app refuses to boot in production if any of them is missing, shorter
than 32 characters, or still equals the `change-me` placeholder.

### 2.2 Pick a public base URL

Decide the domain your short links will use *before* you deploy — it goes into
`BASE_URL`, and changing it later means every link you already shared points at
the wrong host.

| Where you deploy | `BASE_URL` becomes |
|---|---|
| Local Docker | `http://localhost:3000` (default, no action needed) |
| Render | `https://<your-app>.onrender.com` |
| Railway | `https://<your-app>.up.railway.app` |
| Own VPS | `https://<your-domain>` |

### 2.3 Decide on a database strategy

| Option | Good for | Trade-off |
|---|---|---|
| **MongoDB Atlas free tier (M0)** | demos, portfolios, CI | 512 MB, sleeps after 30 min idle, shared cluster |
| **Self-hosted Mongo in Docker** | a real VPS, no vendor | you own backups |
| **Railway/Render managed volume** | simplest single-service deploy | ties you to that platform |

For a portfolio project, **Atlas free tier is the right call**: free, no ops, and
the connection string is what you paste into the deploy platform.

### 2.4 Initialise the repository (if you have not)

```bash
cd /x/url-shortener
git init
git add .
git commit -m "Initial commit: URL shortener with analytics"
```

`.gitignore` already excludes `node_modules/`, `.env` and coverage output. Verify
before your first push:

```bash
git status --short          # .env and node_modules must NOT appear
```

---

## 3. Run locally — the easy way (Docker)

One command brings up the app, MongoDB and Redis.

```bash
cd /x/url-shortener
docker-compose up
```

The first build takes a few minutes. When you see:

```
Server listening on http://localhost:3000 (development)
MongoDB connected
Redis connected
```

it is ready. Open <http://localhost:3000/docs> for the Swagger UI.

Stop with `Ctrl+C`. To wipe the database and start fresh:

```bash
docker-compose down -v        # -v also deletes the mongo-data volume
```

> **Gotcha:** `docker-compose` (with a hyphen) is the v1 command. If you have
> Compose v2 (the current default in Docker Desktop), the command is
> `docker compose up` — with a space. If `docker-compose: command not found`,
> use `docker compose up`.

### What you do *not* need to do with Docker

`docker-compose.yml` sets `MONGO_URI` and `REDIS_URL` to the internal service
names (`mongo:27017`, `redis:6379`), so **no `.env` file is required**. Secrets
fall back to development values, which is fine locally.

---

## 4. Run locally — the bare way (no Docker)

Use this if you prefer running services natively, or you already have MongoDB and
Redis installed.

### 4.1 Start the dependencies

**MongoDB** — installed as a service (Windows: it runs in the tray; macOS:
`brew services start mongodb-community`; Linux: `sudo systemctl start mongod`).

Verify: `mongosh --eval "db.runCommand({ping:1})"`

**Redis** — Windows needs a port (WSL, Docker, or Memurai). `redis-server` on
macOS/Linux; verify with `redis-cli ping` → `PONG`.

### 4.2 Install and configure

```bash
cd /x/url-shortener
cp .env.example .env
npm install
```

`.env.example` already points at `localhost` defaults, so you can run as-is for
development. Edit `.env` only if you want non-default ports or a different
`BASE_URL`.

### 4.3 Run

```bash
npm run dev          # auto-restarts on file changes
# or
npm start            # plain node, no watcher
```

MongoDB is **required**. Redis is optional — if it is down the app logs a
warning and serves redirects straight from MongoDB, so the API still works, just
slower. This is intentional, not a bug.

### 4.4 Optional: seed demo data

```bash
npm run seed
```

Prints a login. This **wipes all existing data** first (it drops users, urls,
clicks and daily_stats), so only run it against a database you do not mind
losing.

```
Seeded 5 links and 84 clicks for demo@example.com (password: demo-password-1234)
```

---

## 5. Verify it works

### 5.1 Health check

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "uptime": 42,
  "mongo": "connected",
  "redis": "ready",
  "clickWriter": { "buffered": 0, "flushed": 0, "dropped": 0, "flushes": 0, "pending": 0 }
}
```

`mongo: "connected"` is the one that must be true. `redis` may be anything — the
app degrades gracefully.

### 5.2 End-to-end with curl

Register, create a link, follow it. Run these one at a time.

```bash
# 1. Register (password must be at least 12 characters)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"correct-horse-battery"}'
```

Copy the `accessToken` from the response into a variable:

```bash
TOKEN="paste-your-access-token-here"
```

```bash
# 2. Create a short link
curl -X POST http://localhost:3000/api/urls \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"longUrl":"https://developer.mozilla.org/en-US/","customAlias":"mdn"}'

# 3. Follow it (note: -i to see the response headers, -L would follow the redirect away)
curl -i http://localhost:3000/mdn
```

Step 3 should return:

```
HTTP/1.1 302 Found
X-Cache: miss
Location: https://developer.mozilla.org/en-US/
```

**Check `X-Cache`.** Run step 3 twice: the first should say `miss`, the second
`hit`. If both say `miss`, Redis is not working — the rest of the app still
works, but the cache is not doing its job. See [§13](#13-operations-and-troubleshooting).

```bash
# 4. Read analytics (click 3 a few times first, then wait ~1s for the flush)
curl "http://localhost:3000/api/urls/<URL_ID>/analytics?range=7d" \
  -H "Authorization: Bearer $TOKEN"
```

### 5.3 What success looks like

| Check | Expected |
|---|---|
| `GET /health` | `"mongo": "connected"` |
| `GET /:code` | `302` with a `Location` header |
| `X-Cache` on 2nd request | `hit` |
| `POST /api/urls` with `javascript:alert(1)` | `400 INVALID_PROTOCOL` |
| `POST /api/urls` with `http://localhost:3000/x` | `400 REDIRECT_LOOP` |
| Analytics summary | `totalClicks` rises after you click the link |

---

## 6. Run the tests

```bash
npm test
```

Four suites, roughly 40 assertions. The suite spins up its own MongoDB via
`mongodb-memory-server`, so **you do not need a running MongoDB or Redis** —
it downloads a Mongo binary on first run (a few minutes once, cached after).

Expected shape of a good run:

```
Test Suites: 4 passed, 4 total
Tests:       N passed, N total
```

### Common test failures

| Symptom | Cause | Fix |
|---|---|---|
| `MONGOMS_*` / download errors | No internet, or a proxy | Set `MONGOMS_DOWNLOAD_MIRROR`, or run `npx mongodb-memory-server` once with network access |
| `ECONNREFUSED` on `6379` | Redis not running | Fine — cache tests fall back to the miss path and still pass. Or start Redis. |
| `ValidationError` on `clicks` | Indexes not built | `autoIndex` is off in production; in dev it is on. Ensure `NODE_ENV` is not `production` locally. |
| Timeout | First-run Mongo download | Re-run; the binary is now cached |

---

## 7. Run the benchmark

**This is the one thing that produces the numbers for your README.** Do it on a
machine that is otherwise idle — close the IDE, stop other servers, ideally close
other browser tabs.

```bash
# Terminal 1 — the app
npm start

# Terminal 2
npm run loadtest -- --code mdn --duration 30 --connections 100
```

The script runs a **cold** pass (purges the cache first, so reads hit MongoDB) and
a **warm** pass (all Redis), then prints a table:

```
scenario         req/s  p50 (ms)  p95 (ms)  p99 (ms)  non-2xx
--------------  ------  --------  --------  --------  -------
cold (no cache)    ...      ...       ...       ...       ...
warm (Redis)       ...      ...       ...       ...       ...

p95 improvement with cache: X.XXx
```

> **Note:** on Windows with a non-WSL shell, the argument forwarding for `npm run
> --` sometimes drops. If `--code mdn` is ignored, call the script directly:
> `node scripts/loadtest.js --code mdn --duration 30`.

### Manual step: fill in the README

Copy the real numbers into the **Benchmarks** table in `README.md` (it currently
says `_measure_`) and update the résumé bullet with the req/s and p95 figures.
**Do not quote numbers you did not measure.**

---

## 8. Deploy — Render (recommended)

Render gives you a free web service and a public URL, which is all a portfolio
project needs.

### 8.1 What you need

- A GitHub repo with this project pushed
- A MongoDB Atlas cluster (free tier)
- Optionally a Render Redis instance, or skip Redis (the app runs without it)

### 8.2 Manual steps

1. **Create the Atlas cluster.**
   - [cloud.mongodb.com](https://cloud.mongodb.com) → **Create** → free **M0**
   - Database Access → **Add New Database User** — note username and password
   - Network Access → **Add IP Address** → **Allow access from anywhere**
     (`0.0.0.0/0`). Required because Render's IPs are not static. The cluster is
     free and empty, so this is acceptable for a demo; do not do it in production.
   - **Deploy** the cluster (takes ~2 min), then copy the **SRV connection
     string**. It looks like:
     `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   - **URL-encode the password** if it contains `@ : / ? # [ ]` — Atlas rejects
     raw special characters in a connection string.

2. **Push the code** to GitHub, with `.env` excluded (check `git status`).

3. **Create the Render service.**
   - [dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**
   - Connect the GitHub repo
   - Region: pick the same region as your Atlas cluster for lower latency
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free (this app idles on free, but so do most demos)

4. **Add environment variables** (Render → Environment):

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `10000` (Render injects this; it is the required port) |
   | `MONGO_URI` | your Atlas SRV string |
   | `REDIS_URL` | `redis://redis:6379` if you add a Render Redis, else leave blank |
   | `JWT_ACCESS_SECRET` | from [§2.1](#21-generate-secrets) |
   | `JWT_REFRESH_SECRET` | from §2.1 |
   | `VISITOR_SALT` | from §2.1 |
   | `BASE_URL` | `https://<your-service>.onrender.com` |

   Set `BASE_URL` **after** Render tells you the hostname — the service name
   becomes the URL.

5. **Deploy**, then check the logs. You should see `Server listening` and
   `MongoDB connected`. A `JWT_ACCESS_SECRET must be set in production` error
   means step 4 was missed.

6. **Add a Render Redis** (optional but recommended for the benchmark):
   Render → New → Redis → copy the `REDIS_URL` into the service's environment and
   redeploy. Free tier is fine.

### 8.3 Verify

```bash
curl https://<your-service>.onrender.com/health
```

Expect `"mongo": "connected"`. Then open `https://<your-service>.onrender.com/docs`
for the live Swagger UI.

### 8.4 Free-tier caveat

Render's free services spin down after 15 minutes of inactivity and take ~30s to
wake on the next request. The first request after a cold start is slow; the rest
are normal. For a résumé demo, open the link shortly before you present, or use
the paid starter instance.

---

## 9. Deploy — Railway

Railway deploys the whole stack from one project, which is a different shape from
Render.

### 9.1 Manual steps

1. Install the CLI: `npm i -g @railway/cli`
2. `railway login`
3. From the project directory:
   ```bash
   railway init
   railway up
   ```
4. Add the services (Railway dashboard → your project → **+ New**):
   - **MongoDB** — Railway provides one, or paste an Atlas SRV string into a
     plain `DATABASE_URL` variable
   - **Redis**
5. Set environment variables on the **app** service. Railway exposes services to
   each other by their service name:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGO_URI` | `${{MongoDB.DATABASE_URL}}` (Railway variable reference) |
   | `REDIS_URL` | `${{Redis.REDIS_URL}}` |
   | `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `VISITOR_SALT` | from §2.1 |
   | `BASE_URL` | `https://<your-app>.up.railway.app` |

6. Generate a public domain: **Settings → Networking → Generate Domain**.

### 9.2 Watch out

- Railway injects `PORT` automatically; the app reads it.
- If you created a bare `DATABASE_URL` service, convert it to a real Mongo service
  or make sure the value is a full `mongodb://` URI, not a bare host.

---

## 10. Deploy — a VPS with Docker

The most production-like option, and the one that best matches what you would
show in an interview. A $4/month VPS is enough.

### 10.1 Provision

```bash
ssh root@your-server-ip
adduser deploy && usermod -aG sudo deploy
# point your SSH config at `deploy`, then reconnect
```

Install Docker on Ubuntu:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

### 10.2 DNS first (manual, do this before deploying)

At your domain registrar, add an **A record**:

| Name | Type | Value |
|---|---|---|
| `short.example.com` | A | your server's IPv4 address |

Verify propagation before continuing — this is the step people skip and then
debug as "the app won't load":

```bash
nslookup short.example.com
```

### 10.3 Deploy

```bash
# On the server
git clone <your-repo-url> /home/deploy/url-shortener
cd /home/deploy/url-shortener

# Write the production env file (manual)
nano .env
```

`.env` on the server:

```bash
NODE_ENV=production
PORT=3000
BASE_URL=https://short.example.com
MONGO_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=<48-byte hex>
JWT_REFRESH_SECRET=<48-byte hex>
VISITOR_SALT=<48-byte hex>
```

`docker-compose up -d` reads `.env` automatically, which is how the
`${JWT_ACCESS_SECRET}` placeholders in `docker-compose.yml` get filled. Then:

```bash
docker-compose up -d --build
docker-compose ps          # all three should be healthy/Up
curl -s localhost:3000/health
```

### 10.4 Put it behind HTTPS (manual)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d short.example.com
```

Certbot rewrites the nginx config and renews automatically. This step is manual
by design — it requires your domain and your email.

A minimal nginx server block:

```nginx
server {
  listen 80;
  server_name short.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

> **Do not skip the `X-Forwarded-*` headers.** The app reads `req.ip` for
> rate-limit buckets and visitor hashing. Without these, every visitor behind
> nginx looks like one IP — they all share a rate-limit bucket, and unique
> visitor counts collapse to 1. The app sets `trust proxy`, so forwarding the
> headers is enough.

### 10.5 Updating later

```bash
cd /home/deploy/url-shortener
git pull
docker-compose up -d --build
```

### 10.6 Backups (manual, set up a schedule)

Atlas backs itself up if you enable it. For a self-hosted Mongo:

```bash
docker-compose exec -T mongo mongodump --archive --gzip > backup-$(date +%F).archive.gz
```

Put that in a cron job and copy the archive off the machine.

---

## 11. Environment variables

| Variable | Required in prod | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | yes | `development` | Enables the production secret checks |
| `PORT` | provider-set | `3000` | HTTP port |
| `BASE_URL` | **yes** | `http://localhost:3000` | Prefix for returned short links. **Wrong value = shared links point at the wrong host.** |
| `MONGO_URI` | yes | `mongodb://localhost:27017/url_shortener` | Mongo connection string |
| `REDIS_URL` | no | `redis://localhost:6379` | Redis connection |
| `JWT_ACCESS_SECRET` | yes | dev fallback | Access token signing key |
| `JWT_REFRESH_SECRET` | yes | dev fallback | Refresh session lookup |
| `ACCESS_TOKEN_TTL` | no | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | no | `7` | Refresh token lifetime |
| `VISITOR_SALT` | yes | dev fallback | HMAC key for visitor IP hashing |
| `CACHE_TTL_SECONDS` | no | `3600` | Redirect cache TTL |
| `CLICK_BUFFER_SIZE` | no | `200` | Clicks per bulk write |
| `CLICK_FLUSH_INTERVAL_MS` | no | `1000` | Max time a click waits in the buffer |
| `LOG_LEVEL` | no | `info` | `error` / `warn` / `info` / `debug` |

The app **refuses to start in production** if `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET` or `VISITOR_SALT` is missing, still contains `change-me`, or
is under 32 characters. That is intentional — it turns a silent security hole
into a loud boot failure.

---

## 12. Post-deploy manual steps

Work through this after the first successful deploy.

1. **Set `BASE_URL` correctly.** Verify a created link resolves:
   ```bash
   curl -s -X POST https://your-domain/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"smoke@example.com","password":"correct-horse-battery"}'
   # create a link, then follow the returned shortUrl
   ```

2. **Run the benchmark against production** (optional but valuable):
   ```bash
   npm run loadtest -- --code <shortCode> --duration 30
   ```
   Note that these numbers include network distance to the server. For the
   cleanest "cache vs no cache" comparison, run it on the VPS itself.

3. **Seed demo data** if you want a populated dashboard:
   ```bash
   docker-compose exec app node scripts/seed.js
   ```
   Then change the demo password, or delete the demo user — it has a well-known
   password.

4. **Update the README** with the live URL and real benchmark numbers.

5. **Commit and tag:**
   ```bash
   git add -A && git commit -m "Add deployment docs" 
   git tag v1.0.0
   ```

---

## 13. Operations and troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `MONGOMS` download fails in tests | No network / proxy | Set `MONGOMS_DOWNLOAD_MIRROR`; run once with network access |
| `X-Cache` always `miss` | Redis not connected | Check `GET /health` → `redis` field. Look for `Redis unavailable` in logs |
| `X-Cache` always `hit` after edits | Stale cache | Expected for up to `CACHE_TTL_SECONDS`; a PATCH tombstones the key immediately |
| Rate limited immediately | `trust proxy` not forwarded behind nginx | Add the `X-Forwarded-*` headers ([§10.4](#104-put-it-behind-https-manual)) |
| Unique visitors always 1 | Same as above — everyone hashes to one IP | Same fix |
| Expired links still resolve | Under 1 hour cache TTL | Expected; the TTL index and the cache both respect `expiresAt` |
| `Analytics shows 0 clicks` right after clicking | Clicks are buffered | Wait ~1 second (`CLICK_FLUSH_INTERVAL_MS`) |
| `Analytics shows 0 clicks` for old clicks | The range window | Try `range=all` |
| App boots but `/health` says `mongo: disconnected` | Bad `MONGO_URI` | Check the string, and that Atlas allows your IP |
| Render: "Failed to start" | Missing secret or wrong port | Set `NODE_ENV=production` and `PORT=10000` |
| Atlas: "connection refused" | IP not allowlisted | Add `0.0.0.0/0` under Network Access |
| Docker: `command not found: docker-compose` | Compose v2 installed | Use `docker compose up` (space, not hyphen) |
| Boot fails: `JWT_ACCESS_SECRET must be set` | Placeholder in production | Generate a real secret ([§2.1](#21-generate-secrets)) |

Useful commands:

```bash
docker-compose logs -f app
docker-compose restart app
docker-compose exec app node -e "console.log(process.env.BASE_URL)"   # confirm env
docker-compose down -v          # reset everything
curl -s localhost:3000/health/cache    # how many cache keys exist
```

---

## 14. Manual tasks summary

Everything in this project that requires **you**, not a command:

### One-time, before first deploy

- [ ] Generate 3 random secrets and store them in a password manager ([§2.1](#21-generate-secrets))
- [ ] Choose the public `BASE_URL` ([§2.2](#22-pick-a-public-base-url))
- [ ] Create a MongoDB Atlas cluster, add a database user, allowlist `0.0.0.0/0`, copy the SRV string ([§8.2](#82-manual-steps))
- [ ] `git init` and confirm `.env` / `node_modules` are not staged ([§2.4](#24-initialise-the-repository-if-you-have-not))
- [ ] Push to GitHub

### Per-environment, every deploy

- [ ] Set `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `VISITOR_SALT` in the platform's secret store
- [ ] Set `MONGO_URI` and `BASE_URL`
- [ ] Set `PORT` to whatever the platform injects (Render: `10000`)
- [ ] Confirm the deploy logs show `MongoDB connected`

### If deploying to your own domain

- [ ] Add the DNS **A record** and verify with `nslookup` before deploying ([§10.2](#102-dns-first-manual-do-this-before-deploying))
- [ ] Run certbot for HTTPS ([§10.4](#104-put-it-behind-https-manual))
- [ ] Add the `X-Forwarded-*` headers to nginx — **without these, rate limiting and unique visitors break**
- [ ] Schedule Mongo backups ([§10.6](#106-backups-manual-set-up-a-schedule))

### For the README / résumé

- [ ] Run the benchmark on an idle machine and paste **real** numbers into the Benchmarks table ([§7](#7-run-the-benchmark))
- [ ] Update the résumé bullet with your measured req/s and p95
- [ ] Add the live demo URL to the README
- [ ] Change or delete the seeded demo account's password if you seeded production

### Ongoing

- [ ] Rotate `VISITOR_SALT` only if it leaks — **note this resets all unique-visitor counts**
- [ ] Review Atlas / Redis memory usage as click volume grows
