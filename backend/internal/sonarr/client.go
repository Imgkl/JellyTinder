package sonarr

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

func New(baseURL, apiKey string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

type SystemStatus struct {
	Version string `json:"version"`
	Branch  string `json:"branch"`
	AppName string `json:"appName"`
}

type Series struct {
	ID     int64  `json:"id"`
	Title  string `json:"title"`
	Year   int    `json:"year"`
	TvdbID int    `json:"tvdbId"`
	ImdbID string `json:"imdbId"`
	Path   string `json:"path"`
}

func (c *Client) do(ctx context.Context, method, path string, q url.Values, body []byte) ([]byte, error) {
	full := c.baseURL + path
	if q == nil {
		q = url.Values{}
	}
	q.Set("apikey", c.apiKey)
	full += "?" + q.Encode()
	var rdr io.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, full, rdr)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Api-Key", c.apiKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return data, fmt.Errorf("sonarr %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	return data, nil
}

func (c *Client) Status(ctx context.Context) (SystemStatus, error) {
	data, err := c.do(ctx, "GET", "/api/v3/system/status", nil, nil)
	if err != nil {
		return SystemStatus{}, err
	}
	var s SystemStatus
	if err := json.Unmarshal(data, &s); err != nil {
		return SystemStatus{}, err
	}
	return s, nil
}

func (c *Client) AllSeries(ctx context.Context) ([]Series, error) {
	data, err := c.do(ctx, "GET", "/api/v3/series", nil, nil)
	if err != nil {
		return nil, err
	}
	var ss []Series
	if err := json.Unmarshal(data, &ss); err != nil {
		return nil, err
	}
	return ss, nil
}

func (c *Client) DeleteSeries(ctx context.Context, id int64, deleteFiles bool) error {
	q := url.Values{}
	q.Set("deleteFiles", fmt.Sprintf("%t", deleteFiles))
	q.Set("addImportListExclusion", "false")
	_, err := c.do(ctx, "DELETE", fmt.Sprintf("/api/v3/series/%d", id), q, nil)
	return err
}
