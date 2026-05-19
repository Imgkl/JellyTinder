package db

import (
	"database/sql"
)

type DeletionLog struct {
	ItemID     int64
	Title      string
	Source     string
	SizeBytes  int64
	JellyfinOK bool
	RadarrOK   bool
	SonarrOK   bool
	Error      *string
}

func WriteDeletionLog(conn *sql.DB, l DeletionLog) error {
	_, err := conn.Exec(
		`INSERT INTO deletion_log (item_id, title, source, size_bytes, jellyfin_ok, radarr_ok, sonarr_ok, error)
		 VALUES (?,?,?,?,?,?,?,?)`,
		l.ItemID, l.Title, l.Source, l.SizeBytes,
		boolInt(l.JellyfinOK), boolInt(l.RadarrOK), boolInt(l.SonarrOK), nullStr(l.Error),
	)
	return err
}

type LifetimeStats struct {
	DeletedCount   int
	ReclaimedBytes int64
}

func GetLifetimeStats(conn *sql.DB) (LifetimeStats, error) {
	var s LifetimeStats
	err := conn.QueryRow(
		`SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM deletion_log WHERE jellyfin_ok = 1`,
	).Scan(&s.DeletedCount, &s.ReclaimedBytes)
	return s, err
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
