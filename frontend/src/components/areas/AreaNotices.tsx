import { minutesAgo } from '../../lib/date';
import type { AreasResponse } from '../../types/areas';

export function analyzedAgo(generatedAt: string, now: Date): string {
  const m = minutesAgo(generatedAt, now);
  if (m < 1) return '방금 분석';
  return m < 60 ? `${m}분 전 분석` : `${Math.floor(m / 60)}시간 전 분석`;
}

interface Props {
  data: AreasResponse;
  stale: boolean;
  now: Date;
  onExtend: () => void;
}

const box = 'rounded border border-border bg-surface-sunken p-3 text-body-sm';
const btn =
  'mt-2 min-h-9 rounded border border-border bg-surface-raised px-3 text-body-sm font-medium focus-visible:outline-2 focus-visible:outline-focus-ring';

export function AreaNotices({ data, stale, now, onExtend }: Props) {
  return (
    <>
      {/* 오류가 있을 때만 마운트: 알림은 한 번만 */}
      {stale && (
        <div role="alert" className="rounded border border-danger bg-surface-raised p-3 text-body-sm">
          다시 분석하지 못했어요. 아래는 직전 결과예요({analyzedAgo(data.generatedAt, now)}). 잠시 뒤에 다시 분석해 주세요.
        </div>
      )}
      {data.truncated && (
        <p className={box}>
          최근 {data.analyzedCommits}개만 분석했어요(가장 오래된 주는 일부만 반영). 활동 적음이 분석 한도 때문일 수도 있어요.
        </p>
      )}
      {data.analyzedCommits === 0 && (
        <div className={box}>
          <p>
            최근 {data.days}일 동안 이 레포에 커밋이 없어요. 분석은 정상이에요. 활동이 없다는 뜻이고 끝났다는 뜻은 아니에요.
          </p>
          {data.days < 90 && (
            <button type="button" onClick={onExtend} className={btn}>기간을 90일로 늘리기</button>
          )}
        </div>
      )}
    </>
  );
}
