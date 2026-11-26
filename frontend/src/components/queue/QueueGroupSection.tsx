import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { WAITING_RENDER_CAP } from '../../lib/reviewQueue';

export function QueueGroupSection<T extends { id: string }>({
  id,
  title,
  hint,
  items,
  defaultOpen,
  renderItem,
  cap = WAITING_RENDER_CAP,
}: {
  id: string;
  title: string;
  hint?: string;
  items: T[];
  defaultOpen: boolean;
  renderItem: (item: T) => ReactNode;
  cap?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [all, setAll] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const focusFrom = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (focusFrom.current === null) return;
    const row = listRef.current?.children[focusFrom.current];
    focusFrom.current = null;
    const target = row?.querySelector<HTMLElement>('a, button');
    if (target) target.focus();
    else listRef.current?.closest('section')?.querySelector<HTMLElement>('[data-group-heading]')?.focus();
  }, [all]);

  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, cap);
  const rest = items.length - shown.length;
  const listId = `${id}-list`;

  return (
    <section aria-labelledby={`${id}-heading`} className="mb-6">
      <h2 id={`${id}-heading`} tabIndex={-1} data-group-heading className="text-base font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="min-h-6 min-w-6 rounded focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          {title} {items.length}건{hint ? ` · ${hint}` : ''}
        </button>
      </h2>
      <ul id={listId} ref={listRef} hidden={!open}>
        {shown.map(renderItem)}
      </ul>
      {open && rest > 0 && (
        <button
          type="button"
          onClick={() => {
            focusFrom.current = shown.length;
            setAll(true);
          }}
          className="mt-2 min-h-6 min-w-6 rounded text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          더 보기 ({rest}건 더)
        </button>
      )}
    </section>
  );
}
