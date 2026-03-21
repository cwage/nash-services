# Testing & CI

## Test suites

Tests are split into tiers based on external dependencies:

| Suite | What it covers | ArcGIS? | Runtime |
|-------|---------------|---------|---------|
| `fast` | UI chrome, modals, dropdowns, short URLs, date logic | No | ~8s |
| `live` | Search, markers, viewport filtering, deep-links, polled services | Yes | ~2-3min |
| `audit` | Hit every configured feed and report dead/empty ones | Yes | ~3-5min |
| `full` | All of the above | Yes | ~5-8min |

## Running locally

```bash
cd tests && npm install    # one-time setup
docker compose up -d --build

make test          # fast suite
make test-live     # live suite (needs cache populated)
make test-audit    # feed audit
make test-full     # everything
```

The live/audit/full suites need the dispatch cache to have data — wait ~90s after startup for the first poll cycle to complete.

## CI workflows

- **Fast tests (PR)** — `test.yml` runs `--project=fast` on every pull request. No ArcGIS dependency, deterministic.
- **Live tests (daily)** — `test-live.yml` runs `--project=live` daily at 10:00 UTC (~5AM CDT / 4AM CST) via cron. Also triggerable manually from the Actions tab via `workflow_dispatch`. GitHub sends email on failure.
- **Audit** — run manually with `make test-audit` when you want to check for dead feeds.
