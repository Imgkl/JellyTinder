# syntax=docker/dockerfile:1.7

# ─── 1. Frontend (Node + pnpm → Vite build) ─────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /app
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi
COPY frontend/ ./
RUN pnpm build

# ─── 2. Backend (Go + embedded frontend → static binary) ────────────────────
FROM golang:1.23-alpine AS api
WORKDIR /src
COPY backend/go.mod backend/go.sum* ./
RUN go mod download || true
COPY backend/ ./
# Swap placeholder public/ for the real Vite build so go:embed picks it up.
RUN rm -rf ./public && mkdir -p ./public
COPY --from=web /app/dist/. ./public/
# Pure-Go SQLite via modernc.org/sqlite — no CGO, static binary.
ENV CGO_ENABLED=0
RUN go mod tidy && go build -ldflags="-s -w" -o /out/jellytinder .

# ─── 3. Runtime (distroless static) ─────────────────────────────────────────
FROM gcr.io/distroless/static-debian12
WORKDIR /
COPY --from=api /out/jellytinder /jellytinder
ENV PORT=3243 DATA_DIR=/app/data
EXPOSE 3243
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["/jellytinder", "healthcheck"]
ENTRYPOINT ["/jellytinder"]
