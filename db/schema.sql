-- Media Player database schema
-- SQLite dialect; enable foreign-key enforcement once per connection.
PRAGMA foreign_keys = ON;

-- Core video/library metadata. Rel_path stays relative to MEDIA_ROOT for portability.
CREATE TABLE IF NOT EXISTS video (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rel_path TEXT NOT NULL UNIQUE,
  mtime_ns INTEGER NOT NULL,
  size_bytes INTEGER,
  duration REAL,
  width INTEGER,
  height INTEGER,
  bitrate INTEGER,
  format TEXT,
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  rating INTEGER,
  description TEXT,
  metadata_json TEXT,
  phash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_mtime ON video(mtime_ns);
CREATE INDEX IF NOT EXISTS idx_video_duration ON video(duration);
CREATE INDEX IF NOT EXISTS idx_video_phash ON video(phash);

-- Tags registry with normalized (lowercase) key for fast lookups.
CREATE TABLE IF NOT EXISTS tag (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  norm TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media_tags (
  media_id INTEGER NOT NULL REFERENCES video(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (media_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_media_tags_tag ON media_tags(tag_id);

-- Performers registry mirrors tag structure.
CREATE TABLE IF NOT EXISTS performer (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  norm TEXT NOT NULL UNIQUE,
  image_path TEXT,
  bio TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media_performers (
  media_id INTEGER NOT NULL REFERENCES video(id) ON DELETE CASCADE,
  performer_id INTEGER NOT NULL REFERENCES performer(id) ON DELETE CASCADE,
  PRIMARY KEY (media_id, performer_id)
);
CREATE INDEX IF NOT EXISTS idx_media_performers_perf ON media_performers(performer_id);

-- Artifacts represent generated sidecars (thumbnail, preview, sprites, etc.).
CREATE TABLE IF NOT EXISTS artifact (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL REFERENCES video(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (media_id, type)
);
CREATE INDEX IF NOT EXISTS idx_artifact_type ON artifact(type);

-- Jobs table mirrors the in-memory queue for persistence / recovery.
CREATE TABLE IF NOT EXISTS job (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  media_id INTEGER REFERENCES video(id) ON DELETE SET NULL,
  target_path TEXT,
  state TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  progress INTEGER,
  total INTEGER,
  payload_json TEXT,
  result_json TEXT,
  error TEXT,
  heartbeat_ts INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_job_state ON job(state);
CREATE INDEX IF NOT EXISTS idx_job_media ON job(media_id);

-- Schema version tracking (Alembic-lite). Row id stays fixed at 1; bump version via migrations.
CREATE TABLE IF NOT EXISTS schema_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  applied_at INTEGER NOT NULL
);

INSERT INTO schema_version (id, version, applied_at)
SELECT 1, 1, CAST(strftime('%s','now') AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE id = 1);
