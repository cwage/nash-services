# Deployment

This documents how the public instance of Nash Services is deployed. If you just want to run your own copy, see the Docker image section in the README — you don't need any of this.

The public instance runs on [Fly.io](https://fly.io) with a persistent SQLite volume for cached data.

## Prerequisites

- Docker and Docker Compose
- A Fly.io account with access to the `nash-services` app

All `flyctl` commands run via a Docker Compose service (`flyio/flyctl`), so no local flyctl install is needed. The image is pulled automatically on first use.

## New Workstation Setup

Follow these steps after cloning the repo onto a fresh machine. The Fly app and infrastructure already exist — you just need a deploy token.

1. **Create a `.env` file** in the repo root (it's gitignored):

   ```
   touch .env
   ```

2. **Log in to Fly.io** interactively. This pulls the flyctl Docker image on first run and opens a browser-based auth flow:

   ```
   docker compose run --rm fly auth login
   ```

   Follow the URL printed in the terminal to authenticate in your browser. The login session is persisted in a Docker named volume (`fly-config`) so it survives between container runs.

3. **Generate a deploy token** and copy the output:

   ```
   docker compose run --rm fly tokens create deploy -a nash-services
   ```

4. **Add the token to `.env`**. The token starts with `FlyV1 fm2_...`:

   ```
   FLY_API_TOKEN="FlyV1 fm2_..."
   ```

5. **Verify the setup** by checking the app status:

   ```
   docker compose run --rm fly status
   ```

6. **Deploy** (when ready):

   ```
   docker compose run --rm fly deploy
   ```

## First-Time App Setup

These steps are only needed once to create the Fly app from scratch (already done for `nash-services`):

1. Create the app: `docker compose run --rm fly launch`
2. Create the persistent volume: `docker compose run --rm fly volumes create nash_cache --region iad --size 1`
3. Set secrets: `docker compose run --rm fly secrets set GITHUB_TOKEN=...`
4. Generate a deploy token (see New Workstation Setup above) and add it to `.env`
5. Deploy: `docker compose run --rm fly deploy`

## Deploy Token Management

The `fly` docker-compose service authenticates via `FLY_API_TOKEN` in your `.env` file. Each workstation needs its own token.

By default, deploy tokens don't expire. To set an expiry, pass `-x <duration>` (e.g. `-x 720h` for 30 days). You can list and revoke tokens from the Fly dashboard under **Apps > nash-services > Tokens**.

If you lose a token or need to set up a new workstation, just repeat the New Workstation Setup steps — old tokens continue to work until revoked.

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

The app runs with `auto_stop_machines = 'off'` and `min_machines_running = 1`, meaning the machine stays up continuously with no cold starts.

To allow machines to stop when idle (with cold starts of a few seconds on wake):

```toml
# fly.toml
auto_stop_machines = 'stop'
min_machines_running = 0
```

To scale horizontally, add more volumes and machines — but note each volume is pinned to a specific machine. For the SQLite cache this is fine since it rebuilds itself via polling.
