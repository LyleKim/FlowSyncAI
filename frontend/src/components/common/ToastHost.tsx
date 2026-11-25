import { useEffect, useState, type FC } from 'react';
import { useToastContext, type ToastItem } from '../../hooks/useToasts';

function Remaining({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span aria-hidden="true" data-testid="undo-countdown" className="text-xs text-muted">{Math.max(0, Math.ceil((deadline - now) / 1000))}초 남음</span>;
}

const Toast: FC<{ t: ToastItem; dismiss(id: number): void }> = ({ t, dismiss }) => {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-lg">
      <span className="flex-1">{t.message}</span>
      {t.undo && (
        <>
          <Remaining deadline={t.undo.deadline} />
          <button type="button" onClick={t.undo.onUndo} className="min-h-6 min-w-6 rounded px-2 font-semibold underline focus-visible:outline-2">되돌리기</button>
        </>
      )}
      {t.kind === 'error' && (
        <button type="button" aria-label="알림 닫기" onClick={() => dismiss(t.id)} className="min-h-6 min-w-6 rounded px-1 focus-visible:outline-2">×</button>
      )}
    </div>
  );
};

// live region은 처음부터 마운트된 한 쌍(status·alert)이다. 이미 글자가 든 채 새로 끼워 넣은 role 요소는
// 스크린 리더가 놓치기 쉬워서, 토스트는 역할 없이 이 두 컨테이너 안에 추가된다.
export function ToastHost() {
  const { toasts, dismiss } = useToastContext();
  const list = (kind: ToastItem['kind']) =>
    toasts.filter((t) => t.kind === kind).map((t) => <Toast key={t.id} t={t} dismiss={dismiss} />);
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex flex-col gap-2 md:left-auto md:w-96">
      <div role="status" className="flex flex-col gap-2 empty:hidden">{list('info')}</div>
      <div role="alert" className="flex flex-col gap-2 empty:hidden">{list('error')}</div>
    </div>
  );
}
