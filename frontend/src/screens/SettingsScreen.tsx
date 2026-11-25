import { useId, useMemo, useState } from 'react';
import { useMyLogin, useMyTeams } from '../hooks/useMyLogin';
import { useTheme, type ThemeMode } from '../hooks/useTheme';
import { usePrSyncContext } from '../hooks/PrSyncContext';
import type { ConnectedRepo } from '../services/connectedReposApi';
import MyLoginForm from '../components/settings/MyLoginForm';
import MyTeamsField from '../components/settings/MyTeamsField';
import ConnectedReposSection from '../components/settings/ConnectedReposSection';
import AreaNamesSection from '../components/settings/AreaNamesSection';

const THEMES: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: '시스템 설정 따르기' },
  { mode: 'light', label: '밝게' },
  { mode: 'dark', label: '어둡게' },
];

export default function SettingsScreen() {
  const id = useId();
  const { login } = useMyLogin();
  const { teams } = useMyTeams();
  const { mode, dark, setMode } = useTheme();
  const { syncNow } = usePrSyncContext();
  const [repos, setRepos] = useState<ConnectedRepo[]>([]);
  const [saved, setSaved] = useState('');
  const candidates = useMemo(
    () => [...new Set(repos.flatMap((r) => (r.githubLogin ? [r.githubLogin.toLowerCase()] : [])))],
    [repos],
  );

  const onSaved = (l: string) => {
    setSaved(l);
    void syncNow();
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold">설정</h1>
      <div className="mt-6 space-y-8">
        <section aria-labelledby={`${id}-me`} className="space-y-3">
          <h2 id={`${id}-me`} className="text-base font-semibold">나</h2>
          <p className="text-sm text-muted">이 브라우저에만 저장돼요. 다른 기기에서는 다시 입력해야 해요.</p>
          <p className="text-sm">{login ? `${login}의 큐` : '로그인을 입력하면 내 리뷰 요청을 볼 수 있어요'}</p>
          <MyLoginForm initial={login ?? ''} onSaved={onSaved} variant="settings" candidates={candidates} teams={teams} />
          <p className="text-sm text-muted">저장하면 바로 다시 가져와요.</p>
          {/* 되돌리기로 로그인이 바뀌면 지난 안내는 숨긴다 */}
          <p role="status" className="text-sm">{saved && saved === login ? `${saved}의 큐로 바꿨어요` : ''}</p>
          <MyTeamsField />
        </section>
        <ConnectedReposSection onReposChange={setRepos} />
        <AreaNamesSection />
        <section aria-labelledby={`${id}-view`} className="space-y-3">
          <h2 id={`${id}-view`} className="text-base font-semibold">화면</h2>
          <div role="radiogroup" aria-labelledby={`${id}-view`} aria-describedby={`${id}-now`} className="flex flex-wrap gap-x-4">
            {THEMES.map((t) => (
              <label key={t.mode} className="flex min-h-9 items-center gap-2 text-sm">
                <input type="radio" name={`${id}-theme`} className="size-4" checked={mode === t.mode} onChange={() => setMode(t.mode)} />
                {t.label}
              </label>
            ))}
          </div>
          <p id={`${id}-now`} className="text-sm text-muted">지금은 {dark ? '어둡게' : '밝게'}로 보이고 있어요</p>
        </section>
      </div>
    </div>
  );
}
