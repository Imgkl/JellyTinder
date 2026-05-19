package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/gokul/jellytinder/internal/batch"
	"github.com/gokul/jellytinder/internal/db"
	"github.com/gokul/jellytinder/internal/jellyfin"
	"github.com/gokul/jellytinder/internal/radarr"
	"github.com/gokul/jellytinder/internal/sonarr"
)

type Server struct {
	DB *sql.DB
}

func Mount(app *fiber.App, conn *sql.DB) {
	s := &Server{DB: conn}
	v1 := app.Group("/api/v1")

	v1.Get("/health", s.health)

	v1.Get("/settings", s.getSettings)
	v1.Post("/settings", s.postSettings)
	v1.Post("/setup/test", s.setupTest)
	v1.Post("/setup/complete", s.setupComplete)

	v1.Post("/sync", s.sync)

	v1.Get("/batches", s.listBatches)
	v1.Get("/batches/:key/items", s.batchItems)

	v1.Get("/items", s.listItems)

	v1.Post("/review", s.review)
	v1.Post("/review/undo", s.undoReview)
	v1.Post("/review/clear", s.clearReview)

	v1.Get("/tray", s.tray)
	v1.Post("/tray/:id/spare", s.spare)
	v1.Post("/tray/reset", s.resetTray)
	v1.Post("/tray/commit", s.commitTray)

	v1.Get("/stats", s.stats)
}

func (s *Server) health(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"ok": true})
}

/* ─── settings ─── */

func (s *Server) getSettings(c *fiber.Ctx) error {
	st, err := db.LoadSettings(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}
	return c.JSON(dtoFromSettings(st))
}

// postSettings accepts a partial map of camelCase keys. Unknown keys are silently ignored
// so the frontend can be liberal.
func (s *Server) postSettings(c *fiber.Ctx) error {
	var patch map[string]any
	if err := json.Unmarshal(c.Body(), &patch); err != nil {
		return jsonError(c, 400, err)
	}
	kv := map[string]string{}
	for k, v := range patch {
		switch k {
		case "jellyfinUrl":
			kv[db.KeyJellyfinURL] = asString(v)
		case "jellyfinUser":
			kv[db.KeyJellyfinUser] = asString(v)
		case "jellyfinPassword":
			if str := asString(v); str != "" {
				kv[db.KeyJellyfinPassword] = str
			}
		case "radarrUrl":
			kv[db.KeyRadarrURL] = asString(v)
		case "radarrApiKey":
			if str := asString(v); str != "" {
				kv[db.KeyRadarrAPIKey] = str
			}
		case "sonarrUrl":
			kv[db.KeySonarrURL] = asString(v)
		case "sonarrApiKey":
			if str := asString(v); str != "" {
				kv[db.KeySonarrAPIKey] = str
			}
		case "batchingStrategy":
			if str := asString(v); str == "alpha" || str == "fixed" {
				kv[db.KeyBatchingStrategy] = str
			}
		case "maxBatchSize":
			kv[db.KeyMaxBatchSize] = fmt.Sprintf("%d", asInt(v))
		case "libraryMovies":
			kv[db.KeyLibraryMovies] = boolStr(asBool(v))
		case "libraryTv":
			kv[db.KeyLibraryTV] = boolStr(asBool(v))
		case "hideWatched":
			kv[db.KeyHideWatched] = boolStr(asBool(v))
		}
	}

	// If credentials changed, re-auth jellyfin + re-probe arrs in the background-ish
	// (here we do it inline; calls are fast).
	if _, urlChanged := kv[db.KeyJellyfinURL]; urlChanged || hasAny(kv, db.KeyJellyfinUser, db.KeyJellyfinPassword) {
		if err := s.reAuthJellyfin(c.Context(), kv); err != nil {
			kv[db.KeyJellyfinConnected] = "0"
			// don't block save — frontend will see disconnected status
			_ = err
		}
	}
	if hasAny(kv, db.KeyRadarrURL, db.KeyRadarrAPIKey) {
		s.probeRadarr(c.Context(), kv)
	}
	if hasAny(kv, db.KeySonarrURL, db.KeySonarrAPIKey) {
		s.probeSonarr(c.Context(), kv)
	}

	if err := db.SaveSettingsMap(s.DB, kv); err != nil {
		return jsonError(c, 500, err)
	}
	st, err := db.LoadSettings(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}
	return c.JSON(dtoFromSettings(st))
}

