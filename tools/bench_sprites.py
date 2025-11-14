from __future__ import annotations
import os
import sys
import time
import argparse
from pathlib import Path

# Import from app module
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app  # type: ignore


def _rm_if_exists(p: Path) -> None:
    try:
        if p.exists():
            p.unlink()
    except Exception:
        pass


def bench(file: Path, interval: float, width: int, cols: int, rows: int, quality: int) -> None:
    # Ensure artifacts directory exists
    (file.parent / ".artifacts").mkdir(parents=True, exist_ok=True)
    sheet, j = app.sprite_sheet_paths(file)

    # 1) Legacy tile filter path (force off even-sampling and autoswitch)
    os.environ.pop("SPRITES_EVEN_SAMPLING", None)
    os.environ["SPRITES_AUTO_EVEN_SEC"] = "999999"  # prevent auto-switch
    _rm_if_exists(sheet)
    _rm_if_exists(j)
    t0 = time.time()
    app.generate_sprite_sheet(
        file,
        interval=interval,
        width=width,
        cols=cols,
        rows=rows,
        quality=quality,
    )
    t1 = time.time()
    legacy_time = t1 - t0

    # 2) Even sampling path (force on)
    os.environ["SPRITES_EVEN_SAMPLING"] = "1"
    os.environ.pop("SPRITES_AUTO_EVEN_SEC", None)
    _rm_if_exists(sheet)
    _rm_if_exists(j)
    t0 = time.time()
    app.generate_sprite_sheet(
        file,
        interval=interval,
        width=width,
        cols=cols,
        rows=rows,
        quality=quality,
    )
    t1 = time.time()
    even_time = t1 - t0

    print("\nSprite benchmark results:")
    print(f" - Legacy tile path: {legacy_time:.2f}s")
    print(f" - Even sampling   : {even_time:.2f}s")
    print("Artifacts:")
    print(f" - Sheet: {sheet}")
    print(f" - Index: {j}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Benchmark sprite generation modes")
    ap.add_argument("file", help="Path to a video file")
    ap.add_argument("--interval", type=float, default=float(app._sprite_defaults()["interval"]))
    ap.add_argument("--width", type=int, default=int(app._sprite_defaults()["width"]))
    ap.add_argument("--cols", type=int, default=int(app._sprite_defaults()["cols"]))
    ap.add_argument("--rows", type=int, default=int(app._sprite_defaults()["rows"]))
    ap.add_argument("--quality", type=int, default=int(app._sprite_defaults()["quality"]))
    args = ap.parse_args()
    fp = Path(args.file).expanduser().resolve()
    if not (fp.exists() and fp.is_file()):
        print(f"File not found: {fp}", file=sys.stderr)
        sys.exit(2)
    bench(fp, args.interval, args.width, args.cols, args.rows, args.quality)
