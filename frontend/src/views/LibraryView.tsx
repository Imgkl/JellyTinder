import { useEffect, useMemo, useState } from 'react';
import { api, formatBytes } from '../lib/api';
import type { Item } from '../lib/types';
import { Button, Chip, Dialog, Spinner } from '../ui';

interface LibraryViewProps {
  onTrayChanged: () => void;
  onGoTray: () => void;
}

type SourceFilter = '' | 'movie' | 'tv';
type StatusFilter = 'live' | 'all' | 'pending' | 'kept' | 'marked';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'live', label: 'All live' },
  { key: 'pending', label: 'Pending' },
  { key: 'kept', label: 'Kept' },
  { key: 'marked', label: 'Marked' },
  { key: 'all', label: 'Everything' },
];

export function LibraryView({ onTrayChanged, onGoTray }: LibraryViewProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [source, setSource] = useState<SourceFilter>('');
  const [status, setStatus] = useState<StatusFilter>('live');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Item | null>(null);
  const [acting, setActing] = useState(false);
  const [markMode, setMarkMode] = useState(false);

  // Esc exits mark-mode (and also closes the detail dialog if it's open — handled by Dialog).
  useEffect(() => {
    if (!markMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMarkMode(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [markMode]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.items({ source, status, q });
      setItems(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(load, q ? 200 : 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, status, q]);

  const counts = useMemo(() => {
    const totalBytes = items.reduce((s, i) => s + (i.sizeBytes || 0), 0);
    const markedBytes = items.filter((i) => i.status === 'marked').reduce((s, i) => s + (i.sizeBytes || 0), 0);
    return { totalBytes, markedBytes };
  }, [items]);

  async function setItemStatus(item: Item, decision: 'keep' | 'mark' | 'spare') {
    setActing(true);
    try {
      if (decision === 'spare') {
        await api.spare(item.id);
      } else {
        await api.review(item.id, decision);
      }
      // Optimistic local update so the grid reflects the change without a full reload
      setItems((cur) =>
        cur.map((i) =>
          i.id === item.id
            ? { ...i, status: decision === 'mark' ? 'marked' : decision === 'keep' ? 'kept' : 'pending' }
            : i
        )
      );
      setDetail((d) => (d && d.id === item.id ? { ...d, status: decision === 'mark' ? 'marked' : decision === 'keep' ? 'kept' : 'pending' } : d));
      onTrayChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="px-6 lg:px-8 pt-9 pb-32">
      {/* head */}
      <div className="flex flex-wrap justify-between items-end gap-6 border-b border-border pb-4 mb-7">
        <div>
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted font-medium">Catalog</span>
          <h2 className="font-serif italic text-[46px] tracking-[0.005em] leading-none mt-1.5">Library.</h2>
        </div>
        <div className="text-[10.5px] uppercase tracking-[0.22em] text-muted text-right leading-[1.85]">
          <div><b className="font-serif italic text-[18px] text-text not-italic tracking-[0.01em]">{items.length.toLocaleString()}</b> titles</div>
          <div><b className="font-serif italic text-[18px] text-text not-italic tracking-[0.01em]">{formatBytes(counts.totalBytes)}</b> on disk</div>
          {counts.markedBytes > 0 && (
            <div className="text-danger"><b className="font-serif italic text-[14px] not-italic tracking-[0.01em]">{formatBytes(counts.markedBytes)}</b> marked</div>
          )}
        </div>
      </div>

      {/* filters — sticky so the mark-mode toggle stays in reach while scrolling */}
      <div className={`sticky top-0 z-20 bg-bg/95 backdrop-blur-sm -mx-6 lg:-mx-8 px-6 lg:px-8 pt-3 pb-4 mb-6 border-b transition-colors ${markMode ? 'border-danger' : 'border-border'}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex border border-border">
            <button
              onClick={() => setSource('')}
              className={`px-3.5 py-2 text-[10.5px] uppercase tracking-[0.2em] border-r border-border ${source === '' ? 'bg-text text-bg' : 'text-muted hover:text-text'}`}
            >All</button>
            <button
              onClick={() => setSource('movie')}
              className={`px-3.5 py-2 text-[10.5px] uppercase tracking-[0.2em] border-r border-border ${source === 'movie' ? 'bg-text text-bg' : 'text-muted hover:text-text'}`}
            >Movies</button>
            <button
              onClick={() => setSource('tv')}
              className={`px-3.5 py-2 text-[10.5px] uppercase tracking-[0.2em] ${source === 'tv' ? 'bg-text text-bg' : 'text-muted hover:text-text'}`}
            >TV</button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {STATUS_TABS.map((t) => (
              <Chip key={t.key} active={status === t.key} onClick={() => setStatus(t.key)}>
                {t.label}
              </Chip>
            ))}
          </div>

          <div className="md:w-[220px] flex-1 md:flex-initial">
            <input
              type="text"
              placeholder="Search title…"
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              className="w-full bg-transparent border-0 border-b border-border focus:border-text outline-none text-text placeholder:text-muted text-[13px] py-2 transition-colors"
            />
          </div>

          <button
            onClick={() => setMarkMode((v) => !v)}
            className={`ml-auto inline-flex items-center gap-2 px-3.5 py-2 text-[10.5px] uppercase tracking-[0.18em] font-medium border transition-colors ${
              markMode
                ? 'bg-danger text-bg border-danger'
                : 'bg-transparent text-danger border-danger hover:bg-danger hover:text-bg'
            }`}
            title="Toggle: in this mode, tapping a tile marks it for delete. Esc to exit."
          >
            {markMode ? '● Mark mode · esc' : '✕ Mark for delete'}
          </button>
        </div>

        {markMode && (
          <p className="text-[10.5px] uppercase tracking-[0.22em] text-danger mt-3">
            Tap tiles to add them to the tray. Tap an already-marked tile to spare it. Press <b>Esc</b> to exit.
          </p>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-muted py-12">
          <Spinner /> <span className="text-[10.5px] uppercase tracking-[0.22em]">Loading library</span>
        </div>
      )}

      {!loading && error && <p className="text-danger text-sm mb-6">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-24">
          <p className="font-serif italic text-2xl mb-3">Nothing matches.</p>
          <p className="text-text-dim text-sm">Try a different status filter or clear the search.</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 lg:gap-5">
          {items.map((it) => (
            <LibraryTile
              key={it.id}
              item={it}
              markMode={markMode}
              disabled={acting}
              onClick={() => {
                if (markMode) {
                  setItemStatus(it, it.status === 'marked' ? 'spare' : 'mark');
                } else {
                  setDetail(it);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* detail */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail?.title} size="lg">
        {detail && (
          <div className="flex flex-col md:flex-row gap-6">
            <div className="md:w-[200px] flex-shrink-0">
              <div className="aspect-[2/3] border border-border bg-[#2a2a2a] overflow-hidden">
                {detail.posterUrl ? (
                  <img src={detail.posterUrl} alt={detail.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-surface-2" />
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-3 text-sm">
              <Row k="Source">{detail.source.toUpperCase()}</Row>
              <Row k="Year">{detail.year ?? '—'}</Row>
              <Row k="Runtime">{detail.runtimeMin ? `${detail.runtimeMin} min` : '—'}</Row>
              <Row k="Size">{formatBytes(detail.sizeBytes)}</Row>
              <Row k="Status">
                <StatusPill status={detail.status} />
              </Row>
              <Row k="Path"><code className="font-mono text-[11px] break-all">{detail.path || '—'}</code></Row>
              {detail.watchedAt && (
                <Row k="Last watched">{new Date(detail.watchedAt).toLocaleDateString()}</Row>
              )}

              <div className="flex flex-wrap gap-2.5 mt-4">
                {detail.status !== 'marked' && (
                  <Button variant="destructive" disabled={acting} onClick={() => setItemStatus(detail, 'mark')}>
                    Mark for delete
                  </Button>
                )}
                {detail.status === 'marked' && (
                  <>
                    <Button variant="line" disabled={acting} onClick={() => setItemStatus(detail, 'spare')}>
                      Spare
                    </Button>
                    <Button onClick={onGoTray}>Open tray ▸</Button>
                  </>
                )}
                {detail.status !== 'kept' && detail.status !== 'marked' && (
                  <Button variant="line" disabled={acting} onClick={() => setItemStatus(detail, 'keep')}>
                    Keep
                  </Button>
                )}
                {detail.status === 'kept' && (
                  <Button variant="line" disabled={acting} onClick={() => setItemStatus(detail, 'spare')}>
                    Reset to pending
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

interface LibraryTileProps {
  item: Item;
  markMode: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function LibraryTile({ item, markMode, disabled, onClick }: LibraryTileProps) {
  const isMarked = item.status === 'marked';
  // In mark-mode the hover treatment is destructive (red ring + DROP label) for items not yet marked;
  // for already-marked items the hover offers SPARE.
  const modeRing = markMode
    ? isMarked
      ? 'group-hover:border-text/70'
      : 'group-hover:border-danger'
    : 'group-hover:border-text/40';
  const modeBorder = markMode
    ? isMarked
      ? 'border-danger'
      : 'border-border'
    : 'border-border';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative bg-surface border ${modeBorder} hover:border-border-hover transition-colors flex flex-col text-left cursor-pointer disabled:opacity-60`}
    >
      <div className="aspect-[2/3] relative border-b border-border overflow-hidden bg-[#2a2a2a]">
        {item.posterUrl ? (
          <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div
            className="w-full h-full"
            style={{
              backgroundColor: '#2c2c2c',
              backgroundImage:
                'radial-gradient(circle at 30% 30%, rgba(255,255,255,.16), transparent 55%), radial-gradient(circle at 75% 80%, rgba(0,0,0,.5), transparent 60%)',
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/55 pointer-events-none" />

        {/* status corner badge */}
        <div className="absolute top-2 right-2">
          <StatusPill status={item.status} compact />
        </div>

        {/* hover ring */}
        <div className={`absolute inset-0 pointer-events-none border-2 border-transparent ${modeRing} transition-colors`} />

        {/* mark-mode action label, shown on hover */}
        {markMode && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <span
              className={`font-serif italic text-[28px] px-2.5 py-1 border-2 ${
                isMarked ? 'text-text border-text bg-bg/90' : 'text-danger border-danger bg-bg/90 -rotate-[8deg]'
              }`}
            >
              {isMarked ? 'SPARE' : 'DROP'}
            </span>
          </div>
        )}
      </div>
      <div className="px-3 pt-2.5 pb-3 flex flex-col gap-1.5">
        <div className="font-serif italic text-[16px] leading-[1.1] overflow-hidden text-ellipsis whitespace-nowrap" title={item.title}>
          {item.title}
        </div>
        <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.2em] text-muted">
          <span>{item.year ?? '—'}</span>
          <span className="text-border">·</span>
          <span>{formatBytes(item.sizeBytes)}</span>
        </div>
      </div>
    </button>
  );
}

function StatusPill({ status, compact }: { status: string; compact?: boolean }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-bg/90 text-text border-border' },
    kept: { label: 'Kept', cls: 'bg-bg/90 text-[#137333] border-[#137333]/70' },
    marked: { label: 'Marked', cls: 'bg-danger text-bg border-danger' },
    deleted: { label: 'Deleted', cls: 'bg-text text-bg border-text' },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center border px-1.5 py-0.5 uppercase tracking-[0.18em] font-medium ${compact ? 'text-[8.5px]' : 'text-[9.5px]'} ${s.cls}`}>
      {s.label}
    </span>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-baseline border-b border-border pb-2.5">
      <span className="text-[10px] uppercase tracking-[0.22em] text-muted">{k}</span>
      <span className="text-text-dim">{children}</span>
    </div>
  );
}
