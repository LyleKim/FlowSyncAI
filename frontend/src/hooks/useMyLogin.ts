import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  MAX_TEAMS,
  STORAGE_KEYS,
  getMyLogin,
  onStorageChange,
  parseTeams,
  readStorage,
  removeStorage,
  setMyLogin,
  setMyTeams,
} from '../lib/storage';

export function useMyLogin() {
  const login = useSyncExternalStore(onStorageChange, getMyLogin);
  const save = useCallback((raw: string) => setMyLogin(raw), []);
  const clear = useCallback(() => removeStorage(STORAGE_KEYS.myLogin), []);
  return { login, save, clear };
}

export type SaveTeamsResult =
  | { ok: true; teams: string[] }
  | { ok: false; invalid: string[]; tooMany: boolean };

export function useMyTeams() {
  // 문자열 스냅샷으로 구독해 배열 참조가 매 렌더 바뀌는 것을 막는다
  const raw = useSyncExternalStore(
    onStorageChange,
    () => readStorage(STORAGE_KEYS.myTeams) ?? '',
  );
  const teams = useMemo(() => raw.split(',').filter(Boolean), [raw]);
  const save = useCallback((input: string): SaveTeamsResult => {
    const { teams, invalid } = parseTeams(input);
    const tooMany = teams.length > MAX_TEAMS;
    if (invalid.length || tooMany) return { ok: false, invalid, tooMany };
    setMyTeams(teams);
    return { ok: true, teams };
  }, []);
  return { teams, save };
}
