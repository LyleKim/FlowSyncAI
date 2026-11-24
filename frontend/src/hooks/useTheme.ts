import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS, readStorage, writeStorage } from '../lib/storage';

export type ThemeMode = 'system' | 'light' | 'dark';

const QUERY = '(prefers-color-scheme: dark)';

// index.html의 FOUC 방지 스크립트와 같은 해석 규칙
function readMode(): ThemeMode {
  const v = readStorage(STORAGE_KEYS.theme);
  if (v === 'true' || v === 'dark') return 'dark';
  if (v === 'false' || v === 'light') return 'light';
  return 'system';
}

const osDark = () => window.matchMedia(QUERY).matches;

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [os, setOs] = useState<boolean>(osDark);
  const dark = mode === 'system' ? os : mode === 'dark';

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setOs(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    writeStorage(STORAGE_KEYS.theme, m === 'dark' ? 'true' : m === 'light' ? 'false' : 'system');
  }, []);
  const setDark = useCallback((v: boolean) => setMode(v ? 'dark' : 'light'), [setMode]);

  return { mode, dark, setMode, setDark };
}