func (s *Server) reAuthJellyfin(ctx context.Context, kv map[string]string) error {
	cur, _ := db.LoadSettings(s.DB)
	url := pickStr(kv[db.KeyJellyfinURL], cur.JellyfinURL)
	user := pickStr(kv[db.KeyJellyfinUser], cur.JellyfinUser)
	pass := pickStr(kv[db.KeyJellyfinPassword], cur.JellyfinPassword)
	if url == "" || user == "" || pass == "" {
		return errors.New("jellyfin creds incomplete")
	}
	res, err := jellyfin.AuthenticateByName(ctx, url, user, pass)
	if err != nil {
		return err
	}
	kv[db.KeyJellyfinToken] = res.AccessToken
	kv[db.KeyJellyfinUserID] = res.UserID
	kv[db.KeyJellyfinConnected] = "1"
	return nil
}

func (s *Server) probeRadarr(ctx context.Context, kv map[string]string) {
	cur, _ := db.LoadSettings(s.DB)
	url := pickStr(kv[db.KeyRadarrURL], cur.RadarrURL)
	key := pickStr(kv[db.KeyRadarrAPIKey], cur.RadarrAPIKey)
	if url == "" || key == "" {
		kv[db.KeyRadarrConnected] = "0"
		return
	}
	if _, err := radarr.New(url, key).Status(ctx); err != nil {
		kv[db.KeyRadarrConnected] = "0"
		return
	}
	kv[db.KeyRadarrConnected] = "1"
}

func (s *Server) probeSonarr(ctx context.Context, kv map[string]string) {
	cur, _ := db.LoadSettings(s.DB)
	url := pickStr(kv[db.KeySonarrURL], cur.SonarrURL)
	key := pickStr(kv[db.KeySonarrAPIKey], cur.SonarrAPIKey)
	if url == "" || key == "" {
		kv[db.KeySonarrConnected] = "0"
		return
	}
	if _, err := sonarr.New(url, key).Status(ctx); err != nil {
		kv[db.KeySonarrConnected] = "0"
		return
	}
	kv[db.KeySonarrConnected] = "1"
}

func (s *Server) setupTest(c *fiber.Ctx) error {
	var req SetupTestRequest
	if err := json.Unmarshal(c.Body(), &req); err != nil {
		return jsonError(c, 400, err)
	}
	resp := SetupTestResponse{}

	if req.Jellyfin != nil {
		r, err := jellyfin.AuthenticateByName(c.Context(), req.Jellyfin.URL, req.Jellyfin.Username, req.Jellyfin.Password)
		if err != nil {
			resp.Jellyfin = &ConnectionStatusDTO{OK: false, Message: err.Error()}
		} else {
			resp.Jellyfin = &ConnectionStatusDTO{OK: true, Message: r.ServerName, Version: r.Version}
		}
	}
	if req.Radarr != nil {
		st, err := radarr.New(req.Radarr.URL, req.Radarr.APIKey).Status(c.Context())
		if err != nil {
			resp.Radarr = &ConnectionStatusDTO{OK: false, Message: err.Error()}
		} else {
			resp.Radarr = &ConnectionStatusDTO{OK: true, Message: st.AppName, Version: st.Version}
		}
	}
	if req.Sonarr != nil {
		st, err := sonarr.New(req.Sonarr.URL, req.Sonarr.APIKey).Status(c.Context())
		if err != nil {
			resp.Sonarr = &ConnectionStatusDTO{OK: false, Message: err.Error()}
		} else {
			resp.Sonarr = &ConnectionStatusDTO{OK: true, Message: st.AppName, Version: st.Version}
		}
	}
	return c.JSON(resp)
}

