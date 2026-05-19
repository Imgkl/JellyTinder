package db

import (
	"database/sql"
	"errors"
	"strconv"
)

type Settings struct {
	JellyfinURL       string
	JellyfinUser      string
	JellyfinPassword  string
	JellyfinToken     string
	JellyfinUserID    string
	JellyfinConnected bool
	RadarrURL         string
	RadarrAPIKey      string
	RadarrConnected   bool
	SonarrURL         string
	SonarrAPIKey      string
	SonarrConnected   bool
	BatchingStrategy  string // "alpha" or "fixed"
	MaxBatchSize      int
	LibraryMovies     bool
	LibraryTV         bool
	HideWatched       bool
	Onboarded         bool
}

const (
	keyJellyfinURL       = "jellyfin_url"
	keyJellyfinUser      = "jellyfin_user"
	keyJellyfinPassword  = "jellyfin_password"
	keyJellyfinToken     = "jellyfin_token"
	keyJellyfinUserID    = "jellyfin_user_id"
	keyJellyfinConnected = "jellyfin_connected"
	keyRadarrURL         = "radarr_url"
	keyRadarrAPIKey      = "radarr_api_key"
	keyRadarrConnected   = "radarr_connected"
	keySonarrURL         = "sonarr_url"
	keySonarrAPIKey      = "sonarr_api_key"
	keySonarrConnected   = "sonarr_connected"
	keyBatchingStrategy  = "batching_strategy"
	keyMaxBatchSize      = "max_batch_size"
	keyLibraryMovies     = "library_movies"
	keyLibraryTV         = "library_tv"
	keyHideWatched       = "hide_watched"
	keyOnboarded         = "onboarded"
)

func LoadSettings(conn *sql.DB) (Settings, error) {
	rows, err := conn.Query(`SELECT key, value FROM settings`)
	if err != nil {
		return Settings{}, err
	}
	defer rows.Close()
	m := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return Settings{}, err
		}
		m[k] = v
	}
	if err := rows.Err(); err != nil {
		return Settings{}, err
	}

	maxBatch, _ := strconv.Atoi(m[keyMaxBatchSize])
	if maxBatch <= 0 {
		maxBatch = 25
	}

	batching := m[keyBatchingStrategy]
	if batching != "fixed" {
		batching = "alpha"
	}

	s := Settings{
		JellyfinURL:       m[keyJellyfinURL],
		JellyfinUser:      m[keyJellyfinUser],
		JellyfinPassword:  m[keyJellyfinPassword],
		JellyfinToken:     m[keyJellyfinToken],
		JellyfinUserID:    m[keyJellyfinUserID],
		JellyfinConnected: m[keyJellyfinConnected] == "1",
		RadarrURL:         m[keyRadarrURL],
		RadarrAPIKey:      m[keyRadarrAPIKey],
		RadarrConnected:   m[keyRadarrConnected] == "1",
		SonarrURL:         m[keySonarrURL],
		SonarrAPIKey:      m[keySonarrAPIKey],
		SonarrConnected:   m[keySonarrConnected] == "1",
		BatchingStrategy:  batching,
		MaxBatchSize:      maxBatch,
		LibraryMovies:     boolDefault(m, keyLibraryMovies, true),
		LibraryTV:         boolDefault(m, keyLibraryTV, true),
		HideWatched:       m[keyHideWatched] == "1",
		Onboarded:         m[keyOnboarded] == "1",
	}
	return s, nil
}

func boolDefault(m map[string]string, k string, dflt bool) bool {
	v, ok := m[k]
	if !ok {
		return dflt
	}
	return v == "1"
}

func SaveSettingsMap(conn *sql.DB, kv map[string]string) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for k, v := range kv {
		if _, err := tx.Exec(
			`INSERT INTO settings (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
			k, v,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func SetSetting(conn *sql.DB, k, v string) error {
	return SaveSettingsMap(conn, map[string]string{k: v})
}

func GetSetting(conn *sql.DB, k string) (string, error) {
	var v string
	err := conn.QueryRow(`SELECT value FROM settings WHERE key=?`, k).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return v, err
}

// Public key constants for callers outside this package.
var (
	KeyJellyfinURL       = keyJellyfinURL
	KeyJellyfinUser      = keyJellyfinUser
	KeyJellyfinPassword  = keyJellyfinPassword
	KeyJellyfinToken     = keyJellyfinToken
	KeyJellyfinUserID    = keyJellyfinUserID
	KeyJellyfinConnected = keyJellyfinConnected
	KeyRadarrURL         = keyRadarrURL
	KeyRadarrAPIKey      = keyRadarrAPIKey
	KeyRadarrConnected   = keyRadarrConnected
	KeySonarrURL         = keySonarrURL
	KeySonarrAPIKey      = keySonarrAPIKey
	KeySonarrConnected   = keySonarrConnected
	KeyBatchingStrategy  = keyBatchingStrategy
	KeyMaxBatchSize      = keyMaxBatchSize
	KeyLibraryMovies     = keyLibraryMovies
	KeyLibraryTV         = keyLibraryTV
	KeyHideWatched       = keyHideWatched
	KeyOnboarded         = keyOnboarded
)
