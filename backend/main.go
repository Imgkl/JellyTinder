package main

import (
	"context"
	"embed"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/gokul/jellytinder/internal/config"
	"github.com/gokul/jellytinder/internal/db"
	"github.com/gokul/jellytinder/internal/server"
)

//go:embed all:public
var publicFS embed.FS

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		// /jellytinder healthcheck — used by docker HEALTHCHECK.
		port := os.Getenv("PORT")
		if port == "" {
			port = "3243"
		}
		resp, err := http.Get("http://127.0.0.1:" + port + "/api/v1/health")
		if err != nil || resp.StatusCode != 200 {
			os.Exit(1)
		}
		os.Exit(0)
	}

	cfg := config.Load()
	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		log.Fatalf("mkdir data dir: %v", err)
	}

	conn, err := db.Open(cfg.DataDir)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer conn.Close()
	if err := db.Migrate(conn); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	app := fiber.New(fiber.Config{
		AppName:           "JellyTinder",
		DisableStartupMessage: true,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      120 * time.Second, // cascade delete can be slow
	})
	app.Use(recover.New())
	app.Use(logger.New(logger.Config{
		Format:     "[${time}] ${status} ${method} ${path} (${latency})\n",
		TimeFormat: "15:04:05",
	}))

	server.Mount(app, conn)

	// Static frontend (embedded, with SPA fallback).
	sub, err := fs.Sub(publicFS, "public")
	if err != nil {
		log.Fatalf("embed public: %v", err)
	}
	app.Use("/", staticHandler(sub))
	app.Use(func(c *fiber.Ctx) error {
		if strings.HasPrefix(c.Path(), "/api/") {
			return fiber.ErrNotFound
		}
		// SPA fallback — serve index.html for unknown routes.
		f, err := sub.Open("index.html")
		if err != nil {
			return c.Status(404).SendString("index.html missing — did you build the frontend?")
		}
		defer f.Close()
		data, err := io.ReadAll(f)
		if err != nil {
			return err
		}
		c.Set("Content-Type", "text/html; charset=utf-8")
		return c.Send(data)
	})

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		addr := fmt.Sprintf(":%s", cfg.Port)
		log.Printf("JellyTinder listening on http://0.0.0.0%s", addr)
		if err := app.Listen(addr); err != nil {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down…")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = app.ShutdownWithContext(shutdownCtx)
}

func staticHandler(sub fs.FS) fiber.Handler {
	return func(c *fiber.Ctx) error {
		path := strings.TrimPrefix(c.Path(), "/")
		if path == "" {
			path = "index.html"
		}
		f, err := sub.Open(path)
		if err != nil {
			return c.Next()
		}
		defer f.Close()
		stat, err := f.Stat()
		if err != nil || stat.IsDir() {
			return c.Next()
		}
		data, err := io.ReadAll(f)
		if err != nil {
			return err
		}
		ct := mimeFor(path)
		if ct != "" {
			c.Set("Content-Type", ct)
		}
		// Long-cache for hashed assets; index always re-validated.
		if strings.Contains(path, "/assets/") {
			c.Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			c.Set("Cache-Control", "no-cache")
		}
		return c.Send(data)
	}
}

func mimeFor(p string) string {
	switch {
	case strings.HasSuffix(p, ".html"):
		return "text/html; charset=utf-8"
	case strings.HasSuffix(p, ".js"):
		return "application/javascript; charset=utf-8"
	case strings.HasSuffix(p, ".mjs"):
		return "application/javascript; charset=utf-8"
	case strings.HasSuffix(p, ".css"):
		return "text/css; charset=utf-8"
	case strings.HasSuffix(p, ".json"):
		return "application/json; charset=utf-8"
	case strings.HasSuffix(p, ".svg"):
		return "image/svg+xml"
	case strings.HasSuffix(p, ".png"):
		return "image/png"
	case strings.HasSuffix(p, ".jpg"), strings.HasSuffix(p, ".jpeg"):
		return "image/jpeg"
	case strings.HasSuffix(p, ".webp"):
		return "image/webp"
	case strings.HasSuffix(p, ".woff2"):
		return "font/woff2"
	case strings.HasSuffix(p, ".woff"):
		return "font/woff"
	case strings.HasSuffix(p, ".ico"):
		return "image/x-icon"
	}
	return ""
}
