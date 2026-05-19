import { useEffect, useState } from 'react';
import { api, formatBytes } from '../lib/api';
import type { DeletionResult, Item } from '../lib/types';
import { Button, Dialog, Spinner } from '../ui';

interface TrayViewProps {
  onTrayChanged: () => void;
  onGoReview: () => void;
}

export function TrayView({ onTrayChanged, onGoReview }: TrayViewProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [results, setResults] = useState<DeletionResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.tray());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function spare(id: number) {
    try {
      await api.spare(id);
      setItems((cur) => cur.filter((i) => i.id !== id));
      onTrayChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  async function commit() {
    setCommitting(true);
    setError(null);
    try {
      const res = await api.commitTray();
      setResults(res.results);
      onTrayChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitting(false);
      setConfirming(false);
    }
  }

  const totalBytes = items.reduce((s, i) => s + (i.sizeBytes || 0), 0);

  return (
    <div className="px-6 lg:px-8 pt-9 pb-32">

      {/* head */}
      <div className="flex flex-wrap justify-between items-end gap-6 border-b border-border pb-4 mb-8">
        <div>
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted font-medium">Second pass</span>
          <h2 className="font-serif italic text-[46px] tracking-[0.005em] leading-none mt-1.5">
            Marked for delete.
          </h2>
        </div>
        <div className="text-[10.5px] uppercase tracking-[0.22em] text-muted text-right leading-[1.8]">
          <div><b className="font-serif italic text-[18px] text-text not-italic tracking-[0.01em]">{items.length}</b> titles</div>
          <div><b className="font-serif italic text-[18px] text-text not-italic tracking-[0.01em]">{formatBytes(totalBytes)}</b> reclaimable</div>
          <div className="text-muted">Tap × to spare</div>
        </div>
      </div>

      {/* grid / empty / error */}
      {loading && (
        <div className="flex items-center gap-3 text-muted">
          <Spinner /> <span className="text-[10.5px] uppercase tracking-[0.22em]">Loading tray</span>
        </div>
      )}

      {!loading && error && <p className="text-danger text-sm mb-6">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-24">
          <p className="font-serif italic text-2xl mb-4">Nothing marked yet.</p>
          <p className="text-text-dim text-sm mb-6">
            Swipe left in Review to mark titles for delete; they'll land here for a second pass.
          </p>
          <Button variant="line" onClick={onGoReview}>← Back to review</Button>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 lg:gap-5">
          {items.map((it) => (
            <TrayCard key={it.id} item={it} onSpare={() => spare(it.id)} />
          ))}
        </div>
      )}

      {/* actions */}
      {!loading && items.length > 0 && (
        <div className="mt-9 pt-6 border-t border-border flex flex-wrap items-center justify-between gap-5">
          <div className="text-[10.5px] uppercase tracking-[0.2em] text-muted leading-[1.9] grid gap-0.5">
            <span>Cascade removes:</span>
            <span className="before:content-['─'] before:text-border before:mr-2"><b className="text-text font-medium">File</b> from disk via Jellyfin</span>
            <span className="before:content-['─'] before:text-border before:mr-2"><b className="text-text font-medium">Radarr</b> entry — delete files + unmonitor</span>
            <span className="before:content-['─'] before:text-border before:mr-2"><b className="text-text font-medium">Sonarr</b> entry — series-level</span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="ghost" onClick={onGoReview}>← Back</Button>
            <Button variant="destructive" onClick={() => setConfirming(true)}>
              Delete all · cascade ━━▶
            </Button>
          </div>
        </div>
      )}

      {/* confirm */}
      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Final confirmation" size="md">
        <div className="flex flex-col gap-5">
          <p className="text-sm text-text-dim leading-relaxed">
            You're about to delete <b className="text-text">{items.length} title{items.length === 1 ? '' : 's'}</b>
            {' '}reclaiming <b className="text-text">{formatBytes(totalBytes)}</b>.
            This removes the file from disk and the corresponding Radarr/Sonarr entries.
            This cannot be undone.
          </p>
          <div className="flex justify-end gap-2.5">
            <Button variant="line" size="md" onClick={() => setConfirming(false)} disabled={committing}>
              Cancel
            </Button>
            <Button variant="destructive" size="md" onClick={commit} disabled={committing}>
              {committing ? 'Deleting…' : 'Delete all'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* results */}
      <Dialog open={!!results} onClose={async () => { setResults(null); await refresh(); }} title="Deletion log" size="lg">
        {results && (
          <div className="flex flex-col gap-2">
            <p className="text-[10.5px] uppercase tracking-[0.22em] text-muted mb-2">
              {results.filter((r) => r.error === null).length} of {results.length} succeeded
            </p>
            {results.map((r) => (
              <div key={r.itemId} className="grid grid-cols-[1fr_auto] gap-3 items-center py-2.5 border-b border-border last:border-b-0">
                <div>
                  <div className="font-serif italic text-base">{r.title}</div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted mt-1">
                    {formatBytes(r.sizeBytes)}
                  </div>
                  {r.error && <div className="text-danger text-xs mt-1">{r.error}</div>}
                </div>
                <div className="flex gap-1.5 text-[9.5px] uppercase tracking-[0.18em]">
                  <Pill ok={r.jellyfinOk}>Jellyfin</Pill>
                  {r.radarrId !== null && <Pill ok={r.radarrOk}>Radarr</Pill>}
                  {r.sonarrId !== null && <Pill ok={r.sonarrOk}>Sonarr</Pill>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}

interface TrayCardProps {
  item: Item;
  onSpare: () => void;
}

function TrayCard({ item, onSpare }: TrayCardProps) {
  return (
    <div className="relative bg-surface border border-border hover:border-border-hover transition-colors flex flex-col">
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
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60 pointer-events-none" />
        <div className="absolute left-3 right-9 bottom-2.5 text-white font-serif italic text-[17px] leading-[1.05] drop-shadow-[0_1px_8px_rgba(0,0,0,.5)]">
          ⟨ {item.title} ⟩
        </div>
        <button
          onClick={onSpare}
          title="Spare"
          aria-label="Spare"
          className="absolute top-2 right-2 w-[30px] h-[30px] grid place-items-center bg-bg border border-border hover:border-danger hover:text-danger transition-colors text-text z-10"
        >
          ×
        </button>
      </div>
      <div className="flex justify-between px-2.5 py-2 text-[9.5px] uppercase tracking-[0.18em] text-muted">
        <span>{item.year ?? '—'}</span>
        <b className="text-text font-medium">{formatBytes(item.sizeBytes)}</b>
      </div>
    </div>
  );
}

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`px-2 py-1 border ${
        ok ? 'border-text text-text' : 'border-danger text-danger'
      }`}
    >
      {children} {ok ? '✓' : '✕'}
    </span>
  );
}
