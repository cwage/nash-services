PW = docker compose exec -T -u "$$(id -u):$$(id -g)" playwright npx playwright test

.PHONY: test test-live test-audit test-full

test:            ## Run fast tests (no ArcGIS, ~8s)
	$(PW) --project=fast

test-live:       ## Run live tests (ArcGIS-dependent)
	$(PW) --project=live

test-audit:      ## Audit all feeds (~3min)
	$(PW) --project=audit

test-full:       ## Run all tests
	$(PW) --project=full
