import httpx
from pathlib import Path


def register(manager):
    manager.register("metadata", scrape)


def scrape(path: Path, metadata: dict):
    """Populate simple web metadata using Google suggestions."""
    query = Path(path).stem
    try:
        resp = httpx.get(
            "https://suggestqueries.google.com/complete/search",
            params={"client": "firefox", "q": query},
            timeout=5.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            suggestions = data[1] if isinstance(data, list) and len(data) > 1 else []
            if suggestions:
                metadata.setdefault("web", suggestions[0])
    except Exception:
        # Network failures shouldn't break import
        return
