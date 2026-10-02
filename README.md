# URL Shortener with Analytics

A backend portfolio project that goes past CRUD: a Redis-cached redirect hot path,
rate limiting, buffered asynchronous click tracking, and MongoDB aggregation
dashboards.

Node.js + Express + MongoDB (Mongoose) + Redis, in plain ESM JavaScript.

---

## Quick start

```bash
cp .env.example .env      # optional: sensible defaults work in development
docker-compose up         # app on :3000, Mongo on :27017, Redis on :6379
```

Then open <http://localhost:3000/docs> for the Swagger UI.

**Full setup, deployment and manual-steps guide: [HOW-TO.md](./HOW-TO.md)** — covers
Render, Railway and VPS/Docker deploys, what to verify, and every task that has
to be done by hand.

Running without Docker:

```bash
npm install
npm run dev               # needs a MongoDB and Redis reachable
npm run seed              # optional: demo account with 14 days of click history
```

The seed script prints a demo login (`demo@example.com` / `demo-password-1234`).

```bash
npm test                  # Jest + Supertest, mongodb-memory-server for the DB
npm run loadtest -- --code <shortCode> --duration 10
```

---

## Architecture

```
                    ┌──────────────────────────────────────────┐
   GET /:code  ────►│  rate limit (Redis store)                 │
   (hot path)        └──────────────────┬───────────────────────┘
                                       ▼
                              ┌────────────────┐   hit    ──► 302 Location
                              │  Redis          │──────────────►
                              │  code → longUrl │
                              └───────┬────────┘
                                      │ miss
                                      ▼
                              ┌────────────────┐
                              │  MongoDB urls   │──► 302 Location
                              └────────────────┘

   Every resolved redirect pushes a click event into an in-process buffer:

              ┌──────────────────┐   batched    ┌───────────────┐
              │  click buffer    │─────────────►│ clicks insert │
              │  (200 / 1s)      │              ├───────────────┤
              └──────────────────┘              │ daily_stats   │
                                               │ urls.$inc     │
                                               └───────────────┘
```

`GET /api/urls/:id/analytics/*` reads the aggregation pipeline over `clicks`,
or the pre-aggregated `daily_stats` where a per-day counter is enough.

| Folder | Contents |
|---|---|
| `src/config/` | env, Mongo connection, Redis client |
| `src/models/` | User, Url, Click, DailyStats, Session |
| `src/routes/` | Express routers |
| `src/controllers/` | request handling, DTO shaping |
| `src/services/` | url, cache, analytics, click queue |
| `src/middleware/` | auth, validation, rate limiting, error handling |
| `src/utils/` | code generation, UA parsing, visitor hashing, logger, tokens |

---

## Design decisions and trade-offs

These are the questions to expect in an interview.

**1. Short codes: nanoid, not a Redis counter.**
Codes are 7-character base62 (`nanoid` with an alphanumeric alphabet, 62⁷ ≈ 3.5
trillion combinations). The unique index on `code` is the real guarantee, so
`createUrl` retries up to 5 times on a duplicate-key error. The alternative — an
atomic Redis `INCR` rendered as base62 — gives true zero-collision codes and is
faster to allocate, but it makes short codes *sequential and therefore
enumerable*, which leaks total volume and lets someone harvest links by walking
the space. Random codes that are merely improbable are the better trade here.

**2. 302, never 301.**
Browsers cache a 301 permanently and never ask the server again, so every repeat
click would be invisible to analytics. 302 keeps the redirect per-request, which
is the whole point of a service that reports click counts. Responses also carry
`X-Cache: hit|miss` and `X-Response-Time` so you can prove the cache is working.

**3. The redirect never waits for analytics.**
A resolved click is pushed into an in-process buffer and the 302 goes out
immediately. The buffer flushes every 200 events or 1 second, whichever comes
first, and does the work in three bulk operations: `insertMany` on `clicks`,
`$inc` on `urls.totalClicks`, and upserts on `daily_stats`. A hot link therefore
costs O(1) writes per 200 redirects rather than one write per redirect. The cost
is that counts are eventually consistent by up to a second, and events buffered
in a crashed process are lost — the documented next step is a BullMQ queue.

**4. Hot links are cached in Redis, fail-soft.**
`code → longUrl` is cached for an hour. Every cache function catches its own
errors and returns a miss, so a Redis outage costs latency but never
availability — the app boots and serves straight from MongoDB. Cache validity is
re-checked on read (`isActive`, `expiresAt`, click cap) so a short-lived
expiry can never be extended by the cache, and `updateUrl` writes a short-lived
tombstone bounded by the link's own remaining lifetime.

**5. Raw IPs are never stored.**
Unique visitors are counted with `HMAC-SHA256(VISITOR_SALT, ip)`, truncated. A
plain hash would not be enough: IPv4 is only 2³² values, so the hash list can be
brute-forced back to raw addresses in seconds. The salt makes that mapping
non-reversible; the trade-off is that changing the salt resets unique counts.

**6. Auth: short-lived JWT access tokens, opaque rotating refresh tokens.**
Access tokens are 15 minutes. Refresh tokens are random 48-byte strings stored
as a SHA-256 hash in a `sessions` collection, and they are **single-use** — the
`/refresh` endpoint revokes the presented token and issues a new one, so a
stolen refresh token is usable at most once and the legitimate client's next
refresh fails loudly. A signed refresh JWT would be stateless but unrevocable
without the denylist you were trying to avoid. Logout revokes one session; the
`expiresAt` TTL index lets Mongo reap the rest.

