import type { ConnectedRepo } from '../../services/connectedReposApi';

export const SLOW_SYNC_MS = 10_000;

interface Props {
  repos: ConnectedRepo[];
  running: boolean;
  elapsedMs: number;
}

// 정적 텍스트만(스피너·애니메이션 없음).
export default function FirstSyncProgress({ repos, running, elapsedMs }: Props) {
  return (
    <div className="space-y-3">
      <div role="status" className="space-y-1 text-sm">
        {running && (
          <>
            <p className="font-semibold">
              {repos.length > 0 ? `레포 ${repos.length}개에서 리뷰 요청을 확인하는 중이에요` : '리뷰 요청을 확인하는 중이에요'}
            </p>
            {elapsedMs >= SLOW_SYNC_MS && <p className="text-muted">계속 확인 중이에요. 다른 화면으로 가도 돼요.</p>}
          </>
        )}
      </div>
      {running && repos.length > 0 && (
        <ul className="divide-y divide-border rounded border border-border text-sm">
          {repos.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0 break-all">{r.owner}/{r.name}</span>
              <span className="text-muted">확인하는 중…</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
