# Docker and GitHub Actions Deployment Guide

This guide describes a practical deployment path:

1. GitHub Actions validates every change.
2. A push to `main` builds the Docker image.
3. The image is published to GitHub Container Registry (GHCR).
4. GitHub Actions connects to a Linux Docker host over SSH.
5. The host pulls the image and restarts the Compose stack.

The deployment host must provide persistent storage and backups for MongoDB. For a serious production workload, use managed MongoDB and Redis instead of self-hosting both databases.

## Architecture

```text
GitHub push
  -> CI: npm ci, audit, syntax checks, tests
  -> CD: build Docker image
  -> GHCR: publish image
  -> SSH: remote docker compose pull/up
  -> API + MongoDB + Redis
```

## 1. Prepare the production host

Use a supported Linux server with:

- Docker Engine
- Docker Compose v2
- SSH access
- Firewall allowing only SSH and the public HTTP/HTTPS reverse proxy
- Persistent disk backups

Do not expose MongoDB port `27017` or Redis port `6379` publicly.

Create the deployment directory:

```bash
sudo mkdir -p /opt/url-sortner
sudo chown "$USER":"$USER" /opt/url-sortner
cd /opt/url-sortner
```

Copy [docker-compose.prod.yml](./docker-compose.prod.yml) to that directory.

## 2. Create the production environment file

Create `/opt/url-sortner/.env` on the server. Do not commit this file:

```env
IMAGE_NAME=ghcr.io/YOUR-USER/YOUR-REPOSITORY
IMAGE_TAG=latest
NODE_ENV=production
PORT=3000
BASE_URL=https://short.example.com
MONGODB_URI=mongodb://mongo:27017/url_shortener
REDIS_URL=redis://redis:6379
JWT_SECRET=GENERATE_A_LONG_RANDOM_SECRET
JWT_EXPIRES_IN=1h
CORS_ORIGINS=https://app.example.com
SHORT_CODE_LENGTH=7
MAX_CODE_GENERATION_ATTEMPTS=5
REDIS_CACHE_TTL_SECONDS=3600
URL_CREATION_RATE_LIMIT_WINDOW_MS=900000
URL_CREATION_RATE_LIMIT_MAX=30
JSON_BODY_LIMIT=10kb
```

Generate a secret instead of using the placeholder:

```bash
openssl rand -base64 48
```

Protect the file:

```bash
chmod 600 /opt/url-sortner/.env
```

## 3. Configure GHCR access on the server

If the GHCR package is private, create a GitHub personal access token with package read permission and log in once:

```bash
echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u YOUR-GITHUB-USER --password-stdin
```

For a public GHCR image, this login may not be required.

## 4. Start the production stack manually once

```bash
cd /opt/url-sortner
docker compose --env-file .env -f docker-compose.prod.yml pull
docker compose --env-file .env -f docker-compose.prod.yml up -d
docker compose --env-file .env -f docker-compose.prod.yml ps
```

Verify the service from the host:

```bash
curl --fail https://short.example.com/health
```

Put a TLS reverse proxy such as Caddy, Nginx, or a managed load balancer in front of port `3000`.

## 5. Configure GitHub repository secrets

Add these secrets under **Repository Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Production server hostname or IP |
| `DEPLOY_USER` | SSH deployment user |
| `DEPLOY_SSH_KEY` | Private SSH key for that user |
| `DEPLOY_PATH` | `/opt/url-sortner` |

The server must already contain `docker-compose.prod.yml` and `.env`. GitHub Actions never receives the production JWT, MongoDB, or Redis secrets.

## 6. Enable GitHub Actions

The repository contains:

- [ci.yml](./.github/workflows/ci.yml): runs tests and audits on pushes and pull requests.
- [cd.yml](./.github/workflows/cd.yml): publishes the image and deploys on pushes to `main`.

The first deployment should be triggered manually with **Actions → CD → Run workflow**, then verified before relying on automatic deployments.

## 7. Deployment behavior

On `main`:

1. CI installs dependencies and runs tests.
2. Docker builds the production image.
3. The image is tagged with `latest` and the commit SHA.
4. The image is pushed to GHCR.
5. The server pulls the new image.
6. Compose recreates only changed containers.
7. Docker health checks verify the API.

If deployment fails, inspect:

```bash
docker compose --env-file .env -f docker-compose.prod.yml ps
docker compose --env-file .env -f docker-compose.prod.yml logs --tail=200 api
```

Rollback by changing `IMAGE_TAG` in `.env` to a previous commit SHA:

```bash
docker compose --env-file .env -f docker-compose.prod.yml pull api
docker compose --env-file .env -f docker-compose.prod.yml up -d api
```

## 8. Post-deployment checks

Run:

```bash
curl --fail https://short.example.com/health
```

Then verify:

- User registration and login.
- Authenticated URL creation.
- A `302` redirect.
- Analytics access for the owner.
- Rejection of analytics access without a token.
- Deactivation prevents redirects.
- MongoDB and Redis are not reachable from the public internet.
- TLS certificate and DNS configuration.
- Backups and restoration procedure.

## 9. Security requirements

- Use a dedicated non-root deployment user.
- Restrict the SSH key and disable password SSH authentication.
- Store `.env` only on the server with mode `600`.
- Rotate `JWT_SECRET` deliberately; rotation invalidates existing tokens.
- Use a private network or managed services for MongoDB and Redis.
- Put TLS in front of the API.
- Configure exact `CORS_ORIGINS`; do not use `*` for authenticated clients.
- Configure monitoring and log retention.
- Do not run `docker compose down -v` in production.

## 10. Limitations of this deployment example

This workflow is a straightforward single-host deployment suitable for a portfolio project and small workloads. It is not a replacement for a managed container platform, multi-host orchestration, distributed rate-limit store, managed database, or formal disaster-recovery plan.
