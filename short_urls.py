"""
Short URL store — maps compact IDs to query strings.

Separate SQLite DB from the service cache so the cache remains disposable.
"""

import os
import secrets
import sqlite3
import string
import threading
from datetime import datetime, timezone, timedelta

DB_PATH = os.environ.get("SHORT_URL_DB", "/data/short_urls.db")
RETENTION_DAYS = int(os.environ.get("SHORT_URL_RETENTION_DAYS", "90"))

_BASE62 = string.ascii_letters + string.digits
_local = threading.local()


def _get_db() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS short_urls (
                id TEXT PRIMARY KEY,
                query_string TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()
        _local.conn = conn
    return conn


def _generate_id(length: int = 6) -> str:
    return "".join(secrets.choice(_BASE62) for _ in range(length))


def create_short_url(query_string: str) -> str:
    """Store a query string and return its short ID."""
    conn = _get_db()
    for _ in range(10):
        sid = _generate_id()
        try:
            conn.execute(
                "INSERT INTO short_urls (id, query_string, created_at) VALUES (?, ?, ?)",
                (sid, query_string, datetime.now(timezone.utc).isoformat()),
            )
            conn.commit()
            return sid
        except sqlite3.IntegrityError:
            continue
    raise RuntimeError("Failed to generate unique short URL ID")


def resolve_short_url(sid: str) -> str | None:
    """Look up a query string by short ID. Returns None if not found."""
    conn = _get_db()
    row = conn.execute(
        "SELECT query_string FROM short_urls WHERE id = ?", (sid,)
    ).fetchone()
    return row["query_string"] if row else None


def prune_expired(days: int = RETENTION_DAYS) -> int:
    """Remove short URLs older than retention window."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    conn = _get_db()
    cursor = conn.execute("DELETE FROM short_urls WHERE created_at < ?", (cutoff,))
    conn.commit()
    return cursor.rowcount
