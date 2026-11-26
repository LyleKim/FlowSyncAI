import { Link } from 'react-router';
import { areaHref } from '../../lib/areaRoute';
import { waitingDays } from '../../lib/areaChart';
import { useWide } from '../../hooks/useWide';
import { isSafeUrl } from '../queue/PrQueueRow';
import type { WaitingPr } from '../../types/areas';

interface Props {
  repoId: number;
  areaId: string;
  prs: WaitingPr[];
  now?: Date;
}

const CAPTION = '이 영역의 리뷰 대기 PR';
const NOTE = '여러 영역에 걸친 PR은 변경 파일이 가장 많은 영역 한 곳에만 개수에 들어가요. 여기서는 걸친 영역을 모두 보여요.';
const linkCls =
  'inline-flex min-h-6 items-center underline underline-offset-2 wrap-anywhere focus-visible:outline-2 focus-visible:outline-focus-ring';
const chipCls = 'rounded-sm border border-border px-1 text-caption';

function age(iso: string, now: Date): string {
  const d = waitingDays(iso, now);
  if (!Number.isFinite(d)) return '알 수 없음';
  return d < 1 ? '1일 미만' : `${d}일`;
}

function Title({ pr }: { pr: WaitingPr }) {
  return (
    <>
      <span className="wrap-anywhere">#{pr.number} {pr.title}</span>
      {pr.isDraft && <span className={`ml-2 ${chipCls}`}>초안</span>}
    </>
  );
}

function Touched({ pr, repoId, areaId }: { pr: WaitingPr; repoId: number; areaId: string }) {
  const primary = pr.touchedAreas[0];
  const primaryName = primary?.displayName ?? pr.primaryAreaId;
  return (
    <div className="space-y-1">
      {pr.touchedAreas.length > 0 && (
        <ul className="space-y-1">
          {pr.touchedAreas.map((t, i) => (
            <li key={t.areaId} className="flex flex-wrap items-center gap-x-2">
              <span className={chipCls}>{i === 0 ? '주 영역' : '걸쳐 있음'}</span>
              {t.areaId === areaId ? (
                <span className="wrap-anywhere">{t.displayName} (이 영역)</span>
              ) : (
                <Link to={areaHref(t.areaId, { repoId })} className={linkCls}>
                  {t.displayName}
                  <span className="sr-only"> (#{pr.number})</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {!pr.isPrimary && primaryName && <p>주 영역은 {primaryName}이에요(개수는 거기에만 세요)</p>}
      {pr.unmapped > 0 && <p className="text-muted">분류되지 않은 파일 {pr.unmapped}개</p>}
      {pr.filesTruncated && <p className="text-muted">파일이 많아 일부만 봤어요</p>}
    </div>
  );
}

function GitHubLink({ pr }: { pr: WaitingPr }) {
  if (!isSafeUrl(pr.url)) return <span className="text-muted">링크 없음</span>;
  return (
    <a href={pr.url} target="_blank" rel="noopener noreferrer" aria-label={`#${pr.number} GitHub에서 열기`} className={linkCls}>
      GitHub에서 열기
    </a>
  );
}

const reviewers = (pr: WaitingPr) => (pr.requestedReviewers.length ? pr.requestedReviewers.join(', ') : '없음');

export function WaitingPrTable({ repoId, areaId, prs, now = new Date() }: Props) {
  const wide = useWide();
  const note = <p className="mt-2 text-caption text-muted">{NOTE}</p>;

  if (!wide) {
    return (
      <>
        <ul aria-label={CAPTION} className="divide-y divide-border border-y border-border text-body-sm">
          {prs.map((pr) => (
            <li key={pr.number} className="space-y-2 py-3">
              <p className="font-semibold"><Title pr={pr} /></p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted">작성자</dt><dd className="wrap-anywhere">{pr.author}</dd>
                <dt className="text-muted">올라온 지</dt><dd>{age(pr.oldestRequestedAt, now)}</dd>
                <dt className="text-muted">리뷰어</dt><dd className="wrap-anywhere">{reviewers(pr)}</dd>
              </dl>
              <Touched pr={pr} repoId={repoId} areaId={areaId} />
              <GitHubLink pr={pr} />
            </li>
          ))}
        </ul>
        {note}
      </>
    );
  }

  const th = 'px-2 py-2 text-left font-semibold';
  const td = 'px-2 py-3';
  return (
    <>
      <table className="w-full table-fixed border-collapse text-body-sm">
        <caption className="sr-only">{CAPTION}</caption>
        <thead>
          <tr className="border-b border-border-strong">
            <th scope="col" className={`${th} w-1/4`}>PR</th>
            <th scope="col" className={th}>작성자</th>
            <th scope="col" className={th}>올라온 지</th>
            <th scope="col" className={th}>리뷰어</th>
            <th scope="col" className={`${th} w-1/4`}>걸친 영역</th>
            <th scope="col" className={th}>GitHub</th>
          </tr>
        </thead>
        <tbody>
          {prs.map((pr) => (
            <tr key={pr.number} className="border-b border-border align-top">
              <th scope="row" className={`${td} text-left font-normal`}><Title pr={pr} /></th>
              <td className={`${td} wrap-anywhere`}>{pr.author}</td>
              <td className={td}>{age(pr.oldestRequestedAt, now)}</td>
              <td className={`${td} wrap-anywhere`}>{reviewers(pr)}</td>
              <td className={td}><Touched pr={pr} repoId={repoId} areaId={areaId} /></td>
              <td className={td}><GitHubLink pr={pr} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {note}
    </>
  );
}
