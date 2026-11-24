import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  role?: 'dialog' | 'alertdialog';
  initialFocusRef?: RefObject<HTMLElement | null>;
  size?: 'md' | 'lg';
  children: ReactNode;
}

// 네이티브 <dialog>+showModal: 배경 비활성화·Tab 가둠·포커스 복귀는 브라우저가 한다.
export function Dialog({ open, onClose, title, role = 'dialog', initialFocusRef, size = 'md', children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      (initialFocusRef?.current ?? titleRef.current)?.focus();
    } else if (!open && d.open) d.close();
  }, [open, initialFocusRef]);

  // Esc -> cancel. 입력 필드 안에서 발생해도 잡도록 네이티브 리스너(버블 포함)로 건다.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    d.addEventListener('cancel', onCancel);
    return () => {
      d.removeEventListener('cancel', onCancel);
      if (d.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget && role === 'dialog') onClose();
      }}
      className={`m-auto w-full rounded-lg border border-border bg-surface p-0 text-text backdrop:bg-black/50 ${size === 'lg' ? 'max-w-3xl' : 'max-w-xl'}`}
    >
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">{title}</h2>
          <button type="button" aria-label="닫기" onClick={onClose} className="-m-2 flex min-h-11 min-w-11 items-center justify-center rounded focus-visible:outline-2">×</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
