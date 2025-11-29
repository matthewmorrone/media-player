"""SQLite helpers for the Media Player backend."""
from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import sqlite3
from typing import Iterator, Union

_DB_PATH: Path | None = None
_SCHEMA_PATH = Path(__file__).resolve().with_name("schema.sql")


def configure(path: Union[str, Path]) -> Path:
    """Set the database location and ensure its parent directory exists."""
    resolved = Path(path).expanduser()
    if not resolved.is_absolute():
        resolved = resolved.resolve()
    resolved.parent.mkdir(parents=True, exist_ok=True)
    global _DB_PATH
    _DB_PATH = resolved
    return resolved


def path() -> Path:
    if _DB_PATH is None:
        raise RuntimeError("Database path not configured")
    return _DB_PATH


def _open_connection(*, read_only: bool = False) -> sqlite3.Connection:
    db_path = path()
    if read_only:
        uri = f"file:{db_path}?mode=ro&cache=shared"
        conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
    else:
        conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    if not read_only:
        try:
            conn.execute("PRAGMA journal_mode = WAL;")
        except sqlite3.OperationalError:
            pass
    return conn


def connect(*, read_only: bool = False) -> sqlite3.Connection:
    """Return a configured sqlite3 connection."""
    return _open_connection(read_only=read_only)


@contextmanager
def session(*, read_only: bool = False) -> Iterator[sqlite3.Connection]:
    """Context manager that commits automatically for write sessions."""
    conn = connect(read_only=read_only)
    try:
        yield conn
        if not read_only:
            conn.commit()
    finally:
        conn.close()


def ensure_schema() -> None:
    """Apply the bundled schema to the configured database."""
    sql = _SCHEMA_PATH.read_text()
    conn = connect()
    try:
        conn.executescript(sql)
        conn.commit()
    finally:
        conn.close()


__all__ = [
    "configure",
    "path",
    "connect",
    "session",
    "ensure_schema",
]
