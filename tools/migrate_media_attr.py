#!/usr/bin/env python3
"""Import media attribute sidecars into SQLite and verify parity.

This CLI is meant to be run before deleting `.artifacts/scenes.json` and the
per-video `*.tags.json` files. It can:
  * load the consolidated media attribute index (`.artifacts/scenes.json`)
  * load all per-video tags sidecars
  * upsert the data into the SQLite database
  * compare row counts & SHA-256 hashes between the source JSON and the DB
  * optionally archive or delete the JSON files once parity is confirmed
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import importlib
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

# ---------------------------------------------------------------------------
# Virtualenv bootstrap (mirrors tools/artifacts.py) so imports succeed when the
# script is executed with `python tools/migrate_media_attr.py`.
# ---------------------------------------------------------------------------

def _ensure_venv_if_needed() -> None:
    try:
        if os.environ.get("MP_VENV_BOOTSTRAPPED") == "1":
            return
        in_venv = (
            hasattr(sys, "base_prefix")
            and sys.prefix != getattr(sys, "base_prefix", sys.prefix)
        ) or bool(os.environ.get("VIRTUAL_ENV"))
        fastapi_ok = False
        try:
            import fastapi  # type: ignore  # noqa: F401

            fastapi_ok = True
        except Exception:
            fastapi_ok = False
        if in_venv and fastapi_ok:
            return
        script_dir = Path(__file__).resolve().parent
        candidates = [
            script_dir / ".venv" / "bin" / "python",
            Path.home() / ".venvs" / "media-player" / "bin" / "python",
        ]
        for py in candidates:
            try:
                if py.is_file() and os.access(str(py), os.X_OK):
                    env = dict(os.environ)
                    env["MP_VENV_BOOTSTRAPPED"] = "1"
                    sys.stderr.write(f"[cli] Switching to venv interpreter: {py}\n")
                    sys.stderr.flush()
                    os.execve(str(py), [str(py), str(Path(__file__).resolve())] + sys.argv[1:], env)
                    return
            except Exception:
                continue
    except Exception:
        pass


_ensure_venv_if_needed()

# ---------------------------------------------------------------------------
# Imports that expect the project root to be on sys.path
# ---------------------------------------------------------------------------


def import_app_module():
    root = Path(__file__).resolve().parents[1]
    sroot = str(root)
    if sroot not in sys.path:
        sys.path.insert(0, sroot)
    return importlib.import_module("app")


APP = None  # lazily populated in main()
DB = None   # type: ignore


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def _chunked(seq: Sequence[str], size: int = 200) -> Iterator[list[str]]:
    for idx in range(0, len(seq), size):
        yield list(seq[idx : idx + size])


def _clean_text_list(values: Iterable[Any], limit: int = 500) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in values:
        if not isinstance(raw, str):
            continue
        item = raw.strip()
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= limit:
            break
    return out


def _clamp_rating(value: Any) -> int:
    try:
        return max(0, min(5, int(value)))
    except Exception:
        return 0


def _bool(value: Any) -> bool:
    try:
        return bool(value)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Sidecar loading
# ---------------------------------------------------------------------------


def load_media_attr_index(path: Path) -> tuple[dict[str, dict[str, list[str]]], list[str]]:
    entries: dict[str, dict[str, list[str]]] = {}
    warnings: list[str] = []
    if not path.exists():
        return entries, warnings
    try:
        raw = json.loads(path.read_text())
    except Exception as exc:
        raise RuntimeError(f"Failed to parse {path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise RuntimeError(f"Expected dict at {path}")
    for rel, entry in raw.items():
        if not isinstance(rel, str) or not isinstance(entry, dict):
            warnings.append(f"Skipping malformed entry for {rel!r}")
            continue
        tags_src = entry.get("tags") or entry.get("sidecar_tags") or []
        perf_src = entry.get("performers") or entry.get("sidecar_performers") or []
        tags = _clean_text_list(tags_src)
        performers = _clean_text_list(perf_src)
        entries[rel] = {"tags": tags, "performers": performers}
    return entries, warnings


def build_stem_index(app_mod, root: Path, attr_map: dict[str, dict[str, list[str]]]) -> dict[str, list[str]]:
    index: dict[str, list[str]] = {}
    for rel in attr_map.keys():
        stem = Path(rel).stem
        index.setdefault(stem, []).append(rel)
    try:
        videos = app_mod._find_mp4s(root, recursive=True)
    except Exception:
        videos = []
    for video in videos:
        try:
            rel = str(video.relative_to(root))
        except Exception:
            rel = str(video)
        stem = video.stem
        bucket = index.setdefault(stem, [])
        if rel not in bucket:
            bucket.append(rel)
    return index


def load_tags_sidecars(root: Path, stem_index: dict[str, list[str]]) -> tuple[dict[str, dict[str, Any]], dict[str, Path], dict[str, Any]]:
    base = root / ".artifacts" / "scenes"
    entries: dict[str, dict[str, Any]] = {}
    sources: dict[str, Path] = {}
    stats = {
        "processed": 0,
        "ambiguous": [],
        "unmapped": [],
        "parse_errors": [],
    }
    if not base.exists():
        return entries, sources, stats
    for child in base.iterdir():
        if not child.is_dir():
            continue
        stem = child.name
        candidate = child / f"{stem}.tags.json"
        if not candidate.exists():
            continue
        rel_candidates = stem_index.get(stem, [])
        target_rel: str | None = None
        if len(rel_candidates) == 1:
            target_rel = rel_candidates[0]
        elif len(rel_candidates) == 0:
            stats["unmapped"].append(str(candidate))
            continue
        else:
            stats["ambiguous"].append({"stem": stem, "file": str(candidate), "choices": rel_candidates})
            continue
        try:
            data = json.loads(candidate.read_text())
        except Exception as exc:
            stats["parse_errors"].append({"file": str(candidate), "error": str(exc)})
            continue
        desc = str(data.get("description") or "")
        rating = _clamp_rating(data.get("rating"))
        favorite = _bool(data.get("favorite"))
        tags = _clean_text_list(data.get("tags") or [])
        performers = _clean_text_list(data.get("performers") or [])
        entries[target_rel] = {
            "description": desc,
            "rating": rating,
            "favorite": favorite,
            "tags": tags,
            "performers": performers,
        }
        sources[target_rel] = candidate
        stats["processed"] += 1
    return entries, sources, stats


def merge_attr_sources(index_map: dict[str, dict[str, list[str]]], meta_map: dict[str, dict[str, Any]]) -> dict[str, dict[str, list[str]]]:
    merged: dict[str, dict[str, list[str]]] = {
        rel: {"tags": list(entry.get("tags", [])), "performers": list(entry.get("performers", []))}
        for rel, entry in index_map.items()
    }
    for rel, meta in meta_map.items():
        tags = meta.get("tags") or []
        performers = meta.get("performers") or []
        existing = merged.setdefault(rel, {"tags": [], "performers": []})
        existing["tags"] = _clean_text_list(existing.get("tags", []) + tags)
        existing["performers"] = _clean_text_list(existing.get("performers", []) + performers)
    return merged


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def apply_updates(attr_map: dict[str, dict[str, list[str]]], meta_map: dict[str, dict[str, Any]]) -> dict[str, int]:
    processed_attr = 0
    processed_meta = 0
    with DB.session() as conn:  # type: ignore
        for rel, entry in attr_map.items():
            APP._db_sync_media_entry(conn, rel, entry)
            processed_attr += 1
        for rel, meta in meta_map.items():
            APP._db_update_video_meta(
                conn,
                rel,
                description=meta.get("description"),
                rating=meta.get("rating"),
                favorite=meta.get("favorite"),
            )
            processed_meta += 1
    return {"media_attr_rows": processed_attr, "metadata_rows": processed_meta}


def fetch_db_media_attr(paths: Sequence[str]) -> tuple[dict[str, dict[str, list[str]]], list[str]]:
    data = {rel: {"tags": [], "performers": []} for rel in paths}
    missing: set[str] = set(paths)
    if not paths:
        return data, []
    with DB.session(read_only=True) as conn:  # type: ignore
        all_paths = list(paths)
        for chunk in _chunked(all_paths):
            placeholders = ",".join("?" for _ in chunk)
            rows = conn.execute(
                f"SELECT rel_path FROM video WHERE rel_path IN ({placeholders})",
                chunk,
            ).fetchall()
            present = {str(row["rel_path"]) for row in rows}
            missing -= present
            if not present:
                continue
            tag_rows = conn.execute(
                f"""
                SELECT v.rel_path AS rel, t.name AS name
                  FROM video v
                  JOIN media_tags mt ON mt.media_id = v.id
                  JOIN tag t ON t.id = mt.tag_id
                 WHERE v.rel_path IN ({placeholders})
                """,
                chunk,
            ).fetchall()
            for row in tag_rows:
                rel = str(row["rel"]) if row["rel"] is not None else None
                name = row["name"]
                if rel and rel in data and isinstance(name, str):
                    data[rel]["tags"].append(name)
            perf_rows = conn.execute(
                f"""
                SELECT v.rel_path AS rel, p.name AS name
                  FROM video v
                  JOIN media_performers mp ON mp.media_id = v.id
                  JOIN performer p ON p.id = mp.performer_id
                 WHERE v.rel_path IN ({placeholders})
                """,
                chunk,
            ).fetchall()
            for row in perf_rows:
                rel = str(row["rel"]) if row["rel"] is not None else None
                name = row["name"]
                if rel and rel in data and isinstance(name, str):
                    data[rel]["performers"].append(name)
        for rel in data:
            data[rel]["tags"] = _clean_text_list(data[rel]["tags"])  # normalize order/dedup
            data[rel]["performers"] = _clean_text_list(data[rel]["performers"])
    return data, sorted(missing)


def fetch_db_metadata(paths: Sequence[str]) -> tuple[dict[str, dict[str, Any]], list[str]]:
    data = {rel: {"description": "", "rating": 0, "favorite": False} for rel in paths}
    missing: set[str] = set(paths)
    if not paths:
        return data, []
    with DB.session(read_only=True) as conn:  # type: ignore
        all_paths = list(paths)
        for chunk in _chunked(all_paths):
            placeholders = ",".join("?" for _ in chunk)
            rows = conn.execute(
                f"SELECT rel_path, description, rating, favorite FROM video WHERE rel_path IN ({placeholders})",
                chunk,
            ).fetchall()
            for row in rows:
                rel = str(row["rel_path"])
                missing.discard(rel)
                data[rel] = {
                    "description": str(row["description"] or ""),
                    "rating": _clamp_rating(row["rating"]),
                    "favorite": _bool(row["favorite"]),
                }
    return data, sorted(missing)


# ---------------------------------------------------------------------------
# Diffing & digests
# ---------------------------------------------------------------------------


def _digest_entries(items: list[dict[str, Any]]) -> str:
    payload = json.dumps(items, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def digest_media_attr_map(attr_map: dict[str, dict[str, list[str]]]) -> str:
    ordered = [
        {
            "path": rel,
            "tags": attr_map[rel].get("tags", []),
            "performers": attr_map[rel].get("performers", []),
        }
        for rel in sorted(attr_map.keys())
    ]
    return _digest_entries(ordered)


def digest_metadata_map(meta_map: dict[str, dict[str, Any]]) -> str:
    ordered = [
        {
            "path": rel,
            "description": meta_map[rel].get("description", ""),
            "rating": meta_map[rel].get("rating", 0),
            "favorite": bool(meta_map[rel].get("favorite", False)),
        }
        for rel in sorted(meta_map.keys())
    ]
    return _digest_entries(ordered)


def diff_media_attr(source: dict[str, dict[str, list[str]]], dest: dict[str, dict[str, list[str]]], limit: int = 20) -> list[dict[str, Any]]:
    diffs: list[dict[str, Any]] = []
    for rel in sorted(source.keys()):
        s_entry = {
            "tags": source[rel].get("tags", []),
            "performers": source[rel].get("performers", []),
        }
        d_entry = dest.get(rel)
        if d_entry is None:
            diffs.append({"path": rel, "sidecar": s_entry, "db": None})
        else:
            canonical_dest = {
                "tags": d_entry.get("tags", []),
                "performers": d_entry.get("performers", []),
            }
            if s_entry != canonical_dest:
                diffs.append({"path": rel, "sidecar": s_entry, "db": canonical_dest})
        if len(diffs) >= limit:
            break
    return diffs


def diff_metadata(source: dict[str, dict[str, Any]], dest: dict[str, dict[str, Any]], limit: int = 20) -> list[dict[str, Any]]:
    diffs: list[dict[str, Any]] = []
    for rel in sorted(source.keys()):
        s_entry = {
            "description": source[rel].get("description", ""),
            "rating": source[rel].get("rating", 0),
            "favorite": bool(source[rel].get("favorite", False)),
        }
        d_entry = dest.get(rel)
        if d_entry is None:
            diffs.append({"path": rel, "sidecar": s_entry, "db": None})
        else:
            canonical_dest = {
                "description": d_entry.get("description", ""),
                "rating": d_entry.get("rating", 0),
                "favorite": bool(d_entry.get("favorite", False)),
            }
            if s_entry != canonical_dest:
                diffs.append({"path": rel, "sidecar": s_entry, "db": canonical_dest})
        if len(diffs) >= limit:
            break
    return diffs


# ---------------------------------------------------------------------------
# Archiving / deletion helpers
# ---------------------------------------------------------------------------


def archive_files(root: Path, files: Iterable[Path], override_dir: Optional[Path] = None) -> tuple[Path, list[dict[str, str]]]:
    files = [p for p in files if p.exists()]
    if not files:
        raise RuntimeError("No files to archive")
    archive_root = (
        override_dir
        if override_dir is not None
        else root / ".artifacts" / "archive" / "media-attr" / _dt.datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    )
    archive_root.mkdir(parents=True, exist_ok=True)
    moves: list[dict[str, str]] = []
    for src in files:
        try:
            rel = src.relative_to(root)
        except Exception:
            rel = src.name
        dest = archive_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest_path = dest
        shutil.move(str(src), str(dest_path))
        moves.append({"from": str(src), "to": str(dest_path)})
    return archive_root, moves


def delete_files(files: Iterable[Path]) -> list[str]:
    removed: list[str] = []
    for src in files:
        if not src.exists():
            continue
        src.unlink()
        removed.append(str(src))
    return removed


# ---------------------------------------------------------------------------
# CLI plumbing
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Migrate media attribute sidecars into SQLite")
    ap.add_argument("--root", default=os.environ.get("MEDIA_ROOT", os.getcwd()), help="Media library root (defaults to MEDIA_ROOT or cwd)")
    ap.add_argument("--limit", type=int, default=None, help="Only process the first N media paths (for testing)")
    ap.add_argument("--apply", action="store_true", help="Persist the imported data into the database before verification")
    ap.add_argument("--archive", action="store_true", help="Archive JSON sidecars after a clean verification (implies --apply)")
    ap.add_argument("--archive-dir", default=None, help="Optional destination for archived files (requires --archive)")
    ap.add_argument("--delete", action="store_true", help="Delete JSON files after a clean verification (implies --apply)")
    ap.add_argument("--json", action="store_true", help="Emit the final summary as JSON instead of human text")
    return ap


def summarize_output(summary: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(summary, indent=2, sort_keys=True))
        return
    print("Media Attribute Sidecars:")
    print(f"  sidecar entries: {summary['media_attr']['sidecar_count']} (digest={summary['media_attr']['sidecar_digest']})")
    print(f"  db entries:      {summary['media_attr']['db_count']} (digest={summary['media_attr']['db_digest']})")
    if summary['media_attr']['missing_in_db']:
        print(f"  missing in db:   {len(summary['media_attr']['missing_in_db'])}")
    if summary['media_attr']['diffs']:
        print(f"  diffs:           {len(summary['media_attr']['diffs'])} (showing up to 20)")
    print("Metadata Sidecars:")
    print(f"  sidecar entries: {summary['metadata']['sidecar_count']} (digest={summary['metadata']['sidecar_digest']})")
    print(f"  db entries:      {summary['metadata']['db_count']} (digest={summary['metadata']['db_digest']})")
    if summary['metadata']['missing_in_db']:
        print(f"  missing in db:   {len(summary['metadata']['missing_in_db'])}")
    if summary['metadata']['diffs']:
        print(f"  diffs:           {len(summary['metadata']['diffs'])} (showing up to 20)")
    if summary['tags']['ambiguous']:
        print(f"Tags JSON ambiguous mappings: {len(summary['tags']['ambiguous'])}")
    if summary['tags']['parse_errors']:
        print(f"Tags JSON parse errors: {len(summary['tags']['parse_errors'])}")
    if summary['tags']['unmapped']:
        print(f"Tags JSON without matching media: {len(summary['tags']['unmapped'])}")
    if summary.get('index_warnings'):
        print(f"Media attr index warnings: {len(summary['index_warnings'])}")
    print(f"Rows processed this run (apply): attr={summary['apply_stats']['media_attr_rows']} metadata={summary['apply_stats']['metadata_rows']}")
    if summary.get('archive_result'):
        arc = summary['archive_result']
        print(f"Archived {len(arc.get('moves', []))} file(s) to {arc.get('archive_dir')}")
    if summary.get('delete_result'):
        print(f"Deleted {len(summary['delete_result'])} file(s)")
    print(f"Success: {summary['success']}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    root = Path(args.root).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"[cli] Root not found: {root}", file=sys.stderr)
        return 2
    if args.archive and not args.apply:
        parser.error("--archive requires --apply")
    if args.delete and not args.apply:
        parser.error("--delete requires --apply")
    if args.archive and args.delete:
        parser.error("Choose either --archive or --delete, not both")
    if args.archive_dir and not args.archive:
        parser.error("--archive-dir requires --archive")
    archive_dir: Optional[Path]
    if args.archive and args.archive_dir:
        archive_dir = Path(args.archive_dir).expanduser().resolve()
    else:
        archive_dir = None

    os.environ.setdefault("MEDIA_ROOT", str(root))
    global APP, DB
    APP = import_app_module()
    DB = importlib.import_module("db")

    attr_index_path = root / ".artifacts" / "scenes.json"
    media_attr_map, index_warnings = load_media_attr_index(attr_index_path)
    stem_index = build_stem_index(APP, root, media_attr_map)
    metadata_map, metadata_sources, tag_stats = load_tags_sidecars(root, stem_index)
    merged_attr_map = merge_attr_sources(media_attr_map, metadata_map)

    all_paths = sorted(merged_attr_map.keys())
    if args.limit is not None:
        limited_paths = set(all_paths[: args.limit])
    else:
        limited_paths = set(all_paths)
    attr_map = {rel: merged_attr_map[rel] for rel in all_paths if rel in limited_paths}
    meta_map = {rel: metadata_map[rel] for rel in metadata_map.keys() if rel in limited_paths}
    meta_sources = {rel: metadata_sources[rel] for rel in metadata_sources if rel in limited_paths}

    if args.apply:
        apply_stats = apply_updates(attr_map, meta_map)
    else:
        apply_stats = {"media_attr_rows": 0, "metadata_rows": 0}

    db_attr_map, missing_attr = fetch_db_media_attr(list(attr_map.keys()))
    db_meta_map, missing_meta = fetch_db_metadata(list(meta_map.keys()))

    attr_diff = diff_media_attr(attr_map, db_attr_map)
    meta_diff = diff_metadata(meta_map, db_meta_map)

    media_attr_digest = digest_media_attr_map(attr_map)
    db_attr_digest = digest_media_attr_map(db_attr_map)
    metadata_digest = digest_metadata_map(meta_map)
    db_metadata_digest = digest_metadata_map(db_meta_map)

    summary: dict[str, Any] = {
        "media_attr": {
            "sidecar_count": len(attr_map),
            "db_count": len(db_attr_map),
            "sidecar_digest": media_attr_digest,
            "db_digest": db_attr_digest,
            "diffs": attr_diff,
            "missing_in_db": missing_attr,
        },
        "metadata": {
            "sidecar_count": len(meta_map),
            "db_count": len(db_meta_map),
            "sidecar_digest": metadata_digest,
            "db_digest": db_metadata_digest,
            "diffs": meta_diff,
            "missing_in_db": missing_meta,
        },
        "tags": tag_stats,
        "index_warnings": index_warnings,
        "apply_stats": apply_stats,
        "success": False,
    }

    success = not (
        attr_diff
        or meta_diff
        or missing_attr
        or missing_meta
        or tag_stats["ambiguous"]
        or tag_stats["parse_errors"]
        or tag_stats["unmapped"]
    )
    summary["success"] = success

    files_for_cleanup: list[Path] = []
    if attr_index_path.exists() and args.limit is None:
        files_for_cleanup.append(attr_index_path)
    files_for_cleanup.extend(meta_sources.values())
    files_for_cleanup = list(dict.fromkeys(files_for_cleanup))

    if success and args.archive and files_for_cleanup:
        archive_dir_resolved = archive_dir
        archive_info = {}
        if archive_dir_resolved is not None:
            archive_dir_resolved.mkdir(parents=True, exist_ok=True)
        try:
            archive_dir_used, moves = archive_files(root, files_for_cleanup, archive_dir_resolved)
            archive_info = {"archive_dir": str(archive_dir_used), "moves": moves}
        except Exception as exc:
            summary["archive_error"] = str(exc)
        else:
            summary["archive_result"] = archive_info
    if success and args.delete and files_for_cleanup:
        removed = delete_files(files_for_cleanup)
        summary["delete_result"] = removed

    summarize_output(summary, args.json)
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
