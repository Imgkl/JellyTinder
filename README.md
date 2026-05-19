# JellyTinder

Tinder-style review pass for your Jellyfin library. Swipe right to keep, left to mark
for delete. Confirm the tray and the file is removed from disk, Radarr, and Sonarr in
one cascade.

Sibling app to **nocturne-web** — same editorial-brutalist palette, zero-radius
typography, marching-ants hover. Single Go binary serves the React frontend; SQLite
state at `/app/data`.

## Run with Docker (recommended)

```bash
docker compose up --build
# → http://localhost:3243
```

State lives under `./data/jellytinder.sqlite`. Restart safe.

## Local dev

Two terminals:

```bash
# 1. Backend
cd backend
go run .
# → :3243 (proxies REST + serves embedded public/)

# 2. Frontend (Vite proxies /api → :3243)
cd frontend
pnpm install
pnpm dev
# → :5173
```

Then open <http://localhost:5173>.

## Workflow

1. **Onboarding** — enter Jellyfin URL + creds, then Radarr + Sonarr (skippable).
2. **Sync** — pulls movies and TV from Jellyfin, cross-references Radarr/Sonarr IDs by
   TMDB/TVDB.
3. **Review pass** — swipe through alphabet-bucketed batches. `←` mark for delete,
   `→` keep, `space` info, `u` undo.
4. **Marked tray** — second pass over the marked subset. Spare anything you weren't
   sure about (×). Optional "Review again" loop.
5. **Cascade delete** — single confirm. Per item:
   - `DELETE /Items/{id}` on Jellyfin (removes file).
   - `DELETE /api/v3/movie/{id}?deleteFiles=true` on Radarr (movies).
   - `DELETE /api/v3/series/{id}?deleteFiles=true` on Sonarr (TV).
   Each step logged independently — partial failures show as red pills in the result
   dialog, never silently roll back a successful disk delete.

## Architecture

```
React 19 + Vite + Tailwind 4 + framer-motion
            │
            ▼  /api/v1 (same-origin)
Go 1.23 + Fiber v2 + modernc.org/sqlite (pure Go)
            │
            ├── Jellyfin (auth + list + delete)
            ├── Radarr v3 (DELETE /movie/{id})
            └── Sonarr v3 (DELETE /series/{id})
```

Frontend ships in the binary via `//go:embed`. Distroless static runtime image.

## Settings

- Connections: Jellyfin / Radarr / Sonarr URLs + creds. Status pill per service.
- Batching: A-Z grouping (default) or fixed N pages. Configurable `maxBatchSize`.
- Library focus: toggle Movies / TV.
- Hide watched: skip already-watched items.
- Stats: library total, session reviews, tray size, lifetime reclaim.

## License

MIT.
