from __future__ import annotations
from pathlib import Path
from typing import Callable, Optional, Tuple, List, Dict
import threading
import time
import os

try:  # optional dependency
    import psutil  # type: ignore
except Exception:  # pragma: no cover
    psutil = None  # type: ignore


class IdleWorker:
    """
    Background worker that periodically checks CPU idle state and, when idle long enough,
    asks the host app which artifact to generate next and submits a job for it.

    This class is decoupled from the application by using injected callables.
    """

    def __init__(
        self,
        *,
        conf_getter: Callable[[], Dict],
        base_path: Path,
        active_jobs_fn: Callable[[], int],
        pick_next_fn: Callable[[Path, List[str]], Tuple[Optional[str], Optional[str]]],
        submit_fn: Callable[[str, str], Optional[str]],
    ) -> None:
        self._conf_getter = conf_getter
        self._base = base_path
        self._active_jobs_fn = active_jobs_fn
        self._pick_next_fn = pick_next_fn
        self._submit_fn = submit_fn
        self._stop = threading.Event()
        self._th: Optional[threading.Thread] = None

    def start(self) -> None:
        if self._th and self._th.is_alive():
            return
        self._stop.clear()
        t = threading.Thread(target=self._loop, name="idle-worker", daemon=True)
        self._th = t
        t.start()

    def stop(self) -> None:
        try:
            self._stop.set()
        except Exception:
            pass

    def is_running(self) -> bool:
        return bool(self._th and self._th.is_alive())

    # Internal helpers
    @staticmethod
    def _cpu_is_idle(conf: Dict) -> bool:
        try:
            if psutil is not None:
                pct = float(psutil.cpu_percent(interval=0.5))
                return pct <= float(conf.get("cpu_percent_max", 25.0))
        except Exception:
            pass
        # Fallback to loadavg per core (Unix-like, incl. Raspberry Pi)
        try:
            la1, _la5, _la15 = os.getloadavg()  # type: ignore[attr-defined]
            cores = os.cpu_count() or 1
            per_core = (la1 / max(1, cores))
            return per_core <= float(conf.get("load_per_core_max", 0.60))
        except Exception:
            return False

    def _loop(self) -> None:
        conf = dict(self._conf_getter() or {})
        min_idle = int(conf.get("min_idle_seconds", 60) or 60)
        poll = max(3, int(conf.get("poll_seconds", 15) or 15))
        max_conc = int(conf.get("max_concurrent", 1) or 1)
        kinds = [str(x).lower() for x in (conf.get("artifacts") or []) if str(x)]
        if not kinds:
            kinds = ["metadata", "thumbnail", "preview"]
        idle_accum = 0.0
        last_check = time.time()
        while not self._stop.is_set():
            now = time.time()
            dt = max(0.0, now - last_check)
            last_check = now
            # Respect running jobs threshold
            try:
                running = int(self._active_jobs_fn())
            except Exception:
                running = 0
            if running >= max_conc:
                idle_accum = 0.0
                self._stop.wait(poll)
                continue
            # Check idle
            try:
                ok = self._cpu_is_idle(conf)
            except Exception:
                ok = False
            if ok:
                idle_accum += dt
            else:
                idle_accum = 0.0
            if idle_accum >= min_idle:
                kind, rel = None, None
                try:
                    kind, rel = self._pick_next_fn(self._base, kinds)
                except Exception:
                    kind, rel = None, None
                if kind and rel:
                    try:
                        self._submit_fn(kind, rel)
                    except Exception:
                        pass
                    # Reset and let job start
                    idle_accum = 0.0
                    self._stop.wait(poll)
                    continue
            self._stop.wait(poll)
