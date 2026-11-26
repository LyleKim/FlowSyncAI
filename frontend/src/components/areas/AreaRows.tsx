import { Link } from 'react-router';
import { ROUTES } from '../../routes';
import { areaHref } from '../../lib/areaRoute';
import {
  MISC_WARN_SHARE,
  TREND_GLYPH,
  isReviewWaitingNoActivity,
  miscShare,
  relativeDay,
  trendLabel,
  waitBarCells,
  waitLabel,
  waitingDays,
} from '../../lib/areaChart';
import type { Area, AreaAlias } from '../../types/areas';
import { WeeklyBars } from './WeeklyBars';
import { WaitCells } from '../common/WaitCells';
import { useWide } from '../../hooks/useWide';
import { FolderDescriptionNote } from './FolderDescriptionNote';

interface Props {
  areas: Area[];
  disconnected: AreaAlias[];
  generatedAt: string;
  days: number;
  repoId: number;
  now?: Date;
}

const linkCls =
  'inline-block min-h-6 font-semibold underline underline-offset-2 wrap-anywhere focus-visible:outline-2 focus-visible:outline-focus-ring';
const metaCls = 'text-caption text-muted wrap-anywhere';

function Meta({ a, all }: { a: Area; all: Area[] }) {
  const share = miscShare(all, a);
  return (
    <>
      <FolderDescriptionNote d={a.description} compact />
      <p className={metaCls}>{a.pathPrefix} · 파일 {a.fileCount}개 · 사람 {a.authors.length}명</p>
      {share !== null && share >= MISC_WARN_SHARE && (
        <p className="text-caption">
          <span aria-hidden="true">⚠ </span>분류되지 않은 파일이 많아요(약 {Math.round(share * 100)}%)
        </p>
      )}
    </>
  );
}

function Trend({ a }: { a: Area }) {
  return (
    <span>
      <span aria-hidden="true">{TREND_GLYPH[a.trend]} </span>
      <span>{trendLabel(a.trend)}</span>
    </span>
  );
}

function WaitCount({ a, now }: { a: Area; now: Date }) {
  const { prCount, oldestRequestedAt } = a.reviewWaiting;
  if (prCount === 0) return <p className="text-muted">대기 없음</p>;
  const d = oldestRequestedAt ? waitingDays(oldestRequestedAt, now) : null;
  return (
    <div className="space-y-1">
      <p>리뷰 대기 {prCount}건{d !== null && ` · ${waitLabel(d)}`}</p>
      {/* 1칸 = 1일, 같은 값이 위 글자에 있다 */}
      {d !== null && <WaitCells filled={waitBarCells(d)} />}
    </div>
  );
}

function NoActivitySignal({ a }: { a: Area }) {
  if (!isReviewWaitingNoActivity(a)) return null;
  return (
    <p className="font-semibold">
      <span aria-hidden="true">◆ </span>
      <span>리뷰 대기 중, 활동 없음</span>
    </p>
  );
}

function GoneBadge() {
  return <span className="ml-2 inline-block rounded-sm border border-border-strong px-1 text-caption font-normal">연결 끊김</span>;
}

function GoneNote({ al }: { al: AreaAlias }) {
  return (
    <>
      <p className="wrap-anywhere">이 이름이 가리키던 경로({al.pathPrefix})가 코드에서 보이지 않아요.</p>
      <Link to={ROUTES.settings} className={linkCls}>
        영역 이름 정리<span className="sr-only"> ({al.displayName})</span>
      </Link>
    </>
  );
}

export function AreaRows({ areas, disconnected, generatedAt, days, repoId, now = new Date() }: Props) {
  const wide = useWide();
  const weeks = areas[0]?.weekly.length || Math.ceil(days / 7);
  const caption = `영역별 최근 ${weeks}주 활동과 리뷰 대기`;
  const href = (a: Area) => areaHref(a.id, { repoId, days });
  const bars = (a: Area) => <WeeklyBars weekly={a.weekly} generatedAt={generatedAt} days={days} />;
  const unknownBars = <WeeklyBars weekly={[]} generatedAt={generatedAt} days={days} state="unknown" weekCount={weeks} />;

  if (!wide) {
    return (
      <ul aria-label={caption} className="divide-y divide-border border-y border-border text-body-sm">
        {areas.map((a) => (
          <li key={a.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
              {/* 이름·막대·리뷰 대기가 한 줄, 폭이 모자라면 줄바꿈 */}
              <Link to={href(a)} className={`${linkCls} min-w-0`}>{a.displayName}</Link>
              {bars(a)}
              <WaitCount a={a} now={now} />
            </div>
            <Meta a={a} all={areas} />
            <p className="flex flex-wrap gap-x-3">
              <Trend a={a} />
              <span>마지막 변경 {relativeDay(a.lastChangeAt, now, days)}</span>
            </p>
            <NoActivitySignal a={a} />
          </li>
        ))}
        {disconnected.map((al) => (
          <li key={`alias-${al.id}`} className="space-y-2 py-3">
            <p className="font-semibold wrap-anywhere">
              {al.displayName}
              <GoneBadge />
            </p>
            {unknownBars}
            <GoneNote al={al} />
          </li>
        ))}
      </ul>
    );
  }

  const th = 'px-2 py-2 text-left font-semibold';
  const td = 'px-2 py-3';
  return (
    <table className="w-full table-fixed border-collapse text-body-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border-strong">
          <th scope="col" className={`${th} w-1/4`}>영역</th>
          <th scope="col" className={th}>주간 활동</th>
          <th scope="col" className={`${th} w-24`}>추세</th>
          <th scope="col" className={`${th} w-28`}>마지막 변경</th>
          <th scope="col" className={`${th} w-40`}>리뷰 대기</th>
        </tr>
      </thead>
      <tbody>
        {areas.map((a) => (
          <tr key={a.id} className="border-b border-border align-top">
            <th scope="row" className={`${td} text-left font-normal`}>
              <Link to={href(a)} className={linkCls}>{a.displayName}</Link>
              <Meta a={a} all={areas} />
            </th>
            <td className={td}>{bars(a)}</td>
            <td className={td}><Trend a={a} /></td>
            <td className={td}>{relativeDay(a.lastChangeAt, now, days)}</td>
            <td className={`${td} space-y-1`}>
              <WaitCount a={a} now={now} />
              <NoActivitySignal a={a} />
            </td>
          </tr>
        ))}
        {disconnected.map((al) => (
          <tr key={`alias-${al.id}`} className="border-b border-border align-top">
            <th scope="row" className={`${td} text-left`}>
              <span className="wrap-anywhere">{al.displayName}</span>
              <GoneBadge />
            </th>
            <td className={td}>{unknownBars}</td>
            <td colSpan={3} className={`${td} space-y-1`}><GoneNote al={al} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
