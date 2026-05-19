import type {
  Batch,
  Decision,
  DeletionResult,
  Item,
  LibraryType,
  Settings,
  SetupTestRequest,
  SetupTestResponse,
  Stats,
} from './types';

const base = '/api/v1';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<{ ok: boolean }>('/health'),

  settings: () => req<Settings>('/settings'),
  saveSettings: (s: Partial<Settings>) =>
    req<Settings>('/settings', { method: 'POST', body: JSON.stringify(s) }),
  setupTest: (body: SetupTestRequest) =>
    req<SetupTestResponse>('/setup/test', { method: 'POST', body: JSON.stringify(body) }),
  completeOnboarding: () =>
    req<{ ok: boolean }>('/setup/complete', { method: 'POST' }),

  sync: () => req<{ count: number; movies: number; tv: number }>('/sync', { method: 'POST' }),

  batches: (type: LibraryType) =>
    req<Batch[]>(`/batches?type=${type}`),
  batchItems: (key: string, type: LibraryType) =>
    req<Item[]>(`/batches/${encodeURIComponent(key)}/items?type=${type}`),

  items: (opts: { source?: 'movie' | 'tv' | ''; status?: 'live' | 'all' | 'pending' | 'kept' | 'marked' | 'deleted'; q?: string }) => {
    const p = new URLSearchParams();
    if (opts.source) p.set('source', opts.source);
    if (opts.status) p.set('status', opts.status);
    if (opts.q) p.set('q', opts.q);
    const qs = p.toString();
    return req<Item[]>(`/items${qs ? `?${qs}` : ''}`);
  },

  review: (itemId: number, decision: Decision) =>
    req<{ ok: boolean }>('/review', {
      method: 'POST',
      body: JSON.stringify({ itemId, decision }),
    }),

  tray: () => req<Item[]>('/tray'),
  spare: (itemId: number) =>
    req<{ ok: boolean }>(`/tray/${itemId}/spare`, { method: 'POST' }),
  resetTray: () =>
    req<{ ok: boolean }>('/tray/reset', { method: 'POST' }),
  clearReviewHistory: () =>
    req<{ ok: boolean }>('/review/clear', { method: 'POST' }),
  commitTray: () =>
    req<{ results: DeletionResult[] }>('/tray/commit', { method: 'POST' }),

  stats: () => req<Stats>('/stats'),

  undo: () => req<{ ok: boolean; itemId: number | null }>('/review/undo', { method: 'POST' }),
};

export function formatBytes(n: number): string {
  if (!n || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatRuntime(min: number | null): string {
  if (!min) return '—';
  return `${min} min`;
}
