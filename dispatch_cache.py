"""
Service Cache - Accumulates snapshots of polled services in SQLite.

Polls services marked with poll: true in services.yml on a timer,
upserts records, and provides queries with recency-based status
(live/recent/stale) for hot->cold visualization.
"""

import sqlite3
import threading
import hashlib
import json
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional, Callable

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get("DISPATCH_CACHE_DB", "/tmp/service_cache.db")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "90"))  # seconds
RETENTION_HOURS = int(os.environ.get("CACHE_RETENTION_HOURS", "24"))

# Thresholds for status classification
LIVE_WINDOW = timedelta(minutes=5)    # seen in last poll cycle
RECENT_WINDOW = timedelta(hours=1)    # fell off within an hour


def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cached_events (
            service_name TEXT NOT NULL,
            event_key TEXT NOT NULL,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            raw_json TEXT NOT NULL,
            PRIMARY KEY (service_name, event_key)
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_service_last_seen
        ON cached_events(service_name, last_seen)
    """)
    conn.commit()
    return conn


def _make_event_key(record: dict) -> str:
    """Build a stable key from the record's non-volatile fields.

    ArcGIS active views reuse ObjectId, so we hash the full attribute
    set (minus LastUpdated which changes on refresh) for dedup.
    """
    stable = {k: v for k, v in sorted(record.items())
              if k not in ("LastUpdated", "ObjectId", "OBJECTID", "FID")}
    raw = json.dumps(stable, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def upsert_events(service_name: str, records: list[dict]) -> int:
    """Upsert a batch of records for a service. Returns count of new inserts."""
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_db()
    new_count = 0
    try:
        for record in records:
            event_key = _make_event_key(record)
            existing = conn.execute(
                "SELECT event_key FROM cached_events WHERE service_name = ? AND event_key = ?",
                (service_name, event_key)
            ).fetchone()

            if existing:
                conn.execute("""
                    UPDATE cached_events SET last_seen = ?, raw_json = ?
                    WHERE service_name = ? AND event_key = ?
                """, (now, json.dumps(record), service_name, event_key))
            else:
                conn.execute("""
                    INSERT INTO cached_events
                    (service_name, event_key, first_seen, last_seen, raw_json)
                    VALUES (?, ?, ?, ?, ?)
                """, (service_name, event_key, now, now, json.dumps(record)))
                new_count += 1

        conn.commit()
    finally:
        conn.close()
    return new_count


def prune_old(hours: int = RETENTION_HOURS) -> int:
    """Remove events older than retention window across all services."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    conn = _get_db()
    try:
        cursor = conn.execute(
            "DELETE FROM cached_events WHERE last_seen < ?", (cutoff,)
        )
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def get_cached_events(service_name: str) -> list[dict]:
    """Return cached events for a service with _status based on recency."""
    now = datetime.now(timezone.utc)
    conn = _get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM cached_events WHERE service_name = ? ORDER BY last_seen DESC",
            (service_name,)
        ).fetchall()
    finally:
        conn.close()

    results = []
    for row in rows:
        last_seen = datetime.fromisoformat(row["last_seen"])
        age = now - last_seen

        if age <= LIVE_WINDOW:
            status = "live"
        elif age <= RECENT_WINDOW:
            status = "recent"
        else:
            status = "stale"

        attrs = json.loads(row["raw_json"])
        attrs["_status"] = status
        attrs["_first_seen"] = row["first_seen"]
        attrs["_last_seen"] = row["last_seen"]
        results.append(attrs)

    return results


def get_cache_stats(service_name: Optional[str] = None) -> dict:
    """Return counts by status, optionally filtered to one service."""
    now = datetime.now(timezone.utc)
    conn = _get_db()
    try:
        if service_name:
            rows = conn.execute(
                "SELECT service_name, last_seen FROM cached_events WHERE service_name = ?",
                (service_name,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT service_name, last_seen FROM cached_events"
            ).fetchall()
    finally:
        conn.close()

    # Per-service breakdown
    by_service: dict[str, dict] = {}
    for row in rows:
        svc = row["service_name"]
        if svc not in by_service:
            by_service[svc] = {"live": 0, "recent": 0, "stale": 0, "total": 0}
        age = now - datetime.fromisoformat(row["last_seen"])
        if age <= LIVE_WINDOW:
            by_service[svc]["live"] += 1
        elif age <= RECENT_WINDOW:
            by_service[svc]["recent"] += 1
        else:
            by_service[svc]["stale"] += 1
        by_service[svc]["total"] += 1

    total = sum(s["total"] for s in by_service.values())
    return {"total": total, "services": by_service}


class ServicePoller:
    """Background thread that polls multiple services."""

    def __init__(self, interval: int = POLL_INTERVAL):
        self.interval = interval
        self._targets: list[dict] = []  # [{name, fetch_fn}, ...]
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

    def add_target(self, service_name: str, fetch_fn: Callable[[], list[dict]]):
        self._targets.append({"name": service_name, "fetch_fn": fetch_fn})

    def start(self):
        if not self._targets:
            logger.info("No poll targets configured, poller not started")
            return
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        logger.info(
            f"Service poller started (interval={self.interval}s, "
            f"targets={[t['name'] for t in self._targets]})"
        )

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self):
        self._poll_all()
        while not self._stop_event.wait(self.interval):
            self._poll_all()

    def _poll_all(self):
        for target in self._targets:
            try:
                records = target["fetch_fn"]()
                if records:
                    new = upsert_events(target["name"], records)
                    if new > 0:
                        logger.info(f"Poll [{target['name']}]: {len(records)} active, {new} new cached")
                    else:
                        logger.debug(f"Poll [{target['name']}]: {len(records)} active, no new")
            except Exception:
                logger.exception(f"Poll failed for {target['name']}")

        # Prune across all services once per cycle
        pruned = prune_old()
        if pruned > 0:
            logger.info(f"Pruned {pruned} stale events")
