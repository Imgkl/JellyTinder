import { useEffect, useMemo, useRef, useState } from 'react';
import { api, formatBytes } from '../lib/api';
import type { Batch, Decision, Item, LibraryType, Settings } from '../lib/types';
import { CardStack } from '../components/CardStack';
import { DecisionButtons } from '../components/DecisionButtons';
import { Button, Spinner, Dialog } from '../ui';

interface ReviewViewProps {
  settings: Settings;
  trayCount: number;
  onTrayChanged: () => void;
  onGoTray: () => void;
}

const LS_TYPE = 'jt.review.type';
const LS_BATCH_KEY = 'jt.review.batchKey';

function readPersistedType(fallback: LibraryType): LibraryType {
  try {
    const v = localStorage.getItem(LS_TYPE);
    if (v === 'movie' || v === 'tv') return v;
  } catch { /* localStorage blocked */ }
  return fallback;
}

export function ReviewView({ settings, trayCount, onTrayChanged, onGoTray }: ReviewViewProps) {
  const defaultType: LibraryType = settings.libraryMovies ? 'movie' : 'tv';
  const [type, setType] = useState<LibraryType>(readPersistedType(defaultType));
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchIdx, setBatchIdx] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState(0);
  const [exitDir, setExitDir] = useState<'left' | 'right' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [info, setInfo] = useState<Item | null>(null);
  const exitTimer = useRef<number | null>(null);

  const currentBatch = batches[batchIdx];

  useEffect(() => {
    try { localStorage.setItem(LS_TYPE, type); } catch { /* noop */ }
    loadBatches(type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  /* Pick the first batch with pending work. If the user reviewed up to G-2 last
     session, we resume there instead of bouncing them back to A-1. Prefer the
     persisted batch key when it still has remaining items, otherwise fall back
     to the earliest unfinished batch. */
  function pickResumeIndex(bs: Batch[]): number {
    if (bs.length === 0) return 0;
    let persistedKey: string | null = null;
    try { persistedKey = localStorage.getItem(LS_BATCH_KEY); } catch { /* noop */ }
    if (persistedKey) {
      const i = bs.findIndex((b) => b.key === persistedKey && b.remaining > 0);
      if (i >= 0) return i;
    }
    const firstPending = bs.findIndex((b) => b.remaining > 0);
    return firstPending >= 0 ? firstPending : bs.length - 1;
  }

  async function loadBatches(t: LibraryType) {
    setLoading(true);
    setError(null);
    try {
      const bs = await api.batches(t);
      setBatches(bs);
      if (bs.length === 0) {
        setBatchIdx(0);
        setItems([]);
        return;
      }
      const startIdx = pickResumeIndex(bs);
      setBatchIdx(startIdx);
      if (bs.every((b) => b.remaining === 0)) {
        setItems([]);
      } else {
        await loadBatch(bs[startIdx].key);
      }
    } catch (e) {
      setError(String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadBatch(key: string) {
    setLoading(true);
    try {
      const it = await api.batchItems(key, type);
      setItems(it);
      setCursor(0);
      try { localStorage.setItem(LS_BATCH_KEY, key); } catch { /* noop */ }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  /* Find the next batch index that still has pending items. Pulls a fresh
     batches list so the `remaining` counts are current (we just made a
     decision; the local `batches` array is stale for the batch we just
     finished, and possibly others if Jellyfin/local state changed). */
  async function jumpToNextBatchOrFinish() {
    try {
      const bs = await api.batches(type);
      setBatches(bs);
      const nextIdx = bs.findIndex((b) => b.remaining > 0);
      if (nextIdx === -1) {
        setBatchIdx(bs.length > 0 ? bs.length - 1 : 0);
        setItems([]);
      } else {
        setBatchIdx(nextIdx);
        await loadBatch(bs[nextIdx].key);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function doSync() {
    setSyncing(true);
    setError(null);
    try {
      await api.sync();
      await loadBatches(type);
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  function commit(decision: Decision) {
    if (loading) return;
    const item = items[cursor];
    if (!item) return;

    // Stamp the exit direction first — AnimatePresence reads it on the very next render.
    setExitDir(decision === 'mark' ? 'left' : 'right');

    api.review(item.id, decision).catch((e) => setError(String(e)));

    // Advance cursor immediately. The leaving card is removed from the visible
    // slice in this same render; AnimatePresence picks it up via its `exit`
    // prop and animates it off. The next card (stable key) animates from
    // behind-slot to top-slot via the SwipeCard outer motion layer.
    const next = cursor + 1;
    if (next >= items.length) {
      // Batch exhausted — re-fetch and jump to the next batch with remaining items.
      // Re-fetching also keeps batch totals/remainings accurate for the progress bar.
      jumpToNextBatchOrFinish();
    } else {
      setCursor(next);
    }
    onTrayChanged();

    // Clear the exit-direction stamp after the animation finishes, so a future
    // commit on a brand-new card doesn't inherit a stale direction.
    if (exitTimer.current) window.clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(() => setExitDir(null), 380);
  }

  async function undo() {
    try {
      const res = await api.undo();
      if (res.ok) {
        // simplest: reload the current batch
        if (currentBatch) await loadBatch(currentBatch.key);
        onTrayChanged();
      }
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === ' ') {
        e.preventDefault();
        // Toggle: open if closed, close if open.
        if (info) setInfo(null);
        else if (items[cursor]) setInfo(items[cursor]);
        return;
      }
      if (e.key === 'Escape' && info) {
        setInfo(null);
        return;
      }
      if (info) return; // other keys disabled while dialog is up
      if (e.key === 'ArrowLeft') commit('mark');
      else if (e.key === 'ArrowRight') commit('keep');
      else if (e.key === 'u' || e.key === 'U') undo();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const totalInBatch = currentBatch?.total ?? 0;
  const remainingAtLoad = currentBatch?.remaining ?? items.length;
  // Reviewed = (everything already decided before this load) + (cards swiped this session)
  const reviewedInBatch = Math.max(0, totalInBatch - remainingAtLoad) + cursor;
  const progressPct = useMemo(
    () => (totalInBatch > 0 ? Math.round((reviewedInBatch / totalInBatch) * 100) : 0),
    [reviewedInBatch, totalInBatch]
  );

  const showMovies = settings.libraryMovies;
  const showTv = settings.libraryTv;
  const noLibrary = !showMovies && !showTv;
  const empty = !loading && items.length === 0;
  // Differentiate "library has zero rows" (need sync) from "every row reviewed" (done).
  const hasAnyBatches = batches.length > 0;
  const allReviewed = hasAnyBatches && batches.every((b) => b.remaining === 0);

  return (
    <div className="flex flex-col px-6 lg:px-8 pt-9 pb-32 min-h-[calc(100vh-60px)] lg:min-h-screen">

      {/* top bar */}
      <div className="flex flex-wrap justify-between items-end gap-6 border-b border-border pb-4 mb-9">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted font-medium">Library</span>
          <div className="flex border border-border">
            {showMovies && (
              <button
                onClick={() => setType('movie')}
                className={`px-3.5 py-2 text-[10.5px] uppercase tracking-[0.2em] border-r border-border ${
                  type === 'movie' ? 'bg-text text-bg' : 'text-muted hover:text-text'
                }`}
              >
                Movies
              </button>
            )}
            {showTv && (
              <button
                onClick={() => setType('tv')}
                className={`px-3.5 py-2 text-[10.5px] uppercase tracking-[0.2em] ${
                  type === 'tv' ? 'bg-text text-bg' : 'text-muted hover:text-text'
                }`}
              >
                TV
              </button>
            )}
          </div>
        </div>

        {!allReviewed && (
          <div className="flex flex-col items-end gap-1.5">
            <span className="font-serif italic text-[22px] tracking-[0.01em]">
              {currentBatch ? `⟨ Batch ${currentBatch.letter} · page ${currentBatch.page} ⟩` : '—'}
            </span>
            <span className="text-[10.5px] uppercase tracking-[0.22em] text-muted">
              {currentBatch
                ? `${reviewedInBatch} of ${totalInBatch} reviewed · batch ${batchIdx + 1}/${batches.length}`
                : 'No batches yet'}
            </span>
            <div className="h-[2px] bg-border w-[240px] relative overflow-hidden mt-1">
              <div className="absolute inset-y-0 left-0 bg-text transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* stage */}
      <div className="relative flex-1 grid place-items-center min-h-[680px] pb-12">
        {loading && (
          <div className="flex flex-col items-center gap-3 text-muted">
            <Spinner size={20} />
            <span className="text-[10.5px] uppercase tracking-[0.22em]">Loading</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <span className="text-[10.5px] uppercase tracking-[0.22em] text-danger">Error</span>
            <p className="text-text-dim text-sm">{error}</p>
            <Button variant="line" size="sm" onClick={() => loadBatches(type)}>
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && noLibrary && (
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <span className="text-[10.5px] uppercase tracking-[0.22em] text-muted">Nothing to review</span>
            <p className="text-text-dim text-sm">Enable Movies or TV in Settings.</p>
          </div>
        )}

        {!loading && !error && !noLibrary && empty && allReviewed && (
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <span className="text-[10.5px] uppercase tracking-[0.22em] text-muted">All done</span>
            <p className="font-serif italic text-3xl">You've reviewed every {type === 'tv' ? 'series' : 'movie'}.</p>
            <p className="text-text-dim text-sm">
              {trayCount > 0
                ? `${trayCount} marked for delete — open the tray to finish the cascade, or sync again if you've added new titles.`
                : 'Nothing left in the queue. Sync again if you\'ve added new titles to Jellyfin.'}
            </p>
            <div className="flex gap-2.5 pt-1">
              {trayCount > 0 && <Button onClick={onGoTray}>Open tray ▸</Button>}
              <Button variant="line" onClick={doSync} disabled={syncing}>
                {syncing ? 'Syncing…' : 'Sync again'}
              </Button>
            </div>
          </div>
        )}

        {!loading && !error && !noLibrary && empty && !allReviewed && (
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <span className="text-[10.5px] uppercase tracking-[0.22em] text-muted">Inbox empty</span>
            <p className="text-text-dim text-sm">
              Pull your library from Jellyfin to start swiping.
            </p>
            <Button onClick={doSync} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync library'}
            </Button>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <CardStack items={items} cursor={cursor} exitDir={exitDir} onDecide={commit} />
        )}
      </div>

      {/* controls */}
      {items.length > 0 && (
        <div className="my-9">
          <DecisionButtons
            onDrop={() => commit('mark')}
            onKeep={() => commit('keep')}
            onInfo={() => {
              if (!items[cursor]) return;
              setInfo(items[cursor]);
              // Drop focus so subsequent spacebar presses route to the window
              // keydown handler (toggle/close) instead of re-clicking this button.
              (document.activeElement as HTMLElement | null)?.blur();
            }}
            disabled={loading || !items[cursor]}
          />
        </div>
      )}

      {/* bottom bar */}
      <div className="flex justify-between items-center pt-4 border-t border-border gap-3 flex-wrap text-[10.5px] uppercase tracking-[0.22em] text-muted">
        <span className="flex flex-wrap gap-2.5">
          <span>← drop</span><span className="text-border">·</span>
          <span>keep →</span><span className="text-border">·</span>
          <span>space info</span><span className="text-border">·</span>
          <span>u undo</span>
        </span>
        <button
          onClick={onGoTray}
          className="inline-flex items-center gap-2 border border-border px-3 py-1.5 text-text hover:border-text transition-colors"
        >
          <span>Marked tray</span>
          <span className="bg-text text-bg px-1.5 text-[10px]">{trayCount}</span>
        </button>
      </div>

      {/* info dialog */}
      <Dialog open={!!info} onClose={() => setInfo(null)} title={info?.title} size="md" closeOnSpace>
        {info && (
          <div className="flex flex-col gap-4 text-sm">
            <Row k="Source">{info.source.toUpperCase()}</Row>
            <Row k="Year">{info.year ?? '—'}</Row>
            <Row k="Runtime">{info.runtimeMin ? `${info.runtimeMin} min` : '—'}</Row>
            <Row k="Size">{formatBytes(info.sizeBytes)}</Row>
            <Row k="Path"><code className="font-mono text-xs break-all">{info.path || '—'}</code></Row>
            <Row k="Last watched">{info.watchedAt ? new Date(info.watchedAt).toLocaleDateString() : '—'}</Row>
            <Row k="Jellyfin ID"><code className="font-mono text-xs break-all">{info.jellyfinId}</code></Row>
            {info.radarrId && <Row k="Radarr ID">{info.radarrId}</Row>}
            {info.sonarrId && <Row k="Sonarr ID">{info.sonarrId}</Row>}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-baseline border-b border-border pb-3">
      <span className="text-[10px] uppercase tracking-[0.22em] text-muted">{k}</span>
      <span className="text-text-dim">{children}</span>
    </div>
  );
}
