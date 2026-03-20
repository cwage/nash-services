# Deployment

This documents how the public instance of Nash Services is deployed. If you just want to run your own copy, see the Docker image section in the README — you don't need any of this.

The public instance runs on [Fly.io](https://fly.io) with a persistent SQLite volume for cached data.

## Prerequisites

- Docker and Docker Compose
- A `FLY_API_TOKEN` in your `.env` file (generate a deploy token with `fly tokens create deploy` and rotate periodically)

All `flyctl` commands run via Docker Compose, no local install needed.

## First-Time Setup

1. Create the app: `docker compose run --rm fly launch`
2. Create the persistent volume: `docker compose run --rm fly volumes create nash_cache --region iad --size 1`
3. Set secrets: `docker compose run --rm fly secrets set GITHUB_TOKEN=...`
4. Deploy: `docker compose run --rm fly deploy`

## Local Development

```
docker compose up
```

App runs at http://localhost:5010. Changes to source files require a container rebuild (`docker compose up --build`).

## Deploy to Production

```
docker compose run --rm fly deploy
```

This builds the Docker image and deploys it directly to Fly. No tagging, GitHub Actions, or image registry steps required.

## Common Commands

```sh
# Deploy
docker compose run --rm fly deploy

# Tail production logs
docker compose run --rm fly logs

# Shell into the production machine
docker compose run --rm fly ssh console

# Check machine status
docker compose run --rm fly status

# Set a secret/env var
docker compose run --rm fly secrets set KEY=value

# List secrets
docker compose run --rm fly secrets list

# Check TLS certs
docker compose run --rm fly certs list
```

## Infrastructure

- **App**: `nash-services` on Fly.io (region: `iad` / Ashburn, VA)
- **VM**: shared-cpu-1x, 1GB RAM
- **Volume**: `nash_cache` (1GB) mounted at `/data` for SQLite cache
- **Domains**: `nash-services.fly.dev`, `nash-services-test.quietlife.net`
- **TLS**: Managed by Fly (Let's Encrypt)
- **DNS**: CNAME to `nash-services.fly.dev`

## Secrets

Managed via `fly secrets set`. Current secrets:

- `GITHUB_TOKEN` — GitHub PAT for bug report issue creation

Environment variables set in `fly.toml`:

- `DISPATCH_CACHE_DB` — path to SQLite cache on the persistent volume

## Scaling

The app runs with `auto_stop_machines = "stop"` and `auto_start_machines = true`, meaning machines stop when idle and wake on incoming requests (cold start of a few seconds).

To keep it always-on:

```toml
# fly.toml
min_machines_running = 1
```

To scale horizontally, add more volumes and machines — but note each volume is pinned to a specific machine. For the SQLite cache this is fine since it rebuilds itself via polling.
