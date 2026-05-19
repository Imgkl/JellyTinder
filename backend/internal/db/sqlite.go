package db

import (
	"database/sql"
	"embed"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func Open(dataDir string) (*sql.DB, error) {
	path := filepath.Join(dataDir, "jellytinder.sqlite")
	// _journal_mode=WAL gives durable concurrent reads while we write.
	// _busy_timeout=5000 retries when another goroutine briefly holds the lock.
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", path)
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(1) // SQLite likes single-writer; readers OK via WAL but keep it simple
	if err := conn.Ping(); err != nil {
		return nil, err
	}
	return conn, nil
}

func Migrate(conn *sql.DB) error {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	if _, err := conn.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		return err
	}
	for _, name := range names {
		var found string
		err := conn.QueryRow(`SELECT name FROM schema_migrations WHERE name = ?`, name).Scan(&found)
		if err == nil {
			continue
		}
		if err != sql.ErrNoRows {
			return err
		}
		data, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		// Multi-statement SQL — exec the whole file in one shot.
		if _, err := conn.Exec(string(data)); err != nil {
			return fmt.Errorf("migration %s: %w", name, err)
		}
		if _, err := conn.Exec(`INSERT INTO schema_migrations (name) VALUES (?)`, name); err != nil {
			return err
		}
	}
	return nil
}
