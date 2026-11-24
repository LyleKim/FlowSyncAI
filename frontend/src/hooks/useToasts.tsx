import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export const UNDO_WINDOW_MS = 10_000;

export type ToastKind = 'info' | 'error';
export interface UndoAction {
  label: string;
  /** 같은 key를 가진 목록이 항목을 숨기도록 usePendingIds()로 노출된다. */
  key?: string;
  hide(): void;
  restore(): void;
  commit(): Promise<{ ok: boolean; error?: string }>;
  windowMs?: number;
}
export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  undo?: { deadline: number; onUndo(): void };
}

interface ToastApi {
  notify(message: string, kind?: ToastKind): void;
  dismiss(id: number): void;
  schedule(a: UndoAction): void;
  pendingIds: ReadonlySet<string>;
  toasts: ToastItem[];
}

const ToastContext = createContext<ToastApi | null>(null);

interface Pending {
  action: UndoAction;
  toastId: number;
  timer: ReturnType<typeof setTimeout>;
}

// 대기 상태는 Provider에 둔다. 컴포넌트 언마운트·라우트 이동은 창에 영향을 주지 않는다(R2).
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const nextId = useRef(1);
  const pending = useRef(new Map<number, Pending>());

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, kind }]);
    if (kind === 'info') setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  const syncKeys = useCallback(() => {
    setPendingIds(new Set([...pending.current.values()].flatMap((p) => (p.action.key ? [p.action.key] : []))));
  }, []);

  const settle = useCallback((id: number) => {
    const p = pending.current.get(id);
    if (!p) return undefined;
    clearTimeout(p.timer);
    pending.current.delete(id);
    dismiss(p.toastId);
    return p;
  }, [dismiss]);

  const commitPending = useCallback(async (id: number) => {
    const p = settle(id);
    if (!p) return;
    let res: { ok: boolean; error?: string };
    try { res = await p.action.commit(); } catch { res = { ok: false }; }
    if (!res.ok) {
      p.action.restore();
      notify(res.error ?? `${p.action.label} 처리에 실패해 원래대로 되돌렸어요. 잠시 후 다시 시도해 주세요.`, 'error');
    }
    syncKeys();
  }, [settle, notify, syncKeys]);

  const schedule = useCallback((action: UndoAction) => {
    const id = nextId.current++;
    const windowMs = action.windowMs ?? UNDO_WINDOW_MS;
    action.hide();
    const timer = setTimeout(() => void commitPending(id), windowMs);
    pending.current.set(id, { action, toastId: id, timer });
    const undo = () => { if (settle(id)) { action.restore(); syncKeys(); } };
    setToasts((t) => [...t, { id, message: action.label, kind: 'info', undo: { deadline: Date.now() + windowMs, onUndo: undo } }]);
    syncKeys();
  }, [commitPending, settle, syncKeys]);

  // 탭을 떠날 때만 대기 항목을 즉시 commit한다(언마운트에서는 하지 않음).
  useEffect(() => {
    const flush = () => [...pending.current.keys()].forEach((id) => void commitPending(id));
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [commitPending]);

  // Provider가 사라질 때 타이머만 정리한다(commit 안 함).
  useEffect(() => () => pending.current.forEach((p) => clearTimeout(p.timer)), []);

  const value = useMemo(() => ({ notify, dismiss, schedule, pendingIds, toasts }), [notify, dismiss, schedule, pendingIds, toasts]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToastContext(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts는 ToastProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}

export function useToasts(): { notify(message: string, kind?: ToastKind): void } {
  const { notify } = useToastContext();
  return useMemo(() => ({ notify }), [notify]);
}
