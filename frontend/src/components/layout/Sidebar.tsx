import type { FC } from 'react';
import { NavLink } from 'react-router';
import { CheckSquare, Inbox, ListTodo, Network, Settings, type LucideIcon } from 'lucide-react';
import { ROUTES, SCREEN_TITLES } from '../../routes';

const ITEMS: { to: string; icon: LucideIcon }[] = [
  { to: ROUTES.me, icon: Inbox },
  { to: ROUTES.areas, icon: Network },
  { to: ROUTES.tasks, icon: ListTodo },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-6 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-focus-ring ${
    isActive ? 'bg-surface-sunken text-accent' : 'text-muted hover:text-text'
  }`;

// 일반 함수 컴포넌트로 두면 tsc가 key prop을 TS2322로 거부해 FC로 선언한다(이 저장소에는 @types/react가 없다).
const Item: FC<{ to: string; icon: LucideIcon; badge?: number }> = ({ to, icon: Icon, badge }) => {
  return (
    <NavLink to={to} className={linkClass}>
      <Icon size={16} aria-hidden="true" />
      <span className="flex-1">{SCREEN_TITLES[to]}</span>
      {badge !== undefined && badge > 0 && (
        <span aria-label={`리뷰 대기 ${badge}건`} className="rounded bg-accent px-2 text-xs font-bold text-accent-contrast">
          {badge}
        </span>
      )}
    </NavLink>
  );
};

// 좁은 폭에서는 상단 가로 내비, md 이상에서만 고정 폭 세로 사이드바.
export default function Sidebar({ reviewBadge }: { reviewBadge?: number }) {
  return (
    <aside className="shrink-0 border-b border-border bg-surface md:flex md:h-full md:w-64 md:flex-col md:border-b-0 md:border-r">
      <div className="flex items-center gap-2 px-4 py-3 font-bold md:h-16 md:px-6">
        <CheckSquare size={18} aria-hidden="true" className="text-accent" />
        <span>FlowSync AI</span>
      </div>
      <nav aria-label="주 메뉴" className="flex gap-1 overflow-x-auto px-3 pb-2 md:flex-1 md:flex-col md:py-4">
        {ITEMS.map((it) => (
          <Item key={it.to} {...it} badge={it.to === ROUTES.me ? reviewBadge : undefined} />
        ))}
        <div className="md:mt-auto">
          <Item to={ROUTES.settings} icon={Settings} />
        </div>
      </nav>
    </aside>
  );
}
