package batch

import (
	"fmt"
	"strings"
	"unicode"

	"github.com/gokul/jellytinder/internal/db"
)

type Batch struct {
	Key       string `json:"key"`
	Letter    string `json:"letter"`
	Page      int    `json:"page"`
	Total     int    `json:"total"`
	Remaining int    `json:"remaining"`
}

// Compute splits items into batches. Two strategies:
//   - "alpha": group by first alphanumeric character of sort title, then page within each
//   - "fixed": ignore letters, page by N
//
// `items` should be ALL live items (pending + kept + marked) so `total` is stable
// across the user's session. `remaining` counts the pending subset of each batch
// so the progress bar can persist across refreshes.
func Compute(items []db.Item, strategy string, maxSize int) []Batch {
	if maxSize <= 0 {
		maxSize = 25
	}
	if strategy == "fixed" {
		return computeFixed(items, maxSize)
	}
	return computeAlpha(items, maxSize)
}

func pendingCount(items []db.Item) int {
	n := 0
	for _, it := range items {
		if it.Status == "pending" {
			n++
		}
	}
	return n
}

func computeAlpha(items []db.Item, maxSize int) []Batch {
	groups := map[string][]db.Item{}
	order := []string{}
	for _, it := range items {
		l := bucketLetter(it.SortTitle)
		if _, ok := groups[l]; !ok {
			order = append(order, l)
		}
		groups[l] = append(groups[l], it)
	}
	// Letters come pre-sorted because SortTitle is the secondary sort key,
	// but normalize: A-Z, then digits "#", then misc "…".
	out := []Batch{}
	for _, letter := range sortedLetters(order) {
		grp := groups[letter]
		pages := (len(grp) + maxSize - 1) / maxSize
		for page := 0; page < pages; page++ {
			lo := page * maxSize
			hi := lo + maxSize
			if hi > len(grp) {
				hi = len(grp)
			}
			slice := grp[lo:hi]
			out = append(out, Batch{
				Key:       fmt.Sprintf("%s-%d", letter, page+1),
				Letter:    letter,
				Page:      page + 1,
				Total:     hi - lo,
				Remaining: pendingCount(slice),
			})
		}
	}
	return out
}

func computeFixed(items []db.Item, maxSize int) []Batch {
	pages := (len(items) + maxSize - 1) / maxSize
	out := []Batch{}
	for page := 0; page < pages; page++ {
		lo := page * maxSize
		hi := lo + maxSize
		if hi > len(items) {
			hi = len(items)
		}
		slice := items[lo:hi]
		out = append(out, Batch{
			Key:       fmt.Sprintf("P-%d", page+1),
			Letter:    "P",
			Page:      page + 1,
			Total:     hi - lo,
			Remaining: pendingCount(slice),
		})
	}
	return out
}

// SliceItems returns the PENDING items belonging to a batch key — i.e. the cards
// the user still needs to swipe. Already-decided items in the bucket are filtered
// out so the user resumes mid-batch without re-seeing what they already kept/marked.
func SliceItems(items []db.Item, strategy string, maxSize int, key string) []db.Item {
	if maxSize <= 0 {
		maxSize = 25
	}
	if strategy == "fixed" {
		var page int
		if _, err := fmt.Sscanf(key, "P-%d", &page); err != nil || page < 1 {
			return nil
		}
		lo := (page - 1) * maxSize
		hi := lo + maxSize
		if lo >= len(items) {
			return nil
		}
		if hi > len(items) {
			hi = len(items)
		}
		return filterPending(items[lo:hi])
	}
	// alpha
	parts := strings.SplitN(key, "-", 2)
	if len(parts) != 2 {
		return nil
	}
	letter := parts[0]
	var page int
	if _, err := fmt.Sscanf(parts[1], "%d", &page); err != nil || page < 1 {
		return nil
	}
	grp := []db.Item{}
	for _, it := range items {
		if bucketLetter(it.SortTitle) == letter {
			grp = append(grp, it)
		}
	}
	lo := (page - 1) * maxSize
	hi := lo + maxSize
	if lo >= len(grp) {
		return nil
	}
	if hi > len(grp) {
		hi = len(grp)
	}
	return filterPending(grp[lo:hi])
}

func filterPending(in []db.Item) []db.Item {
	out := make([]db.Item, 0, len(in))
	for _, it := range in {
		if it.Status == "pending" {
			out = append(out, it)
		}
	}
	return out
}

func bucketLetter(s string) string {
	for _, r := range s {
		if unicode.IsLetter(r) {
			return strings.ToUpper(string(r))
		}
		if unicode.IsDigit(r) {
			return "#"
		}
	}
	return "…"
}

func sortedLetters(in []string) []string {
	seen := map[string]bool{}
	letters := []string{}
	hash := false
	misc := false
	for _, l := range in {
		if l == "#" {
			hash = true
			continue
		}
		if l == "…" {
			misc = true
			continue
		}
		if !seen[l] {
			seen[l] = true
			letters = append(letters, l)
		}
	}
	// alphabetical A→Z
	for i := 0; i < len(letters); i++ {
		for j := i + 1; j < len(letters); j++ {
			if letters[j] < letters[i] {
				letters[i], letters[j] = letters[j], letters[i]
			}
		}
	}
	out := []string{}
	out = append(out, letters...)
	if hash {
		out = append(out, "#")
	}
	if misc {
		out = append(out, "…")
	}
	return out
}

// SortTitleFor mirrors Jellyfin's "The Matrix" → "Matrix, The" idea but simpler:
// strip leading articles, lowercase for sort comparison.
func SortTitleFor(title string) string {
	t := strings.TrimSpace(title)
	low := strings.ToLower(t)
	for _, prefix := range []string{"the ", "a ", "an "} {
		if strings.HasPrefix(low, prefix) {
			return t[len(prefix):]
		}
	}
	return t
}
