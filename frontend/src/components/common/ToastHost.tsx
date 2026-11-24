import { useEffect, useState, type FC } from 'react';
import { useToastContext, type ToastItem } from '../../hooks/useToasts';

function Remaining({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="text-xs text-text-muted">{Math.max(0, Math.ceil((deadline - now) / 1000))}초 남음</span>;
}

const Toast: FC<{ t: ToastItem; dismiss(id: number): void }> = ({ t, dismiss }) => {
  return (
    <div role={t.kind === 'error' ? 'alert' : 'status'} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-lg">
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

export function ToastHost() {
  const { toasts, dismiss } = useToastContext();
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex flex-col gap-2 md:left-auto md:w-96">
      {toasts.map((t) => <Toast key={t.id} t={t} dismiss={dismiss} />)}
    </div>
  );
}