func (s *Server) setupComplete(c *fiber.Ctx) error {
	if err := db.SetSetting(s.DB, db.KeyOnboarded, "1"); err != nil {
		return jsonError(c, 500, err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

/* ─── sync ─── */

func (s *Server) sync(c *fiber.Ctx) error {
	st, err := db.LoadSettings(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}
	if st.JellyfinToken == "" || st.JellyfinUserID == "" {
		return jsonError(c, 400, errors.New("jellyfin not authenticated"))
	}
	jf := jellyfin.New(st.JellyfinURL, st.JellyfinToken, st.JellyfinUserID)
	items, err := jf.ListItems(c.Context(), st.LibraryMovies, st.LibraryTV)
	if err != nil {
		return jsonError(c, 502, err)
	}

	// Cross-reference Radarr (movies) and Sonarr (TV) by TMDB / TVDB IDs.
	var radarrByTMDB map[int]int64
	var sonarrByTVDB map[int]int64
	if st.RadarrURL != "" && st.RadarrAPIKey != "" {
		if movies, err := radarr.New(st.RadarrURL, st.RadarrAPIKey).AllMovies(c.Context()); err == nil {
			radarrByTMDB = make(map[int]int64, len(movies))
			for _, m := range movies {
				if m.TmdbID > 0 {
					radarrByTMDB[m.TmdbID] = m.ID
				}
			}
		}
	}
	if st.SonarrURL != "" && st.SonarrAPIKey != "" {
		if series, err := sonarr.New(st.SonarrURL, st.SonarrAPIKey).AllSeries(c.Context()); err == nil {
			sonarrByTVDB = make(map[int]int64, len(series))
			for _, sr := range series {
				if sr.TvdbID > 0 {
					sonarrByTVDB[sr.TvdbID] = sr.ID
				}
			}
		}
	}

	tx, err := s.DB.Begin()
	if err != nil {
		return jsonError(c, 500, err)
	}
	defer tx.Rollback()

	var movieCount, tvCount int
	for _, it := range items {
		source := "movie"
		if it.Type == "Series" {
			source = "tv"
			tvCount++
		} else {
			movieCount++
		}

		var radarrID, sonarrID *int64
		if source == "movie" && radarrByTMDB != nil {
			if tmdb, ok := it.ProviderIDs["Tmdb"]; ok {
				var id int
				fmt.Sscanf(tmdb, "%d", &id)
				if rID, ok := radarrByTMDB[id]; ok {
					radarrID = &rID
				}
			}
		}
		if source == "tv" && sonarrByTVDB != nil {
			if tvdb, ok := it.ProviderIDs["Tvdb"]; ok {
				var id int
				fmt.Sscanf(tvdb, "%d", &id)
				if sID, ok := sonarrByTVDB[id]; ok {
					sonarrID = &sID
				}
			}
		}

		sortTitle := it.SortName
		if sortTitle == "" {
			sortTitle = batch.SortTitleFor(it.Name)
		}

		var year, runtime *int
		if it.ProductionYear > 0 {
			y := it.ProductionYear
			year = &y
		}
		if it.RunTimeMinutes > 0 {
			r := it.RunTimeMinutes
			runtime = &r
		}
		var poster *string
		if it.PosterTag != "" {
			u := jf.PosterURL(it.ID, it.PosterTag)
			poster = &u
		}

		if err := db.UpsertItem(tx, db.Item{
			Source:     source,
			JellyfinID: it.ID,
			RadarrID:   radarrID,
			SonarrID:   sonarrID,
			Title:      it.Name,
			SortTitle:  sortTitle,
			Year:       year,
			RuntimeMin: runtime,
			SizeBytes:  it.SizeBytes,
			Path:       it.Path,
			WatchedAt:  it.LastPlayedDate,
			PosterURL:  poster,
		}); err != nil {
			return jsonError(c, 500, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return jsonError(c, 500, err)
	}
	return c.JSON(fiber.Map{
		"count":  len(items),
		"movies": movieCount,
		"tv":     tvCount,
	})
}

/* ─── batches ─── */

func (s *Server) listBatches(c *fiber.Ctx) error {
	source := c.Query("type", "movie")
	if source != "movie" && source != "tv" {
		return jsonError(c, 400, errors.New("invalid type"))
	}
	st, err := db.LoadSettings(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}
	items, err := db.ListLiveForBatching(s.DB, source, st.HideWatched)
	if err != nil {
		return jsonError(c, 500, err)
	}
	return c.JSON(batch.Compute(items, st.BatchingStrategy, st.MaxBatchSize))
}

func (s *Server) batchItems(c *fiber.Ctx) error {
	key := c.Params("key")
	if key == "" {
		return jsonError(c, 400, errors.New("missing key"))
	}
	st, err := db.LoadSettings(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}
	source := c.Query("type", "movie")
	if source != "movie" && source != "tv" {
		return jsonError(c, 400, errors.New("invalid type"))
	}
	items, err := db.ListLiveForBatching(s.DB, source, st.HideWatched)
	if err != nil {
		return jsonError(c, 500, err)
	}
	got := batch.SliceItems(items, st.BatchingStrategy, st.MaxBatchSize, key)
	var jf *jellyfin.Client
	if st.JellyfinToken != "" && st.JellyfinUserID != "" {
		jf = jellyfin.New(st.JellyfinURL, st.JellyfinToken, st.JellyfinUserID)
	}
	out := make([]ItemDTO, 0, len(got))
	for _, it := range got {
		out = append(out, dtoFromItem(it, jf))
	}
	return c.JSON(out)
}

/* ─── items (library browser) ─── */

func (s *Server) listItems(c *fiber.Ctx) error {
	source := c.Query("source") // movie | tv | "" (all)
	if source != "" && source != "movie" && source != "tv" {
		return jsonError(c, 400, errors.New("invalid source"))
	}
	statuses := []string{}
	switch c.Query("status") {
	case "pending", "kept", "marked", "deleted":
		statuses = []string{c.Query("status")}
	case "live", "":
		// default: anything not deleted
		statuses = []string{"pending", "kept", "marked"}
	case "all":
		statuses = nil // no filter
	default:
		return jsonError(c, 400, errors.New("invalid status"))
	}
	q := strings.ToLower(strings.TrimSpace(c.Query("q")))

	st, _ := db.LoadSettings(s.DB)
	items, err := db.ListItems(s.DB, db.ListFilter{
		Source:   source,
		Statuses: statuses,
	})
	if err != nil {
		return jsonError(c, 500, err)
	}
	var jf *jellyfin.Client
	if st.JellyfinToken != "" && st.JellyfinUserID != "" {
		jf = jellyfin.New(st.JellyfinURL, st.JellyfinToken, st.JellyfinUserID)
	}
	out := make([]ItemDTO, 0, len(items))
	for _, it := range items {
		if q != "" && !strings.Contains(strings.ToLower(it.Title), q) {
			continue
		}
		out = append(out, dtoFromItem(it, jf))
	}
	return c.JSON(out)
}

/* ─── review ─── */

func (s *Server) review(c *fiber.Ctx) error {
	var req ReviewRequest
	if err := json.Unmarshal(c.Body(), &req); err != nil {
		return jsonError(c, 400, err)
	}
	var status string
	switch req.Decision {
	case "keep":
		status = "kept"
	case "mark":
		status = "marked"
	default:
		return jsonError(c, 400, errors.New("decision must be keep|mark"))
	}
	if err := db.SetStatus(s.DB, req.ItemID, status); err != nil {
		return jsonError(c, 500, err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (s *Server) undoReview(c *fiber.Ctx) error {
	id, err := db.UndoLastDecision(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}
	if id == 0 {
		return c.JSON(fiber.Map{"ok": false, "itemId": nil})
	}
	return c.JSON(fiber.Map{"ok": true, "itemId": id})
}

func (s *Server) clearReview(c *fiber.Ctx) error {
	n, err := db.ResetAllToPending(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}
	return c.JSON(fiber.Map{"ok": true, "reset": n})
}

/* ─── tray ─── */

func (s *Server) tray(c *fiber.Ctx) error {
	items, err := db.ListMarked(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}
	st, _ := db.LoadSettings(s.DB)
	var jf *jellyfin.Client
	if st.JellyfinToken != "" && st.JellyfinUserID != "" {
		jf = jellyfin.New(st.JellyfinURL, st.JellyfinToken, st.JellyfinUserID)
	}
	out := make([]ItemDTO, 0, len(items))
	for _, it := range items {
		out = append(out, dtoFromItem(it, jf))
	}
	return c.JSON(out)
}

func (s *Server) spare(c *fiber.Ctx) error {
	var id int64
	if _, err := fmt.Sscanf(c.Params("id"), "%d", &id); err != nil {
		return jsonError(c, 400, err)
	}
	if err := db.SetStatus(s.DB, id, "pending"); err != nil {
		return jsonError(c, 500, err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (s *Server) resetTray(c *fiber.Ctx) error {
	n, err := db.ResetMarkedToPending(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}
	return c.JSON(fiber.Map{"ok": true, "reset": n})
}

func (s *Server) commitTray(c *fiber.Ctx) error {
	st, err := db.LoadSettings(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}
	if st.JellyfinToken == "" || st.JellyfinUserID == "" {
		return jsonError(c, 400, errors.New("jellyfin not authenticated"))
	}
	items, err := db.ListMarked(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}

	jf := jellyfin.New(st.JellyfinURL, st.JellyfinToken, st.JellyfinUserID)
	var rc *radarr.Client
	if st.RadarrURL != "" && st.RadarrAPIKey != "" {
		rc = radarr.New(st.RadarrURL, st.RadarrAPIKey)
	}
	var sc *sonarr.Client
	if st.SonarrURL != "" && st.SonarrAPIKey != "" {
		sc = sonarr.New(st.SonarrURL, st.SonarrAPIKey)
	}

	results := make([]DeletionResultDTO, 0, len(items))
	for _, it := range items {
		r := DeletionResultDTO{
			ItemID:    it.ID,
			Title:     it.Title,
			SizeBytes: it.SizeBytes,
			RadarrID:  it.RadarrID,
			SonarrID:  it.SonarrID,
		}
		var errs []string

		// Step 1: Jellyfin (this also removes the file on disk if Jellyfin manages it).
		if err := jf.DeleteItem(c.Context(), it.JellyfinID); err != nil {
			errs = append(errs, "jellyfin: "+err.Error())
		} else {
			r.JellyfinOK = true
		}

		// Step 2: Radarr / Sonarr cleanup. We proceed regardless of Jellyfin result —
		// if Jellyfin deletion failed but Radarr still has a stale record, we don't want
		// to make recovery harder, but we DO want to know.
		if it.Source == "movie" && rc != nil && it.RadarrID != nil {
			if err := rc.DeleteMovie(c.Context(), *it.RadarrID, true); err != nil {
				errs = append(errs, "radarr: "+err.Error())
			} else {
				r.RadarrOK = true
			}
		} else if it.Source == "movie" && it.RadarrID == nil {
			// no-op: not in Radarr. Treat as "OK" so the pill shows green/skipped.
			r.RadarrOK = rc == nil // only mark OK if Radarr isn't even configured
		}
		if it.Source == "tv" && sc != nil && it.SonarrID != nil {
			if err := sc.DeleteSeries(c.Context(), *it.SonarrID, true); err != nil {
				errs = append(errs, "sonarr: "+err.Error())
			} else {
				r.SonarrOK = true
			}
		} else if it.Source == "tv" && it.SonarrID == nil {
			r.SonarrOK = sc == nil
		}

		// Persist log
		var errPtr *string
		if len(errs) > 0 {
			e := strings.Join(errs, " · ")
			errPtr = &e
			r.Error = errPtr
		}
		_ = db.WriteDeletionLog(s.DB, db.DeletionLog{
			ItemID:     it.ID,
			Title:      it.Title,
			Source:     it.Source,
			SizeBytes:  it.SizeBytes,
			JellyfinOK: r.JellyfinOK,
			RadarrOK:   r.RadarrOK,
			SonarrOK:   r.SonarrOK,
			Error:      errPtr,
		})

		// Update item: if jellyfin succeeded, mark deleted; else leave marked (so user can retry).
		if r.JellyfinOK {
			_ = db.SetStatus(s.DB, it.ID, "deleted")
		}
		results = append(results, r)
	}
	return c.JSON(fiber.Map{"results": results})
}

/* ─── stats ─── */

func (s *Server) stats(c *fiber.Ctx) error {
	counts, bytes, err := db.CountByStatus(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}
	life, err := db.GetLifetimeStats(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}
	srcCounts, srcBytes, err := db.CountBySource(s.DB)
	if err != nil {
		return jsonError(c, 500, err)
	}
	return c.JSON(StatsDTO{
		LibraryTotal:           counts["pending"] + counts["kept"] + counts["marked"],
		ReviewedSession:        counts["kept"] + counts["marked"],
		TrayCount:              counts["marked"],
		TrayBytes:              bytes["marked"],
		LifetimeDeleted:        life.DeletedCount,
		LifetimeReclaimedBytes: life.ReclaimedBytes,
		MovieCount:             srcCounts["movie"],
		MovieBytes:             srcBytes["movie"],
		TVCount:                srcCounts["tv"],
		TVBytes:                srcBytes["tv"],
	})
}

/* ─── tiny helpers ─── */

func jsonError(c *fiber.Ctx, code int, err error) error {
	return c.Status(code).JSON(fiber.Map{"error": err.Error()})
}

func asString(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprint(v)
}

func asInt(v any) int {
	switch x := v.(type) {
	case int:
		return x
	case int64:
		return int(x)
	case float64:
		return int(x)
	case string:
		var n int
		fmt.Sscanf(x, "%d", &n)
		return n
	}
	return 0
}

func asBool(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case string:
		return x == "true" || x == "1"
	case float64:
		return x != 0
	}
	return false
}

func boolStr(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

func pickStr(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func hasAny(m map[string]string, keys ...string) bool {
	for _, k := range keys {
		if _, ok := m[k]; ok {
			return true
		}
	}
	return false
}
