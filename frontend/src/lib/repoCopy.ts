import type { RepoError } from '../types/repoSync';
import { minutesAgo } from './date';

const pad = (n: number) => String(n).padStart(2, '0');

export function formatClock(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatFetched(iso: string | null, now: Date = new Date()): string {
  if (!iso || isNaN(Date.parse(iso))) return '아직 가져온 적 없어요';
  const min = minutesAgo(iso, now);
  if (min < 1) return '방금 가져옴';
  if (min < 60) return `${min}분 전 가져옴`;
  if (min < 1440) return `${Math.floor(min / 60)}시간 전 가져옴`;
  return `${Math.floor(min / 1440)}일 전 가져옴`;
}

export interface RepoErrorView {
  title: string;
  body: string;
  canRetry: boolean;
  retryDisabledReason?: string;
  adminCopy?: string;
  canDisconnect: boolean;
}

export function describeRepoError(
  repo: string,
  err: RepoError,
  lastSuccessAt: string | null,
  now: Date = new Date(),
): RepoErrorView {
  const since = lastSuccessAt && formatClock(lastSuccessAt);
  const listAsOf = since ? `목록은 ${since} 기준이에요.` : '아직 가져온 적이 없어요.';
  const admin = `${repo} 레포를 읽지 못했어요. 서버의 GITHUB_TOKEN을 확인해 주세요. (${err.message})`;
  switch (err.kind) {
    case 'auth':
      return {
        title: '서버의 GitHub 토큰이 거부됐어요',
        body: '이 문제는 앱에서 해결할 수 없어요. 아래 내용을 서버 관리자에게 전달해 주세요.',
        canRetry: false,
        adminCopy: admin,
        canDisconnect: false,
      };
    case 'rate_limit': {
      const reset = err.resetAt ? formatClock(err.resetAt) : '';
      const future = !!err.resetAt && Date.parse(err.resetAt) > now.getTime();
      return {
        title: 'GitHub 호출 한도에 도달했어요',
        body: `${reset ? `${reset} 이후` : '잠시 뒤'} 다시 가져올 수 있어요. 그때까지 ${listAsOf}`,
        canRetry: true,
        retryDisabledReason: future && reset ? `${reset}부터 가능` : undefined,
        canDisconnect: false,
      };
    }
    case 'not_found':
      return {
        title: `${repo} 레포를 읽을 수 없어요`,
        body: '레포가 없어졌거나 서버 토큰에 읽기 권한이 없을 수 있어요.',
        canRetry: true,
        adminCopy: admin,
        canDisconnect: true,
      };
    case 'upstream':
      return {
        title: 'GitHub가 응답하지 않았어요',
        body: `잠시 뒤에 다시 시도해 주세요. ${listAsOf}`,
        canRetry: true,
        canDisconnect: false,
      };
    default:
      return {
        title: `${repo}를 가져오지 못했어요`,
        body: `잠시 뒤에 다시 시도해 주세요. ${listAsOf}`,
        canRetry: true,
        canDisconnect: true,
      };
  }
}
