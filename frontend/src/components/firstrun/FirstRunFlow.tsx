import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { usePrSyncContext } from '../../hooks/PrSyncContext';
import { useMyTeams } from '../../hooks/useMyLogin';
import {
  listConnectedRepos,
  probeReviewQueue,
  type ConnectedRepo,
  type QueueProbe,
} from '../../services/connectedReposApi';
import MyLoginForm from '../settings/MyLoginForm';
import ConnectRepoForm from '../settings/ConnectRepoForm';
import FirstSyncProgress, { SLOW_SYNC_MS } from './FirstSyncProgress';
import FirstSyncResult from './FirstSyncResult';

type Step = 'login' | 'repo' | 'sync' | 'result';
interface State {
  step: Step;
  login: string;
  /** null = 아직 모름(로드 중이거나 실패) */
  repos: ConnectedRepo[] | null;
  probe: QueueProbe | null;
  /** 가져오기 시도 번호. 바뀔 때마다 가져오기를 새로 시작한다. */
  attempt: number;
  serverDown: boolean;
}
type Action =
  | { type: 'listed'; repos: ConnectedRepo[] }
  | { type: 'saved'; login: string }
  | { type: 'connected'; repo: ConnectedRepo }
  | { type: 'synced'; repos: ConnectedRepo[]; probe: QueueProbe | null }
  | { type: 'serverDown' }
  | { type: 'retry' }
  | { type: 'changeLogin' };

const toSync = (s: State): State => ({ ...s, step: 'sync', attempt: s.attempt + 1, serverDown: false });

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'listed':
      return s.step === 'login' ? { ...s, repos: a.repos } : s;
    case 'saved':
      // 레포 0개로 확인된 경우에만 레포 단계. 모르면(로드 실패) 가져오기 단계가 다시 확인한다.
      return s.repos?.length === 0 ? { ...s, login: a.login, step: 'repo' } : toSync({ ...s, login: a.login });
    case 'connected':
      return toSync({ ...s, repos: [...(s.repos ?? []).filter((r) => r.id !== a.repo.id), a.repo] });
    case 'synced':
      return a.repos.length === 0
        ? { ...s, repos: [], step: 'repo' }
        : { ...s, repos: a.repos, probe: a.probe, step: 'result' };
    case 'serverDown':
      return { ...s, serverDown: true };
    case 'retry':
      return toSync(s);
    case 'changeLogin':
      return { ...s, step: 'login' };
  }
}

const h1Class = 'text-xl font-bold';
const btn = 'min-h-9 rounded border border-border px-3 text-sm';

