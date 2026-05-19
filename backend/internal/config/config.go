package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	Port    string
	DataDir string
}

func Load() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3243"
	}
	dir := os.Getenv("DATA_DIR")
	if dir == "" {
		dir = filepath.Join(".", "data")
	}
	return Config{Port: port, DataDir: dir}
}
