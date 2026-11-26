import type { ReviewQueueItem } from '../types/reviewQueue';
import type { RepoErrorKind, RepoSyncState } from '../types/repoSync';
import type { SyncStatusInfo } from '../services/syncStatus';

export const WAITING_RENDER_CAP = 50;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// 경과 시간을 [값, 단위]로. 파싱 불가는 null, 1분 미만·미래는 0분.
function elapsed(iso: string, now: Date): { n: number; unit: '분' | '시간' | '일' } | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const ms = now.getTime() - t;
  if (ms < MIN) return { n: 0, unit: '분' };
  if (ms < HOUR) return { n: Math.floor(ms / MIN), unit: '분' };
  if (ms < DAY) return { n: Math.floor(ms / HOUR), unit: '시간' };
  return { n: Math.floor(ms / DAY), unit: '일' };
}

export function waitLabel(requestedAt: string, source: ReviewQueueItem['requestedAtSource'], now: Date): string {
  const e = elapsed(requestedAt, now);
  if (!e) return '대기 시간을 알 수 없어요';
  const event = source === 'event';
  if (e.n === 0) return event ? '방금 요청됨' : '방금 올라옴';
  return event ? `요청 후 ${e.n}${e.unit}` : `올라온 지 ${e.n}${e.unit}`;
}

export const waitBasisLabel = (source: ReviewQueueItem['requestedAtSource']): string =>
  source === 'event' ? '리뷰 요청 기준' : 'PR 생성 기준';

export function formatChangeSize(size: ReviewQueueItem['size']): string {
  return size ? `+${size.additions} −${size.deletions} · 파일 ${size.changedFiles}개` : '변경 규모 알 수 없음';
}

export function changeSizeSpoken(size: ReviewQueueItem['size']): string {
  return size
    ? `추가 ${size.additions}줄, 삭제 ${size.deletions}줄, 파일 ${size.changedFiles}개`
    : '변경 규모 알 수 없음';
}

const REVIEW_STATE = {
  APPROVED: '승인함',
  CHANGES_REQUESTED: '변경 요청함',
  COMMENTED: '코멘트 남김',
  DISMISSED: '무효화됨',
} as const;

export function myReviewLabel(r: ReviewQueueItem['myReview'], now: Date): string | null {
  if (!r) return null;
  const e = elapsed(r.submittedAt, now);
  let when = '';
  if (e) {
    when = e.unit === '일' && e.n === 1 ? '어제' : e.n === 0 ? '방금' : `${e.n}${e.unit} 전`;
    when = ` · ${when}`;
  }
  return `내 최신 리뷰: ${REVIEW_STATE[r.state]}${when}`;
}

export function closedBadge(i: Pick<ReviewQueueItem, 'closedReason' | 'mergedWithoutMyReview'>): string {
  if (i.closedReason === 'merged') return i.mergedWithoutMyReview ? '리뷰 없이 머지됨' : '머지됨';
  if (i.closedReason === 'request_withdrawn') return '리뷰 요청이 취소됨';
  return '닫힘';
}

export function splitQueue(items: ReviewQueueItem[], showDrafts: boolean) {
  const draftCount = items.filter((i) => i.isDraft).length;
  const visible = (i: ReviewQueueItem) => showDrafts || !i.isDraft;
  const open = (g: ReviewQueueItem['group']) => items.filter((i) => i.group === g && visible(i));
  const waiting = open('waiting').sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt));
  const awaitingAuthor = open('awaiting_author');
  return {
    waiting,
    awaitingAuthor,
    closed: items.filter((i) => i.group === 'closed'),
    draftCount,
    hiddenDrafts: showDrafts ? 0 : items.filter((i) => i.isDraft && i.group !== 'closed').length,
  };
}

export function summarizeWaiting(waiting: ReviewQueueItem[], now: Date): { count: number; oldestLabel: string | null } {
  const times = waiting.map((i) => Date.parse(i.requestedAt)).filter((t) => !Number.isNaN(t));
  if (!times.length) return { count: waiting.length, oldestLabel: null };
  const e = elapsed(new Date(Math.min(...times)).toISOString(), now)!;
  return { count: waiting.length, oldestLabel: `${e.n}${e.unit}` };
}

const ERROR_PRIORITY: RepoErrorKind[] = ['auth', 'rate_limit', 'not_found', 'upstream', 'unknown'];

export function aggregateSyncStatus(repos: RepoSyncState[], syncing: boolean): SyncStatusInfo {
  const successes = repos.map((r) => r.lastSuccessAt).filter((s): s is string => !!s);
  const lastSuccessAt = successes.length ? successes.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b)) : null;
  const errors = repos.map((r) => r.lastError);
  let error: SyncStatusInfo['error'] = null;
  if (repos.length > 0 && errors.every(Boolean)) {
    const errs = errors as NonNullable<(typeof errors)[number]>[];
    const kind = ERROR_PRIORITY.find((k) => errs.some((e) => e.kind === k)) ?? 'unknown';
    error = { kind };
    if (kind === 'rate_limit') {
      const resets = errs.filter((e) => e.kind === kind && e.resetAt).map((e) => e.resetAt as string);
      error.resetAt = resets.length ? resets.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b)) : null;
    }
  }
  return { lastSuccessAt, syncing, error, truncated: repos.some((r) => r.truncated) };
}
