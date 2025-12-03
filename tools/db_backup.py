#!/usr/bin/env python3
"""Dump or restore the Media Player SQLite database to/from JSON."""
from __future__ import annotations

import argparse
import datetime as _dt
import importlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Sequence

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

APP = None  # populated lazily
DB = None   # populated lazily

TABLE_EXPORTS = [
    ("videos", "video", "id"),
    ("tags", "tag", "id"),
    ("performers", "performer", "id"),
    ("media_tags", "media_tags", "media_id, tag_id"),
    ("media_performers", "media_performers", "media_id, performer_id"),
    ("artifacts", "artifact", "id"),
    ("jobs", "job", "id"),
]

SEQUENCED_TABLES = ("video", "tag", "performer", "artifact")


def _maybe_reexec_into_venv() -> None:
    if os.environ.get("MP_VENV_BOOTSTRAPPED") == "1":
        return
    in_venv = (
        hasattr(sys, "base_prefix")
        and sys.prefix != getattr(sys, "base_prefix", sys.prefix)
    ) or bool(os.environ.get("VIRTUAL_ENV"))
    if in_venv:
        return
    script_dir = Path(__file__).resolve().parent
    candidates = [
        script_dir / ".venv" / "bin" / "python",
        ROOT / ".venv" / "bin" / "python",
        Path.home() / ".venvs" / "media-player" / "bin" / "python",
    ]
    for py in candidates:
        try:
            if py.is_file() and os.access(str(py), os.X_OK):
                env = dict(os.environ)
                env["MP_VENV_BOOTSTRAPPED"] = "1"
                os.execve(
                    str(py),
                    [str(py), str(Path(__file__).resolve())] + sys.argv[1:],
                    env,
                )
                return
        except Exception:
            continue


def _bootstrap_modules() -> None:
    global APP, DB
    if APP is not None and DB is not None:
        return
    APP = importlib.import_module("app")
    DB = importlib.import_module("db")


def _fetch_rows(conn, table: str, order_by: str | None) -> list[dict[str, Any]]:
    query = f"SELECT * FROM \"{table}\""
    if order_by:
        query += f" ORDER BY {order_by}"
    rows = conn.execute(query).fetchall()
    return [dict(row) for row in rows]


def _table_counts(conn) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for _, table, _ in TABLE_EXPORTS:
        row = conn.execute(f"SELECT COUNT(*) AS cnt FROM \"{table}\"").fetchone()
        counts[table] = int(row["cnt"] if row and "cnt" in row.keys() else 0)
    return counts


def _wipe_tables(conn) -> None:
    conn.execute("DELETE FROM \"media_tags\"")
    conn.execute("DELETE FROM \"media_performers\"")
    conn.execute("DELETE FROM \"artifact\"")
    conn.execute("DELETE FROM \"job\"")
    conn.execute("DELETE FROM \"tag\"")
    conn.execute("DELETE FROM \"performer\"")
    conn.execute("DELETE FROM \"video\"")
    try:
        placeholders = ",".join("?" for _ in SEQUENCED_TABLES)
        conn.execute(
            f"DELETE FROM sqlite_sequence WHERE name IN ({placeholders})",
            SEQUENCED_TABLES,
        )
    except Exception:
        pass


def _insert_rows(conn, table: str, rows: Sequence[dict[str, Any]]) -> int:
    if not rows:
        return 0
    columns: List[str] = sorted({col for row in rows for col in row.keys()})
    if not columns:
        return 0
    col_sql = ", ".join(f'"{c}"' for c in columns)
    placeholders = ", ".join(f":{c}" for c in columns)
    sql = f"INSERT INTO \"{table}\" ({col_sql}) VALUES ({placeholders})"
    prepped = [{col: row.get(col) for col in columns} for row in rows]
    conn.executemany(sql, prepped)
    return len(rows)


