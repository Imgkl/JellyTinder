package server

import (
	"time"

	"github.com/gokul/jellytinder/internal/db"
	"github.com/gokul/jellytinder/internal/jellyfin"
)

type ItemDTO struct {
	ID         int64      `json:"id"`
	Source     string     `json:"source"`
	JellyfinID string     `json:"jellyfinId"`
	RadarrID   *int64     `json:"radarrId"`
	SonarrID   *int64     `json:"sonarrId"`
	Title      string     `json:"title"`
	Year       *int       `json:"year"`
	RuntimeMin *int       `json:"runtimeMin"`
	SizeBytes  int64      `json:"sizeBytes"`
	Path       string     `json:"path"`
	WatchedAt  *time.Time `json:"watchedAt"`
	PosterURL  *string    `json:"posterUrl"`
	Status     string     `json:"status"`
}

type SettingsDTO struct {
	JellyfinURL       string `json:"jellyfinUrl"`
	JellyfinUser      string `json:"jellyfinUser"`
	JellyfinConnected bool   `json:"jellyfinConnected"`
	RadarrURL         string `json:"radarrUrl"`
	RadarrConnected   bool   `json:"radarrConnected"`
	SonarrURL         string `json:"sonarrUrl"`
	SonarrConnected   bool   `json:"sonarrConnected"`
	BatchingStrategy  string `json:"batchingStrategy"`
	MaxBatchSize      int    `json:"maxBatchSize"`
	LibraryMovies     bool   `json:"libraryMovies"`
	LibraryTV         bool   `json:"libraryTv"`
	HideWatched       bool   `json:"hideWatched"`
	Onboarded         bool   `json:"onboarded"`
}

type ConnectionStatusDTO struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
	Version string `json:"version,omitempty"`
}

type SetupTestRequest struct {
	Jellyfin *struct {
		URL      string `json:"url"`
		Username string `json:"username"`
		Password string `json:"password"`
	} `json:"jellyfin,omitempty"`
	Radarr *struct {
		URL    string `json:"url"`
		APIKey string `json:"apiKey"`
	} `json:"radarr,omitempty"`
	Sonarr *struct {
		URL    string `json:"url"`
		APIKey string `json:"apiKey"`
	} `json:"sonarr,omitempty"`
}

type SetupTestResponse struct {
	Jellyfin *ConnectionStatusDTO `json:"jellyfin,omitempty"`
	Radarr   *ConnectionStatusDTO `json:"radarr,omitempty"`
	Sonarr   *ConnectionStatusDTO `json:"sonarr,omitempty"`
}

type ReviewRequest struct {
	ItemID   int64  `json:"itemId"`
	Decision string `json:"decision"` // keep | mark
}

type DeletionResultDTO struct {
	ItemID     int64  `json:"itemId"`
	Title      string `json:"title"`
	SizeBytes  int64  `json:"sizeBytes"`
	JellyfinOK bool   `json:"jellyfinOk"`
	RadarrOK   bool   `json:"radarrOk"`
	SonarrOK   bool   `json:"sonarrOk"`
	Error      *string `json:"error"`
	RadarrID   *int64 `json:"radarrId"`
	SonarrID   *int64 `json:"sonarrId"`
}

type StatsDTO struct {
	LibraryTotal           int   `json:"libraryTotal"`
	ReviewedSession        int   `json:"reviewedSession"`
	TrayCount              int   `json:"trayCount"`
	TrayBytes              int64 `json:"trayBytes"`
	LifetimeDeleted        int   `json:"lifetimeDeleted"`
	LifetimeReclaimedBytes int64 `json:"lifetimeReclaimedBytes"`
	MovieCount             int   `json:"movieCount"`
	MovieBytes             int64 `json:"movieBytes"`
	TVCount                int   `json:"tvCount"`
	TVBytes                int64 `json:"tvBytes"`
}

func dtoFromItem(it db.Item, jf *jellyfin.Client) ItemDTO {
	var poster *string
	if it.PosterURL != nil && *it.PosterURL != "" {
		v := *it.PosterURL
		poster = &v
	} else if jf != nil && it.JellyfinID != "" {
		v := jf.PosterURL(it.JellyfinID, "")
		poster = &v
	}
	return ItemDTO{
		ID:         it.ID,
		Source:     it.Source,
		JellyfinID: it.JellyfinID,
		RadarrID:   it.RadarrID,
		SonarrID:   it.SonarrID,
		Title:      it.Title,
		Year:       it.Year,
		RuntimeMin: it.RuntimeMin,
		SizeBytes:  it.SizeBytes,
		Path:       it.Path,
		WatchedAt:  it.WatchedAt,
		PosterURL:  poster,
		Status:     it.Status,
	}
}

func dtoFromSettings(s db.Settings) SettingsDTO {
	return SettingsDTO{
		JellyfinURL:       s.JellyfinURL,
		JellyfinUser:      s.JellyfinUser,
		JellyfinConnected: s.JellyfinConnected,
		RadarrURL:         s.RadarrURL,
		RadarrConnected:   s.RadarrConnected,
		SonarrURL:         s.SonarrURL,
		SonarrConnected:   s.SonarrConnected,
		BatchingStrategy:  s.BatchingStrategy,
		MaxBatchSize:      s.MaxBatchSize,
		LibraryMovies:     s.LibraryMovies,
		LibraryTV:         s.LibraryTV,
		HideWatched:       s.HideWatched,
		Onboarded:         s.Onboarded,
	}
}
