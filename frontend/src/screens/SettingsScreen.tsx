import { useMyLogin } from '../hooks/useMyLogin';
import { useTheme } from '../hooks/useTheme';
import MyLoginForm from '../components/settings/MyLoginForm';
import ConnectedReposSection from '../components/settings/ConnectedReposSection';

const THEMES = [
  { mode: 'light', label: '밝게' },
  { mode: 'dark', label: '어둡게' },
] as const;

export default function SettingsScreen() {
  const { login } = useMyLogin();
  const { mode, setMode } = useTheme();
  return (
    <>
      <h1 className="text-xl font-bold">설정</h1>
      <div className="mt-6 space-y-8">
        <section aria-labelledby="set-me" className="space-y-3">
          <h2 id="set-me" className="text-base font-semibold">나</h2>
          <MyLoginForm initial={login ?? ''} onSaved={() => {}} />
          {login && <p className="text-sm">{login}의 큐</p>}
        </section>
        <ConnectedReposSection />
        <section aria-labelledby="set-view" className="space-y-3">
          <h2 id="set-view" className="text-base font-semibold">화면</h2>
          <div role="radiogroup" aria-label="테마" className="flex gap-4">
            {THEMES.map((t) => (
              <label key={t.mode} className="flex items-center gap-2 text-sm">
                <input type="radio" name="theme" checked={mode === t.mode} onChange={() => setMode(t.mode)} />
                {t.label}
              </label>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
