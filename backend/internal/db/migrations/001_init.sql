CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK(source IN ('movie','tv')),
  jellyfin_id TEXT NOT NULL UNIQUE,
  radarr_id INTEGER,
  sonarr_id INTEGER,
  title TEXT NOT NULL,
  sort_title TEXT NOT NULL,
  year INTEGER,
  runtime_min INTEGER,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  path TEXT NOT NULL DEFAULT '',
  watched_at TEXT,
  poster_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','kept','marked','deleted')),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_items_source_status ON items(source, status);
CREATE INDEX idx_items_sort_title ON items(sort_title);

CREATE TABLE deletion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  jellyfin_ok INTEGER NOT NULL DEFAULT 0,
  radarr_ok INTEGER NOT NULL DEFAULT 0,
  sonarr_ok INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
