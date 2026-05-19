import { useEffect, useState } from 'react';
import { api, formatBytes } from '../lib/api';
import type { Settings, Stats, BatchingStrategy } from '../lib/types';
import { Button, Chip, Dialog, Input, Spinner } from '../ui';

interface SettingsViewProps {
  settings: Settings;
  onSettings: (s: Settings) => void;
}

export function SettingsView({ settings, onSettings }: SettingsViewProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [maxBatch, setMaxBatch] = useState(settings.maxBatchSize);
  const [batching, setBatching] = useState<BatchingStrategy>(settings.batchingStrategy);
  const [libraryMovies, setLibraryMovies] = useState(settings.libraryMovies);
  const [libraryTv, setLibraryTv] = useState(settings.libraryTv);
  const [hideWatched, setHideWatched] = useState(settings.hideWatched);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<'jellyfin' | 'radarr' | 'sonarr' | null>(null);
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    api.stats()
      .then(setStats)
      .catch(() => null)
      .finally(() => setStatsLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const next = await api.saveSettings({
        maxBatchSize: maxBatch,
        batchingStrategy: batching,
        libraryMovies,
        libraryTv,
        hideWatched,
      });
      onSettings(next);
    } finally {
      setSaving(false);
    }
  }

  async function doSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await api.sync();
      setSyncMsg(`Pulled ${r.count} items · ${r.movies} movies · ${r.tv} TV`);
      const fresh = await api.stats();
      setStats(fresh);
    } catch (e) {
      setSyncMsg(`Failed: ${e}`);
    } finally {
      setSyncing(false);
    }
  }

  async function purgeTray() {
    await api.resetTray();
    setConfirmingPurge(false);
  }

  async function clearHistory() {
    await api.clearReviewHistory();
    setConfirmingClear(false);
  }

  const reclaimRatio =
    stats && stats.libraryTotal > 0
      ? Math.min(100, Math.round((stats.lifetimeDeleted / Math.max(1, stats.libraryTotal + stats.lifetimeDeleted)) * 100))
      : 0;

  return (
    <div className="px-6 lg:px-8 pt-9 pb-32">
      <div className="max-w-[880px] mx-auto">
      <span className="text-[10px] uppercase tracking-[0.22em] text-muted font-medium">Configuration</span>
      <h2 className="font-serif italic text-[46px] mb-9 tracking-[0.005em] leading-none mt-1.5">Settings.</h2>

      {/* Connections */}
      <Section title="Connections" right="3 services">
        <ConnRow
          name="Jellyfin"
          url={settings.jellyfinUrl}
          connected={settings.jellyfinConnected}
          onEdit={() => setEditing('jellyfin')}
        />
        <ConnRow
          name="Radarr"
          url={settings.radarrUrl}
          connected={settings.radarrConnected}
          onEdit={() => setEditing('radarr')}
        />
        <ConnRow
          name="Sonarr"
          url={settings.sonarrUrl}
          connected={settings.sonarrConnected}
          onEdit={() => setEditing('sonarr')}
        />
      </Section>

      {/* Library actions */}
      <Section title="Library">
        <div className="flex flex-wrap items-center gap-4 py-3">
          <Button variant="line" onClick={doSync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync from Jellyfin'}
          </Button>
          {syncMsg && <span className="text-[10.5px] uppercase tracking-[0.22em] text-muted">{syncMsg}</span>}
        </div>
      </Section>

      {/* Review behavior */}
      <Section title="Review behavior">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Batching strategy">
            <Radio name="bs" checked={batching === 'alpha'} onChange={() => setBatching('alpha')} label="A — Z" />
            <Radio name="bs" checked={batching === 'fixed'} onChange={() => setBatching('fixed')} label="Fixed N" />
          </Field>
          <Field label="Max batch size">
            <input
              type="number"
              min={5}
              max={200}
              value={maxBatch}
              onChange={(e) => setMaxBatch(Math.max(1, Number(e.target.value) || 0))}
              className="w-[90px] text-center py-2 px-1.5 border border-border bg-transparent text-[13px] focus:border-text outline-none"
            />
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted ml-2">items per page</span>
          </Field>
          <Field label="Library focus">
            <Chip active={libraryMovies} onClick={() => setLibraryMovies((v) => !v)}>Movies</Chip>
            <Chip active={libraryTv} onClick={() => setLibraryTv((v) => !v)}>TV</Chip>
          </Field>
          <Field label="Hide watched">
            <Radio name="hw" checked={hideWatched} onChange={() => setHideWatched(true)} label="On" />
            <Radio name="hw" checked={!hideWatched} onChange={() => setHideWatched(false)} label="Off" />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Section>

      {/* Stats */}
      <Section title="Stats" right={stats ? 'live' : ''}>
        {statsLoading || !stats ? (
          <div className="flex items-center gap-3 text-muted py-6">
            <Spinner /> <span className="text-[10.5px] uppercase tracking-[0.22em]">Loading</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 border border-border">
              <StatCell k="Library">
                {stats.libraryTotal.toLocaleString()}
                <small className="ml-1.5 text-[14px] text-muted not-italic tracking-[0.18em] uppercase font-normal">titles</small>
              </StatCell>
              <StatCell k="Reviewed">{stats.reviewedSession.toLocaleString()}</StatCell>
              <StatCell k="In tray">
                {stats.trayCount}
                <small className="ml-1.5 text-[14px] text-muted not-italic tracking-[0.18em] uppercase font-normal">· {formatBytes(stats.trayBytes)}</small>
              </StatCell>
              <StatCell k="Reclaimed lifetime">
                {formatBytes(stats.lifetimeReclaimedBytes)}
                <small className="ml-1.5 text-[14px] text-muted not-italic tracking-[0.18em] uppercase font-normal">· {stats.lifetimeDeleted} items</small>
              </StatCell>
            </div>
            {/* breakdown: movies + TV */}
            <div className="grid grid-cols-2 border border-border border-t-0">
              <div className="p-5 border-r border-border">
                <div className="text-[9.5px] uppercase tracking-[0.24em] text-muted mb-2.5">Movies</div>
                <div className="font-serif italic text-[26px] leading-none tracking-[0.01em]">
                  {stats.movieCount.toLocaleString()}
                  <small className="ml-1.5 text-[12px] text-muted not-italic tracking-[0.18em] uppercase font-normal">titles · {formatBytes(stats.movieBytes)}</small>
                </div>
              </div>
              <div className="p-5">
                <div className="text-[9.5px] uppercase tracking-[0.24em] text-muted mb-2.5">TV</div>
                <div className="font-serif italic text-[26px] leading-none tracking-[0.01em]">
                  {stats.tvCount.toLocaleString()}
                  <small className="ml-1.5 text-[12px] text-muted not-italic tracking-[0.18em] uppercase font-normal">series · {formatBytes(stats.tvBytes)}</small>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted mb-2 font-medium">Reclaim ratio · {reclaimRatio}%</div>
              <div className="h-[2px] bg-border relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-text transition-all" style={{ width: `${reclaimRatio}%` }} />
              </div>
            </div>
          </>
        )}
      </Section>

      <Section title="Danger zone" titleClass="text-danger">
        <div className="flex flex-wrap gap-3 pt-2">
          <Button variant="destructive" onClick={() => setConfirmingClear(true)}>Clear review history</Button>
          <Button variant="destructive" onClick={() => setConfirmingPurge(true)}>Purge tray</Button>
        </div>
      </Section>

      {/* Connection editor */}
      <ConnectionDialog
        open={!!editing}
        which={editing}
        settings={settings}
        onClose={() => setEditing(null)}
        onSaved={(s) => {
          onSettings(s);
          setEditing(null);
        }}
      />

      {/* Confirms */}
      <Dialog open={confirmingPurge} onClose={() => setConfirmingPurge(false)} title="Purge tray" size="sm">
        <p className="text-text-dim text-sm mb-5">
          Removes all marked items from the tray (returns them to pending). Nothing is deleted from disk.
        </p>
        <div className="flex justify-end gap-2.5">
          <Button variant="line" onClick={() => setConfirmingPurge(false)}>Cancel</Button>
          <Button variant="destructive" onClick={purgeTray}>Purge</Button>
        </div>
      </Dialog>
      <Dialog open={confirmingClear} onClose={() => setConfirmingClear(false)} title="Clear review history" size="sm">
        <p className="text-text-dim text-sm mb-5">
          Resets every item back to <b>pending</b>. Lifetime deletion stats are preserved.
        </p>
        <div className="flex justify-end gap-2.5">
          <Button variant="line" onClick={() => setConfirmingClear(false)}>Cancel</Button>
          <Button variant="destructive" onClick={clearHistory}>Clear</Button>
        </div>
      </Dialog>
      </div>
    </div>
  );
}

