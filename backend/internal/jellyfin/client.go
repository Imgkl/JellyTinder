package jellyfin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const clientID = "JellyTinder"
const clientVersion = "0.1.0"

type Client struct {
	baseURL string
	token   string
	userID  string
	http    *http.Client
}

func New(baseURL, token, userID string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		userID:  userID,
		http:    &http.Client{Timeout: 60 * time.Second},
	}
}

func (c *Client) UserID() string { return c.userID }

type AuthResult struct {
	AccessToken string
	UserID      string
	ServerName  string
	Version     string
}

// AuthenticateByName performs the password flow and returns a long-lived token.
// We store the token in settings and reuse it on subsequent calls.
func AuthenticateByName(ctx context.Context, baseURL, username, password string) (AuthResult, error) {
	body, _ := json.Marshal(map[string]string{
		"Username": username,
		"Pw":       password,
	})
	req, err := http.NewRequestWithContext(ctx, "POST",
		strings.TrimRight(baseURL, "/")+"/Users/AuthenticateByName",
		bytes.NewReader(body),
	)
	if err != nil {
		return AuthResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	// Jellyfin requires a MediaBrowser auth header even pre-token.
	req.Header.Set("Authorization", fmt.Sprintf(
		`MediaBrowser Client="%s", Device="JellyTinder", DeviceId="jellytinder-server", Version="%s"`,
		clientID, clientVersion,
	))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return AuthResult{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return AuthResult{}, fmt.Errorf("auth %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var data struct {
		AccessToken string `json:"AccessToken"`
		User        struct {
			ID string `json:"Id"`
		} `json:"User"`
		ServerID string `json:"ServerId"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return AuthResult{}, err
	}
	if data.AccessToken == "" || data.User.ID == "" {
		return AuthResult{}, errors.New("auth response missing token/user")
	}

	// Probe /System/Info/Public for server version (no auth required).
	ver, name := serverInfo(ctx, baseURL)
	return AuthResult{
		AccessToken: data.AccessToken,
		UserID:      data.User.ID,
		Version:     ver,
		ServerName:  name,
	}, nil
}

func serverInfo(ctx context.Context, baseURL string) (version, name string) {
	req, err := http.NewRequestWithContext(ctx, "GET", strings.TrimRight(baseURL, "/")+"/System/Info/Public", nil)
	if err != nil {
		return "", ""
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", ""
	}
	var info struct {
		Version    string `json:"Version"`
		ServerName string `json:"ServerName"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err == nil {
		return info.Version, info.ServerName
	}
	return "", ""
}

func (c *Client) auth(req *http.Request) {
	req.Header.Set("X-Emby-Token", c.token)
	req.Header.Set("Authorization", fmt.Sprintf(
		`MediaBrowser Client="%s", Device="JellyTinder", DeviceId="jellytinder-server", Version="%s", Token="%s"`,
		clientID, clientVersion, c.token,
	))
}

func (c *Client) do(ctx context.Context, method, path string, q url.Values, body []byte) ([]byte, int, error) {
	full := c.baseURL + path
	if q != nil {
		full += "?" + q.Encode()
	}
	var rdr io.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, full, rdr)
	if err != nil {
		return nil, 0, err
	}
	c.auth(req)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	if resp.StatusCode >= 400 {
		return data, resp.StatusCode, fmt.Errorf("jellyfin %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	return data, resp.StatusCode, nil
}

type Item struct {
	ID              string
	Name            string
	Type            string // "Movie" or "Series"
	ProductionYear  int
	RunTimeMinutes  int
	SizeBytes       int64
	Path            string
	PosterTag       string
	LastPlayedDate  *time.Time
	SortName        string
	ProviderIDs     map[string]string
}

type itemsResp struct {
	Items []rawItem `json:"Items"`
}

type rawItem struct {
	ID             string         `json:"Id"`
	Name           string         `json:"Name"`
	Type           string         `json:"Type"`
	ProductionYear int            `json:"ProductionYear"`
	RunTimeTicks   int64          `json:"RunTimeTicks"`
	Path           string         `json:"Path"`
	ImageTags      map[string]any `json:"ImageTags"`
	SortName       string         `json:"SortName"`
	ProviderIds    map[string]string `json:"ProviderIds"`
	UserData       struct {
		LastPlayedDate string `json:"LastPlayedDate"`
		Played         bool   `json:"Played"`
	} `json:"UserData"`
	MediaSources []struct {
		Size int64 `json:"Size"`
	} `json:"MediaSources"`
}

// ListItems pulls Movies and Series for the configured user.
// Pagination handled internally; returns one flat slice.
func (c *Client) ListItems(ctx context.Context, includeMovies, includeTV bool) ([]Item, error) {
	if c.userID == "" {
		return nil, errors.New("jellyfin client missing user id")
	}
	types := []string{}
	if includeMovies {
		types = append(types, "Movie")
	}
	if includeTV {
		types = append(types, "Series")
	}
	if len(types) == 0 {
		return nil, nil
	}

	var all []Item
	startIndex := 0
	const pageSize = 500
	for {
		q := url.Values{}
		q.Set("Recursive", "true")
		q.Set("IncludeItemTypes", strings.Join(types, ","))
		q.Set("Fields", "Path,MediaSources,SortName,ProviderIds,DateLastMediaAdded,ImageTags,UserData,ProductionYear")
		q.Set("EnableImages", "true")
		q.Set("EnableUserData", "true")
		q.Set("SortBy", "SortName")
		q.Set("SortOrder", "Ascending")
		q.Set("Limit", fmt.Sprintf("%d", pageSize))
		q.Set("StartIndex", fmt.Sprintf("%d", startIndex))
		data, _, err := c.do(ctx, "GET", fmt.Sprintf("/Users/%s/Items", c.userID), q, nil)
		if err != nil {
			return nil, err
		}
		var page itemsResp
		if err := json.Unmarshal(data, &page); err != nil {
			return nil, err
		}
		if len(page.Items) == 0 {
			break
		}
		for _, r := range page.Items {
			it := Item{
				ID:             r.ID,
				Name:           r.Name,
				Type:           r.Type,
				ProductionYear: r.ProductionYear,
				RunTimeMinutes: int(r.RunTimeTicks / 600000000), // ticks → min
				Path:           r.Path,
				SortName:       r.SortName,
				ProviderIDs:    r.ProviderIds,
			}
			for _, m := range r.MediaSources {
				if m.Size > it.SizeBytes {
					it.SizeBytes = m.Size
				}
			}
			if tag, ok := r.ImageTags["Primary"]; ok {
				if s, ok := tag.(string); ok {
					it.PosterTag = s
				}
			}
			if r.UserData.LastPlayedDate != "" {
				if t, err := time.Parse(time.RFC3339, r.UserData.LastPlayedDate); err == nil {
					it.LastPlayedDate = &t
				}
			}
			all = append(all, it)
		}
		if len(page.Items) < pageSize {
			break
		}
		startIndex += len(page.Items)
	}
	return all, nil
}

// DeleteItem removes the item from the Jellyfin library and disk.
// Requires the configured user to have administrative delete rights.
func (c *Client) DeleteItem(ctx context.Context, itemID string) error {
	_, _, err := c.do(ctx, "DELETE", "/Items/"+itemID, nil, nil)
	return err
}

// PosterURL builds an unauthenticated thumbnail URL.
// Jellyfin serves /Items/{Id}/Images/Primary publicly with the X-Emby-Token query when needed.
func (c *Client) PosterURL(itemID, tag string) string {
	base := fmt.Sprintf("%s/Items/%s/Images/Primary?fillHeight=540&fillWidth=360&quality=85", c.baseURL, itemID)
	if tag != "" {
		base += "&tag=" + tag
	}
	return base
}
