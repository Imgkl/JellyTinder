export type LibraryType = 'movie' | 'tv';
export type ReviewStatus = 'pending' | 'kept' | 'marked' | 'deleted';
export type Decision = 'keep' | 'mark';
export type BatchingStrategy = 'alpha' | 'fixed';

export interface Item {
  id: number;
  source: LibraryType;
  jellyfinId: string;
  radarrId: number | null;
  sonarrId: number | null;
  title: string;
  year: number | null;
  runtimeMin: number | null;
  sizeBytes: number;
  path: string;
  watchedAt: string | null;
  posterUrl: string | null;
  status: ReviewStatus;
}

export interface Batch {
  key: string;
  letter: string;
  page: number;
  total: number;
  remaining: number;
}

export interface Stats {
  libraryTotal: number;
  reviewedSession: number;
  trayCount: number;
  trayBytes: number;
  lifetimeDeleted: number;
  lifetimeReclaimedBytes: number;
  movieCount: number;
  movieBytes: number;
  tvCount: number;
  tvBytes: number;
}

export interface ConnectionStatus {
  ok: boolean;
  message: string;
  version?: string;
}

export interface SetupTestRequest {
  jellyfin?: { url: string; username: string; password: string };
  radarr?: { url: string; apiKey: string };
  sonarr?: { url: string; apiKey: string };
}

export interface SetupTestResponse {
  jellyfin?: ConnectionStatus;
  radarr?: ConnectionStatus;
  sonarr?: ConnectionStatus;
}

export interface Settings {
  jellyfinUrl: string;
  jellyfinUser: string;
  jellyfinConnected: boolean;
  radarrUrl: string;
  radarrConnected: boolean;
  sonarrUrl: string;
  sonarrConnected: boolean;
  batchingStrategy: BatchingStrategy;
  maxBatchSize: number;
  libraryMovies: boolean;
  libraryTv: boolean;
  hideWatched: boolean;
  onboarded: boolean;
}

export interface DeletionResult {
  itemId: number;
  title: string;
  sizeBytes: number;
  jellyfinOk: boolean;
  radarrOk: boolean;
  sonarrOk: boolean;
  error: string | null;
  radarrId: number | null;
  sonarrId: number | null;
}
