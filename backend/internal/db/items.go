package db

import (
	"database/sql"
	"strings"
	"time"
)

type Item struct {
	ID         int64
	Source     string
	JellyfinID string
	RadarrID   *int64
	SonarrID   *int64
	Title      string
	SortTitle  string
	Year       *int
	RuntimeMin *int
	SizeBytes  int64
	Path       string
	WatchedAt  *time.Time
	PosterURL  *string
	Status     string
	DecidedAt  *time.Time
}

func UpsertItem(tx *sql.Tx, it Item) error {
	_, err := tx.Exec(
		`INSERT INTO items (source, jellyfin_id, radarr_id, sonarr_id, title, sort_title,
			year, runtime_min, size_bytes, path, watched_at, poster_url, status, updated_at)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?, COALESCE((SELECT status FROM items WHERE jellyfin_id=?), 'pending'), CURRENT_TIMESTAMP)
		 ON CONFLICT(jellyfin_id) DO UPDATE SET
			source       = excluded.source,
			radarr_id    = COALESCE(excluded.radarr_id, items.radarr_id),
			sonarr_id    = COALESCE(excluded.sonarr_id, items.sonarr_id),
			title        = excluded.title,
			sort_title   = excluded.sort_title,
			year         = excluded.year,
			runtime_min  = excluded.runtime_min,
			size_bytes   = excluded.size_bytes,
			path         = excluded.path,
			watched_at   = COALESCE(excluded.watched_at, items.watched_at),
			poster_url   = COALESCE(excluded.poster_url, items.poster_url),
			updated_at   = CURRENT_TIMESTAMP`,
		it.Source, it.JellyfinID, nullInt(it.RadarrID), nullInt(it.SonarrID),
		it.Title, it.SortTitle, nullIntFromPtr(it.Year), nullIntFromPtr(it.RuntimeMin),
		it.SizeBytes, it.Path, nullTime(it.WatchedAt), nullStr(it.PosterURL),
		it.JellyfinID,
	)
	return err
}

type ListFilter struct {
	Source      string // "movie" | "tv" | ""
	Statuses    []string
	HideWatched bool
}

func ListItems(conn *sql.DB, f ListFilter) ([]Item, error) {
	var where []string
	var args []any
	if f.Source != "" {
		where = append(where, "source = ?")
		args = append(args, f.Source)
	}
	if len(f.Statuses) > 0 {
		placeholders := strings.Repeat("?,", len(f.Statuses))
		placeholders = placeholders[:len(placeholders)-1]
		where = append(where, "status IN ("+placeholders+")")
		for _, s := range f.Statuses {
			args = append(args, s)
		}
	}
	if f.HideWatched {
		where = append(where, "watched_at IS NULL")
	}
	q := `SELECT id, source, jellyfin_id, radarr_id, sonarr_id, title, sort_title,
		year, runtime_min, size_bytes, path, watched_at, poster_url, status, decided_at
		FROM items`
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY sort_title COLLATE NOCASE, year"
	rows, err := conn.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanItems(rows)
}

func ListPendingForBatching(conn *sql.DB, source string, hideWatched bool) ([]Item, error) {
	return ListItems(conn, ListFilter{Source: source, Statuses: []string{"pending"}, HideWatched: hideWatched})
}

// ListLiveForBatching returns every item that's still part of the review universe
// (pending, kept, or marked — not deleted). Used to compute stable batch totals
// that don't shrink as the user makes decisions.
func ListLiveForBatching(conn *sql.DB, source string, hideWatched bool) ([]Item, error) {
	return ListItems(conn, ListFilter{
		Source:      source,
		Statuses:    []string{"pending", "kept", "marked"},
		HideWatched: hideWatched,
	})
}

func ListMarked(conn *sql.DB) ([]Item, error) {
	return ListItems(conn, ListFilter{Statuses: []string{"marked"}})
}

func GetItem(conn *sql.DB, id int64) (Item, error) {
	rows, err := conn.Query(
		`SELECT id, source, jellyfin_id, radarr_id, sonarr_id, title, sort_title,
		 year, runtime_min, size_bytes, path, watched_at, poster_url, status, decided_at
		 FROM items WHERE id = ?`, id,
	)
	if err != nil {
		return Item{}, err
	}
	defer rows.Close()
	out, err := scanItems(rows)
	if err != nil {
		return Item{}, err
	}
	if len(out) == 0 {
		return Item{}, sql.ErrNoRows
	}
	return out[0], nil
}