export default function FirstRunFlow({ onFinished }: { onFinished: () => void }) {
  const { status, syncNow } = usePrSyncContext();
  const { teams } = useMyTeams();
  const [s, dispatch] = useReducer(reducer, { step: 'login', login: '', repos: null, probe: null, attempt: 0, serverDown: false });
  const [syncedAttempt, setSyncedAttempt] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  // 마지막으로 포커스를 맞춘 단계. StrictMode의 effect 재실행에도 첫 마운트를 이동으로 보지 않게 값으로 비교한다.
  const shownStep = useRef(`${s.step}:${s.attempt}`);

  // 합류자 안내·후보 칩용. 실패하면 안내를 생략한다(가져오기 단계에서 다시 확인).
  useEffect(() => {
    let alive = true;
    listConnectedRepos().then((repos) => alive && dispatch({ type: 'listed', repos }), () => {});
    return () => { alive = false; };
  }, []);

  // 단계 전환(재시도 포함)마다 새 단계 제목으로 포커스(커밋과 같은 틱에).
  useLayoutEffect(() => {
    const key = `${s.step}:${s.attempt}`;
    if (shownStep.current === key) return;
    shownStep.current = key;
    box.current?.querySelector<HTMLElement>('h1')?.focus();
  }, [s.step, s.attempt]);

  // 가져오기: syncNow(진행 중이면 그 요청)를 기다리고 경과 시간을 잰다.
  useEffect(() => {
    if (s.step !== 'sync' || s.serverDown) return;
    let alive = true;
    const start = Date.now();
    setElapsedMs(0);
    const timer = window.setInterval(() => setElapsedMs(Date.now() - start), 1000);
    const done = () => { if (alive) setSyncedAttempt(s.attempt); };
    syncNow().then(done, done);
    return () => { alive = false; window.clearInterval(timer); };
  }, [s.step, s.attempt, s.serverDown, syncNow]);

  // syncNow가 끝났고 status.syncing도 false가 되면 결과를 모은다.
  useEffect(() => {
    if (s.step !== 'sync' || s.serverDown || syncedAttempt !== s.attempt || status.syncing) return;
    let alive = true;
    void (async () => {
      let repos: ConnectedRepo[];
      try {
        repos = await listConnectedRepos();
      } catch {
        if (alive) dispatch({ type: 'serverDown' });
        return;
      }
      const probe = repos.length > 0 ? await probeReviewQueue(s.login, teams) : null;
      if (alive) dispatch({ type: 'synced', repos, probe });
    })();
    return () => { alive = false; };
  }, [s.step, s.serverDown, s.attempt, syncedAttempt, status.syncing, s.login, teams]);

  const repos = s.repos ?? [];
  const logins: string[] = repos.map((r) => r.githubLogin?.trim() ?? '');
  const candidates = logins.filter((l, i) => l && logins.indexOf(l) === i);

  return (
    <div ref={box} className="mx-auto w-full max-w-2xl space-y-4">
      {s.step === 'login' && (
        <>
          {repos.length > 0 && (
            <div className="space-y-1 rounded border border-border bg-surface-sunken p-3 text-sm">
              <p className="font-semibold">팀이 이미 레포 {repos.length}개를 연결해 두었어요</p>
              <p className="text-muted">로그인만 입력하면 바로 시작할 수 있어요. 레포를 따로 추가하지 않아도 돼요.</p>
            </div>
          )}
          <h1 tabIndex={-1} className={h1Class}>누구의 리뷰 요청을 보여드릴까요?</h1>
          <p className="text-sm">
            GitHub 로그인을 입력하면, 연결된 레포에서 그 계정에게 온 리뷰 요청을 모아 보여드려요. 입력한 로그인은 이 브라우저에만 저장돼요.
          </p>
          <MyLoginForm
            variant="first-run"
            initial={s.login}
            candidates={candidates}
            onSaved={(login) => dispatch({ type: 'saved', login })}
          />
          <p className="text-sm text-muted">나중에 설정에서 바꿀 수 있어요.</p>
        </>
      )}

      {s.step === 'repo' && (
        <>
          <h1 tabIndex={-1} className={h1Class}>리뷰 요청을 가져올 레포를 연결해 주세요</h1>
          {/* 409(이미 연결됨)도 성공으로 보고 다음 단계로 간다.
              autoFocus는 쓰지 않는다: 단계 전환 포커스는 h1(입력은 바로 다음 Tab). */}
          <ConnectRepoForm onConnected={(repo) => dispatch({ type: 'connected', repo })} />
        </>
      )}

      {s.step === 'sync' && (
        <>
          <h1 tabIndex={-1} className={h1Class}>리뷰 요청을 가져오고 있어요</h1>
          {s.serverDown ? (
            <div role="alert" className="space-y-2 rounded border border-border bg-surface-sunken p-3 text-sm">
              <p className="font-semibold">서버에 연결할 수 없어요</p>
              <p className="text-muted">이 앱의 서버가 꺼져 있거나 네트워크가 끊겼을 수 있어요. 지금은 리뷰 요청을 보여드릴 수 없어요.</p>
              <button type="button" onClick={() => dispatch({ type: 'retry' })} className={btn}>다시 시도</button>
            </div>
          ) : (
            <FirstSyncProgress repos={repos} running elapsedMs={elapsedMs} />
          )}
          {(s.serverDown || elapsedMs >= SLOW_SYNC_MS) && (
            <button type="button" onClick={onFinished} className={btn}>기다리지 않고 내 리뷰 요청 보기</button>
          )}
        </>
      )}

      {s.step === 'result' && (
        <FirstSyncResult
          login={s.login}
          repos={repos}
          probe={s.probe}
          onChangeLogin={() => dispatch({ type: 'changeLogin' })}
          onRetry={() => dispatch({ type: 'retry' })}
          onFinish={onFinished}
        />
      )}
    </div>
  );
}
