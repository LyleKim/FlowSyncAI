import { useId, useRef, useState, type FormEvent } from 'react';
import { getMyLogin, normalizeLogin } from '../../lib/storage';
import { useMyLogin, useMyTeams } from '../../hooks/useMyLogin';
import { useUndo } from '../../hooks/useUndo';
import { probeReviewQueue } from '../../services/connectedReposApi';

const PROBE_TIMEOUT_MS = 3000;

// 서버가 이 팀에서 이 로그인을 본 적이 없고, 이미 가져온 적 있는 서버일 때만 true(오경보 방지).
async function looksUnknown(login: string, teams: string[]): Promise<boolean> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((res) => { timer = setTimeout(() => { ctl.abort(); res(null); }, PROBE_TIMEOUT_MS); });
  const probe = await Promise.race([probeReviewQueue(login, teams, ctl.signal), timeout]);
  clearTimeout(timer);
  return !!probe && probe.knownLogin === false && probe.repos.some((r) => r.lastSuccessAt);
}

interface Props {
  initial?: string;
  onSaved: (login: string) => void;
  variant?: 'first-run' | 'settings';
  candidates?: string[];
  teams?: string[];
}

export default function MyLoginForm({ initial = '', onSaved, variant = 'settings', candidates = [], teams }: Props) {
  const id = useId();
  const { login: current, save, clear } = useMyLogin();
  const { teams: myTeams } = useMyTeams();
  const { schedule } = useUndo();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [unknown, setUnknown] = useState('');
  const preview = normalizeLogin(value);
  const firstRun = variant === 'first-run';

  const commitSave = (login: string) => {
    save(login);
    onSaved(login);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const login = normalizeLogin(value);
    setInvalid(!login);
    setConfirm('');
    setUnknown('');
    if (!login) return;
    const known = candidates.some((c) => c.toLowerCase() === login);
    const probeTeams = teams ?? myTeams;

    if (!firstRun) {
      const prev = current;
      commitSave(login);
      if (prev !== login) {
        schedule({
          label: `내 로그인을 바꿨어요: ${login}`,
          hide: () => {},
          restore: () => {
            if (prev) save(prev); else clear();
            setValue(prev ?? '');
            setUnknown('');
          },
          commit: async () => ({ ok: true }),
          windowMs: 10_000,
        });
      }
      // 프로브가 돌아오기 전에 되돌렸다면 오래된 안내는 띄우지 않는다.
      if (!known && (await looksUnknown(login, probeTeams)) && getMyLogin() === login) setUnknown(login);
      return;
    }

    if (known) return commitSave(login);
    setBusy(true);
    const suspicious = await looksUnknown(login, probeTeams);
    setBusy(false);
    if (suspicious) setConfirm(login);
    else commitSave(login);
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">내 GitHub 로그인</label>
      <p id={`${id}-hint`} className="text-sm text-muted">github.com/ 뒤에 오는 이름이에요.</p>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => { setValue(e.target.value); setInvalid(false); setConfirm(''); setUnknown(''); }}
          aria-invalid={invalid}
          aria-describedby={`${id}-hint ${id}-preview ${id}-err`}
          className="min-h-9 min-w-40 max-w-64 flex-1 rounded border border-border bg-surface-raised px-3 text-sm"
        />
        <button
          type="submit"
          aria-disabled={busy}
          className="min-h-9 rounded bg-accent px-3 text-sm font-semibold text-accent-contrast"
        >
          {busy ? '확인하는 중…' : firstRun ? '저장하고 내 리뷰 요청 보기' : '로그인 저장'}
        </button>
      </div>
      <p id={`${id}-preview`} className="text-sm text-muted">
        {preview ? `${preview} 으로 확인해요 (대소문자는 구분하지 않아요)` : ''}
      </p>
      {invalid && <p id={`${id}-err`} role="alert" className="text-sm text-danger">영문·숫자·하이픈만 쓸 수 있어요 (최대 39자)</p>}
      {candidates.length > 0 && (
        <div role="group" aria-label="팀에서 찾은 로그인" className="flex flex-wrap gap-2">
          {candidates.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setValue(c); setInvalid(false); setConfirm(''); }}
              className="min-h-9 rounded border border-border bg-surface-sunken px-3 text-sm"
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {confirm && (
        <div role="status" className="space-y-2 rounded border border-border bg-surface-sunken p-3 text-sm">
          <p>“{confirm}”은 이 팀에서 본 적 없는 이름이에요. 맞나요?</p>
          <p className="text-muted">철자와 대문자는 상관없어요.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => commitSave(confirm)} className="min-h-9 rounded bg-accent px-3 font-semibold text-accent-contrast">맞아요</button>
            <button type="button" onClick={() => { setConfirm(''); inputRef.current?.focus(); }} className="min-h-9 rounded border border-border px-3">수정</button>
          </div>
        </div>
      )}
      {unknown && (
        <p role="status" className="text-sm text-muted">“{unknown}”은 이 팀에서 본 적 없는 이름이에요. 철자를 확인해 주세요.</p>
      )}
    </form>
  );
}