def build_backup_payload() -> dict[str, Any]:
    """Return an in-memory JSON-serializable backup payload."""
    _bootstrap_modules()
    assert DB is not None
    assert APP is not None
    tables: Dict[str, list[dict[str, Any]]] = {}
    with DB.session(read_only=True) as conn:  # type: ignore[attr-defined]
        schema_row = conn.execute(
            "SELECT version, applied_at FROM schema_version WHERE id = 1"
        ).fetchone()
        if schema_row is None:
            raise RuntimeError("schema_version row missing")
        for section, table, order_by in TABLE_EXPORTS:
            tables[section] = _fetch_rows(conn, table, order_by)
    schema_version = int(schema_row["version"])
    schema_applied = int(schema_row["applied_at"])
    meta = {
        "generated_at": _dt.datetime.now(tz=_dt.timezone.utc).isoformat(),
        "schema_version": schema_version,
        "schema_applied_at": schema_applied,
        "db_path": str(DB.path()),  # type: ignore[attr-defined]
        "media_root": str(APP.STATE.get("root")),
        "counts": {section: len(rows) for section, rows in tables.items()},
    }
    payload = {"meta": meta}
    payload.update(tables)
    return payload


def restore_from_payload(payload: dict[str, Any], *, replace: bool = False) -> dict[str, Any]:
    """Load a previously exported payload into the configured database."""
    _bootstrap_modules()
    assert DB is not None
    meta = payload.get("meta") if isinstance(payload, dict) else None
    if not isinstance(meta, dict):
        raise RuntimeError("Backup payload missing meta section")
    backup_version = meta.get("schema_version")
    if backup_version is None:
        raise RuntimeError("Backup payload missing schema_version")
    inserted: Dict[str, int] = {}
    with DB.session() as conn:  # type: ignore[attr-defined]
        schema_row = conn.execute(
            "SELECT version, applied_at FROM schema_version WHERE id = 1"
        ).fetchone()
        if schema_row is None:
            raise RuntimeError("schema_version row missing")
        current_version = int(schema_row["version"])
        if int(backup_version) != current_version:
            raise RuntimeError(
                f"Schema version mismatch: backup={backup_version} current={current_version}"
            )
        counts = _table_counts(conn)
        has_existing = any(counts.values())
        if has_existing and not replace:
            raise RuntimeError(
                "Database already has data; rerun with --replace to overwrite existing rows."
            )
        if has_existing and replace:
            _wipe_tables(conn)
        for section, table, _ in TABLE_EXPORTS:
            rows = payload.get(section, [])
            if not isinstance(rows, list):
                raise RuntimeError(f"Backup section '{section}' must be a list")
            inserted[section] = _insert_rows(conn, table, rows)
        schema_applied_at = meta.get("schema_applied_at")
        conn.execute(
            "UPDATE schema_version SET version = ?, applied_at = ? WHERE id = 1",
            (
                int(backup_version),
                int(schema_applied_at) if schema_applied_at is not None else schema_row["applied_at"],
            ),
        )
    return {"inserted": inserted, "replaced": bool(has_existing and replace)}


def _write_json(output: str, payload: dict[str, Any], *, compact: bool) -> None:
    target = sys.stdout if output in ("-", "") else Path(output)
    if target is sys.stdout:
        json.dump(payload, sys.stdout, indent=None if compact else 2, ensure_ascii=False)
        sys.stdout.write("\n")
    else:
        path = target if isinstance(target, Path) else Path(str(target))
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=None if compact else 2, ensure_ascii=False)
            fh.write("\n")


def _read_json(input_path: str) -> dict[str, Any]:
    if input_path in ("-", ""):
        return json.load(sys.stdin)
    path = Path(input_path)
    return json.loads(path.read_text(encoding="utf-8"))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Media Player database backup CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    dump_p = sub.add_parser("dump", help="Export the database to JSON")
    dump_p.add_argument(
        "-o",
        "--output",
        default="-",
        help="Destination file (default: stdout)",
    )
    dump_p.add_argument(
        "--compact",
        action="store_true",
        help="Emit compact JSON without indentation",
    )

    load_p = sub.add_parser("load", help="Import database contents from JSON")
    load_p.add_argument(
        "-i",
        "--input",
        default="-",
        help="Input file (default: stdin)",
    )
    load_p.add_argument(
        "--replace",
        action="store_true",
        help="Clear existing tables before importing",
    )

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "dump":
            payload = build_backup_payload()
            _write_json(args.output, payload, compact=bool(args.compact))
            counts = payload["meta"].get("counts", {})
            print(f"Exported backup ({counts})", file=sys.stderr)
        elif args.command == "load":
            payload = _read_json(args.input)
            result = restore_from_payload(payload, replace=bool(args.replace))
            print(
                f"Imported backup (replaced={result['replaced']} inserted={result['inserted']})",
                file=sys.stderr,
            )
        else:
            parser.error("Unknown command")
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    _maybe_reexec_into_venv()
    raise SystemExit(main())