**7. Validation and open-redirect defence.**
Zod parses every body, query and param, with `.strict()` on write paths so
unknown fields are rejected rather than silently dropped. `validateLongUrl`
allows only `http`/`https` and rejects `javascript:`, `data:`, `file:` and
`blob:`, and refuses any link pointing back at this service's own host — a link
to yourself is both a redirect loop and a way to launder an open redirect
through the service's own domain.

**8. Analytics: aggregations, plus a rollup.**
`summary`, `timeseries` and `breakdown` are Mongo aggregation pipelines over
`clicks`, scoped by the `{ urlId, isBot, timestamp }` compound index. The
`timeseries` endpoint densifies its output so charts get a point for every
period rather than only active ones. Because `$addToSet` over every click is
O(clicks in range), a parallel `daily_stats` collection carries per-day counters
written during the same flush; the `/analytics/daily` endpoint reads O(days)
documents instead. That is the honest version of the blueprint's stretch goal.

---

## API

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | – | Create account |
| POST | `/api/auth/login` | – | Access + refresh tokens |
| POST | `/api/auth/refresh` | – | Rotate a refresh token |
| POST | `/api/auth/logout` | – | Revoke a refresh token |
| GET | `/api/auth/me` | ✔ | Current profile |
| POST | `/api/urls` | ✔ | Create a short link |
| GET | `/api/urls` | ✔ | List your links (paginated) |
| GET | `/api/urls/:id` | ✔ | One of your links |
| PATCH | `/api/urls/:id` | ✔ | Update or deactivate |
| DELETE | `/api/urls/:id` | ✔ | Delete |
| GET | `/api/urls/:id/analytics` | ✔ | Clicks, unique visitors |
| GET | `/api/urls/:id/analytics/timeseries?range=7d` | ✔ | Clicks per day/hour |
| GET | `/api/urls/:id/analytics/breakdown` | ✔ | By country, device, browser, referrer, OS |
| GET | `/api/urls/:id/analytics/recent` | ✔ | Latest raw clicks |
| GET | `/api/urls/:id/analytics/daily` | ✔ | Pre-aggregated rollups |
| **GET** | **`/:code`** | **–** | **302 redirect (hot path)** |
| GET | `/health` | – | Liveness + dependency status |
| GET | `/docs` | – | Swagger UI |

Ranges: `24h` (hourly buckets), `7d`, `30d`, `90d`, `all` (daily buckets).

Rate limits: 10 / 15 min on auth, 20 / hour on link creation, 600 / min on
redirects, 120 / min on reads. In production they are stored in Redis so limits
hold across instances.

Errors are uniform: `{ "error": { "code", "message", "details?" } }`.

---

## Benchmarks

Run against a link that exists, on an otherwise idle machine:

```bash
npm start
npm run loadtest -- --code <shortCode> --duration 10 --connections 100
```

The script runs a cold pass (cache purged, so reads hit MongoDB) and a warm
pass, then prints a comparison table. Paste your real numbers here — the
placeholder below is **not** measured output:

| Scenario | req/s | p50 | p95 | p99 | non-2xx |
|---|---|---|---|---|---|
| cold (no cache) | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ |
| warm (Redis) | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ |

The README bullet to update afterwards:

> Built a URL shortener with analytics (Node.js, Express, MongoDB, Redis) with
> Redis-cached redirects, rate limiting, and async click tracking; load-tested at
> **X req/s** with **Y ms p95 latency**; containerized with Docker and CI via
> GitHub Actions.

---

## Testing

`npm test` runs four suites against a real MongoDB (`mongodb-memory-server`) and,
if one is reachable, a real Redis:

- `auth.test.js` — registration, login, token rotation and replay rejection, logout
- `url.test.js` — CRUD, alias collisions, open-redirect and `javascript:` rejection, ownership isolation
- `redirect.test.js` — 302 not 301, cache hit/miss, expiry, click cap, UA parsing, IP hashing
- `analytics.test.js` — aggregation ranges, bot filtering, empty-bucket fill, daily rollup

CI (`.github/workflows/ci.yml`) runs the suite against service containers and
then builds the Docker image.

---

## Future improvements

- **BullMQ click queue.** The in-process buffer loses events on crash and cannot fan out. A Redis-backed queue with retries and a dead-letter list is the real fix; the `recordClick`/`flush` seam is where it would slot in.
- **QR codes** per link, and a **link preview** (title, favicon, safe-browsing check) fetched on creation.
- **Password-protected links** with a separate high-entropy secret, so the `code` alone does not grant access.
- **Domain aliases** for custom short domains, and per-tenant rate limits.
- **Geographic aggregation** in the rollup so large ranges read from `daily_stats` rather than re-scanning clicks.
- **Sharding** `clicks` by `urlId` once a single link's click volume outgrows a node, and a materialized-view refresh for the dashboards.

---

## Configuration

Every variable is documented in `.env.example`. In production the server refuses
to boot if `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` or `VISITOR_SALT` are
missing, still hold the placeholder, or are shorter than 32 characters.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `BASE_URL` | `http://localhost:3000` | Prefix for returned short links |
| `MONGO_URI` | `mongodb://localhost:27017/url_shortener` | Mongo connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `JWT_ACCESS_SECRET` | dev fallback | Access token signing key |
| `JWT_REFRESH_SECRET` | dev fallback | Refresh session lookup |
| `ACCESS_TOKEN_TTL` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Refresh token lifetime |
| `VISITOR_SALT` | dev fallback | HMAC key for visitor hashing |
| `CACHE_TTL_SECONDS` | `3600` | Redirect cache TTL |
| `CLICK_BUFFER_SIZE` | `200` | Clicks per bulk write |
| `CLICK_FLUSH_INTERVAL_MS` | `1000` | Max time a click waits in the buffer |

---

## License

MIT
#   U R L - s h o r t e n e r - w i t h - a n a l y t i c s  
 