function Section({
  title,
  right,
  children,
  titleClass = '',
}: {
  title: string;
  right?: string;
  children: React.ReactNode;
  titleClass?: string;
}) {
  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between border-b border-border pb-2.5 mb-4">
        <span className={`text-[11px] uppercase tracking-[0.24em] text-text-dim font-medium ${titleClass}`}>
          {title}
        </span>
        {right && <span className="text-[10px] uppercase tracking-[0.22em] text-muted">{right}</span>}
      </div>
      {children}
    </section>
  );
}

function ConnRow({
  name,
  url,
  connected,
  onEdit,
}: {
  name: string;
  url: string;
  connected: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_auto_auto] gap-4 items-center py-3.5 border-b border-border last:border-b-0">
      <div className="font-serif italic text-[18px]">{name}</div>
      <div className="font-mono text-[11.5px] text-text-dim overflow-hidden text-ellipsis whitespace-nowrap">
        {url || '—'}
      </div>
      <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted">
        <span
          className={`w-[7px] h-[7px] ${
            url ? (connected ? 'bg-[#137333]' : 'bg-[#b06800]') : 'bg-border'
          }`}
        />
        {url ? (connected ? 'Connected' : 'Disconnected') : 'Not set'}
      </div>
      <Button variant="line" size="sm" onClick={onEdit}>Edit</Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3.5 border-b border-border last:border-b-0">
      <span className="text-[10px] uppercase tracking-[0.22em] text-muted font-medium">{label}</span>
      <div className="flex items-center gap-2.5 flex-wrap">{children}</div>
    </div>
  );
}