func SetStatus(conn *sql.DB, id int64, status string) error {
	_, err := conn.Exec(
		`UPDATE items SET status=?, decided_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
		status, id,
	)
	return err
}

func ResetMarkedToPending(conn *sql.DB) (int64, error) {
	r, err := conn.Exec(`UPDATE items SET status='pending', decided_at=NULL WHERE status='marked'`)
	if err != nil {
		return 0, err
	}
	return r.RowsAffected()
}

func ResetAllToPending(conn *sql.DB) (int64, error) {
	// Reset everything except deleted (already gone).
	r, err := conn.Exec(`UPDATE items SET status='pending', decided_at=NULL WHERE status IN ('kept','marked')`)
	if err != nil {
		return 0, err
	}
	return r.RowsAffected()
}

func UndoLastDecision(conn *sql.DB) (int64, error) {
	// Find the most recent kept/marked decision.
	var id int64
	err := conn.QueryRow(
		`SELECT id FROM items WHERE status IN ('kept','marked') ORDER BY decided_at DESC, id DESC LIMIT 1`,
	).Scan(&id)
	if err != nil {
		if err == sql.ErrNoRows {
			return 0, nil
		}
		return 0, err
	}
	_, err = conn.Exec(`UPDATE items SET status='pending', decided_at=NULL WHERE id=?`, id)
	if err != nil {
		return 0, err
	}
	return id, nil
}

// CountBySource returns count + total bytes per source (movie, tv) for items
// that are still live (not deleted). Used by the Stats panel to break down
// the library by media type.
func CountBySource(conn *sql.DB) (map[string]int, map[string]int64, error) {
	rows, err := conn.Query(
		`SELECT source, COUNT(*), COALESCE(SUM(size_bytes), 0)
		 FROM items
		 WHERE status IN ('pending','kept','marked')
		 GROUP BY source`,
	)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	counts := map[string]int{}
	bytes := map[string]int64{}
	for rows.Next() {
		var s string
		var c int
		var b int64
		if err := rows.Scan(&s, &c, &b); err != nil {
			return nil, nil, err
		}
		counts[s] = c
		bytes[s] = b
	}
	return counts, bytes, rows.Err()
}

func CountByStatus(conn *sql.DB) (map[string]int, map[string]int64, error) {
	rows, err := conn.Query(`SELECT status, COUNT(*), COALESCE(SUM(size_bytes), 0) FROM items GROUP BY status`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	counts := map[string]int{}
	bytes := map[string]int64{}
	for rows.Next() {
		var s string
		var c int
		var b int64
		if err := rows.Scan(&s, &c, &b); err != nil {
			return nil, nil, err
		}
		counts[s] = c
		bytes[s] = b
	}
	return counts, bytes, rows.Err()
}

func DeleteItem(conn *sql.DB, id int64) error {
	_, err := conn.Exec(`DELETE FROM items WHERE id=?`, id)
	return err
}

/* ─── helpers ─── */

func scanItems(rows *sql.Rows) ([]Item, error) {
	var out []Item
	for rows.Next() {
		var it Item
		var radarrID, sonarrID sql.NullInt64
		var year, runtime sql.NullInt64
		var watched sql.NullString
		var poster sql.NullString
		var decided sql.NullString
		if err := rows.Scan(
			&it.ID, &it.Source, &it.JellyfinID, &radarrID, &sonarrID,
			&it.Title, &it.SortTitle, &year, &runtime, &it.SizeBytes,
			&it.Path, &watched, &poster, &it.Status, &decided,
		); err != nil {
			return nil, err
		}
		if radarrID.Valid {
			v := radarrID.Int64
			it.RadarrID = &v
		}
		if sonarrID.Valid {
			v := sonarrID.Int64
			it.SonarrID = &v
		}
		if year.Valid {
			v := int(year.Int64)
			it.Year = &v
		}
		if runtime.Valid {
			v := int(runtime.Int64)
			it.RuntimeMin = &v
		}
		if watched.Valid {
			if t, err := time.Parse(time.RFC3339, watched.String); err == nil {
				it.WatchedAt = &t
			} else if t, err := time.Parse("2006-01-02 15:04:05", watched.String); err == nil {
				it.WatchedAt = &t
			}
		}
		if poster.Valid {
			v := poster.String
			it.PosterURL = &v
		}
		if decided.Valid {
			if t, err := time.Parse(time.RFC3339, decided.String); err == nil {
				it.DecidedAt = &t
			} else if t, err := time.Parse("2006-01-02 15:04:05", decided.String); err == nil {
				it.DecidedAt = &t
			}
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func nullInt(p *int64) any {
	if p == nil {
		return nil
	}
	return *p
}
func nullIntFromPtr(p *int) any {
	if p == nil {
		return nil
	}
	return *p
}
func nullStr(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}
func nullTime(p *time.Time) any {
	if p == nil {
		return nil
	}
	return p.UTC().Format(time.RFC3339)
}
