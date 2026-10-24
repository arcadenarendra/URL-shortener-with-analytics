# Local Docker Testing Guide

This guide runs the URL shortener locally with Docker Compose. It starts the API, MongoDB, and Redis without requiring a local Node.js, MongoDB, or Redis installation.

## Prerequisites

Install:

- Docker Desktop
- Git

Verify:

```powershell
docker --version
docker compose version
git --version
```

## 1. Get the project

```powershell
git clone https://github.com/YOUR-USER/YOUR-REPOSITORY.git
Set-Location YOUR-REPOSITORY
```

If the project is already on disk:

```powershell
Set-Location X:\Projects\url-sortner
```

## 2. Set a local JWT secret

The Compose file intentionally refuses to start without `JWT_SECRET`.

For the current PowerShell session:

```powershell
$env:JWT_SECRET = "local-only-change-this-secret"
```

For a persistent local setup, create a `.env` file in the project root. Do not commit it:

```env
JWT_SECRET=local-only-change-this-secret
```

## 3. Build and start the stack

```powershell
docker compose up --build -d
```

Check service status:

```powershell
docker compose ps
```

All services should become healthy. View logs:

```powershell
docker compose logs -f api
```

Press `Ctrl+C` to stop following logs; the containers keep running.

## 4. Test the health endpoint

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Expected shape:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "up"
  }
}
```

## 5. Register a user

```powershell
$registration = Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/v1/auth/register `
  -ContentType "application/json" `
  -Body '{"name":"Local User","email":"local@example.com","password":"local-password-123"}'

$token = $registration.data.token
$token
```

If you repeat this command, use a different email or remove the local MongoDB volume as described below.

## 6. Create an owned short URL

```powershell
$headers = @{ Authorization = "Bearer $token" }

$created = Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/v1/urls `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"originalUrl":"https://example.com","customAlias":"local-demo"}'

$created
```

## 7. Test the redirect

```powershell
curl.exe -i http://localhost:3000/local-demo
```

The response should contain:

```text
HTTP/1.1 302 Found
Location: https://example.com/
```

## 8. Test owner management and analytics

List owned URLs:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:3000/api/v1/urls `
  -Headers $headers
```

View statistics:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/v1/urls/local-demo/stats?days=30&limit=20" `
  -Headers $headers
```

Deactivate the URL:

```powershell
Invoke-RestMethod `
  -Method Patch `
  -Uri http://localhost:3000/api/v1/urls/local-demo `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"isActive":false}'
```

## 9. Run automated tests

Tests run on the host and do not require the Compose stack:

```powershell
npm ci
npm test
```

## 10. Inspect Redis

```powershell
docker compose exec redis redis-cli keys "url:*"
```

Redis is optional at the application level, but the Compose stack starts it so cache behavior can be exercised locally.

## 11. Stop the stack

Stop containers while preserving MongoDB data:

```powershell
docker compose down
```

Stop containers and delete the local MongoDB volume:

```powershell
docker compose down -v
```

The `-v` command is destructive for local data. Never use it against a production Compose project.

## Troubleshooting

### Port 3000 is already in use

Stop the process using the port or change the published port in `docker-compose.yml`, for example:

```yaml
ports:
  - "3001:3000"
```

Then use `http://localhost:3001`.

### API is unhealthy

```powershell
docker compose logs api
docker compose logs mongo
docker compose logs redis
```

The API requires MongoDB to be reachable before it starts listening.

### The JWT secret error appears

Set the secret before starting Compose:

```powershell
$env:JWT_SECRET = "local-only-change-this-secret"
docker compose up --build -d
```
