export const STORAGE_KEYS = {
  theme: 'darkMode',
  myLogin: 'flowsync:myLogin',
  myTeams: 'flowsync:myTeams',
  tasksEtag: 'tasks-etag',
  tasksLastModified: 'tasks-last-modified',
  archRepoUrl: 'architecture:lastRepoUrl',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

// localStorage가 막힌 세션에서 같은 세션 동안만 값을 유지하는 폴백
const fallback = new Map<string, string>();

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// 같은 탭의 write/remove와 다른 탭의 storage 이벤트를 모두 전달
export function onStorageChange(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function readStorage(key: StorageKey): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    /* 폴백 사용 */
  }
  return fallback.get(key) ?? null;
}

export function writeStorage(key: StorageKey, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    fallback.delete(key);
    return true;
  } catch {
    fallback.set(key, value);
    return false;
  } finally {
    emit();
  }
}

export function removeStorage(key: StorageKey): void {
  fallback.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* 무시 */
  }
  emit();
}

export function isStorageAvailable(): boolean {
  try {
    const k = '__flowsync_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function normalizeLogin(raw: string): string {
  const s = raw
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/.test(s) ? s : '';
}

export function getMyLogin(): string | null {
  return readStorage(STORAGE_KEYS.myLogin) || null;
}

export function setMyLogin(raw: string): string | null {
  const login = normalizeLogin(raw);
  if (!login) return null;
  writeStorage(STORAGE_KEYS.myLogin, login);
  return login;
}

export const MAX_TEAMS = 10;

export function normalizeTeam(raw: string): string {
  const s = raw.trim().replace(/^@/, '').toLowerCase();
  return /^[a-z\d][a-z\d-]{0,38}\/[a-z\d][a-z\d_-]{0,99}$/.test(s) ? s : '';
}

export function parseTeams(raw: string): { teams: string[]; invalid: string[] } {
  const teams: string[] = [];
  const invalid: string[] = [];
  for (const tok of raw.split(/[\s,]+/).filter(Boolean)) {
    const t = normalizeTeam(tok);
    if (!t) invalid.push(tok);
    else if (!teams.includes(t)) teams.push(t);
  }
  return { teams, invalid };
}

export function getMyTeams(): string[] {
  return (readStorage(STORAGE_KEYS.myTeams) ?? '').split(',').filter(Boolean);
}

export function setMyTeams(teams: string[]): void {
  if (teams.length) writeStorage(STORAGE_KEYS.myTeams, teams.join(','));
  else removeStorage(STORAGE_KEYS.myTeams);
}

// 옛 버전이 남긴 캐시 키(키 문자열은 StorageKey에 없으므로 직접 접근)
export function purgeLegacyKeys(): void {
  for (const k of ['tasks', 'activities']) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* 무시 */
    }
  }
}