function Radio({
  name,
  checked,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim cursor-pointer">
      <span
        className={`w-[14px] h-[14px] border relative ${checked ? 'border-text' : 'border-border'}`}
        onClick={onChange}
      >
        {checked && <span className="absolute inset-[3px] bg-text" />}
      </span>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {label}
    </label>
  );
}

function StatCell({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="p-5 border-r border-b border-border [&:nth-child(2n)]:border-r-0 md:[&:nth-child(2n)]:border-r [&:nth-last-child(-n+2)]:border-b-0 md:[&:nth-child(4n)]:border-r-0">
      <div className="text-[9.5px] uppercase tracking-[0.24em] text-muted mb-2.5">{k}</div>
      <div className="font-serif italic text-[32px] leading-none tracking-[0.01em]">{children}</div>
    </div>
  );
}

function ConnectionDialog({
  open,
  which,
  settings,
  onClose,
  onSaved,
}: {
  open: boolean;
  which: 'jellyfin' | 'radarr' | 'sonarr' | null;
  settings: Settings;
  onClose: () => void;
  onSaved: (s: Settings) => void;
}) {
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultOk, setResultOk] = useState(false);

  useEffect(() => {
    if (!open || !which) return;
    setResult(null);
    setResultOk(false);
    if (which === 'jellyfin') {
      setUrl(settings.jellyfinUrl);
      setUsername(settings.jellyfinUser);
      setPassword('');
    } else if (which === 'radarr') {
      setUrl(settings.radarrUrl);
      setApiKey('');
    } else {
      setUrl(settings.sonarrUrl);
      setApiKey('');
    }
  }, [open, which, settings]);

  if (!which) return null;

  const title =
    which === 'jellyfin' ? 'Jellyfin' : which === 'radarr' ? 'Radarr' : 'Sonarr';

  async function test() {
    if (!which) return;
    setTesting(true);
    setResult(null);
    try {
      const payload: Parameters<typeof api.setupTest>[0] =
        which === 'jellyfin'
          ? { jellyfin: { url, username, password } }
          : which === 'radarr'
            ? { radarr: { url, apiKey } }
            : { sonarr: { url, apiKey } };
      const res = await api.setupTest(payload);
      const r = res[which];
      if (r?.ok) {
        setResultOk(true);
        setResult(`Connected${r.version ? ` · v${r.version}` : ''}`);
      } else {
        setResultOk(false);
        setResult(r?.message ?? 'Test failed');
      }
    } catch (e) {
      setResultOk(false);
      setResult(String(e));
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (!which) return;
    setSaving(true);
    try {
      const patch: Partial<Settings> & Record<string, unknown> =
        which === 'jellyfin'
          ? { jellyfinUrl: url, jellyfinUser: username, jellyfinPassword: password }
          : which === 'radarr'
            ? { radarrUrl: url, radarrApiKey: apiKey }
            : { sonarrUrl: url, sonarrApiKey: apiKey };
      const next = await api.saveSettings(patch);
      onSaved(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} size="md">
      <div className="flex flex-col gap-5">
        <Input label="URL" value={url} onChange={(e) => setUrl(e.currentTarget.value)} />
        {which === 'jellyfin' ? (
          <>
            <Input label="Username" value={username} onChange={(e) => setUsername(e.currentTarget.value)} />
            <Input
              label="Password"
              type="password"
              value={password}
              placeholder="leave blank to keep current"
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
          </>
        ) : (
          <Input
            label="API key"
            type="password"
            value={apiKey}
            placeholder="leave blank to keep current"
            onChange={(e) => setApiKey(e.currentTarget.value)}
          />
        )}

        {result && (
          <div
            className={`text-[10.5px] uppercase tracking-[0.22em] ${
              resultOk ? 'text-text' : 'text-danger'
            }`}
          >
            {result}
          </div>
        )}

        <div className="flex justify-end gap-2.5 mt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="line" onClick={test} disabled={testing}>
            {testing ? 'Testing…' : 'Test'}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
