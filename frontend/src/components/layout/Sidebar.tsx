import React from 'react';
import { Kanban, ListTodo, BarChart3, Users, CheckSquare, Clock } from 'lucide-react';

interface SidebarProps {
  activeTab: 'board' | 'list' | 'analytics';
  setActiveTab: (tab: 'board' | 'list' | 'analytics') => void;
  taskCounts: {
    all: number;
    todo: number;
    inprogress: number;
    review: number;
    done: number;
  };
}

export default function Sidebar({ activeTab, setActiveTab, taskCounts }: SidebarProps) {
  const navItems = [
    {
      id: 'board' as const,
      label: '칸반 보드',
      icon: Kanban,
      badge: taskCounts.all - taskCounts.done
    },
    {
      id: 'list' as const,
      label: '모든 작업',
      icon: ListTodo,
      badge: taskCounts.all
    },
    {
      id: 'analytics' as const,
      label: '분석',
      icon: BarChart3,
      badge: null
    }
  ];

  return (
    <aside className="w-64 bg-slate-900 flex flex-col h-full shrink-0" id="app-sidebar">
      {/* Brand Logo */}
      <div className="h-16 flex items-center px-6 border-b border-slate-850 gap-3 shrink-0">
        <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
          <CheckSquare size={18} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="font-sans font-bold text-white tracking-tight leading-none text-base">
            FlowSync AI
          </h1>
          <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase mt-1 block">
            v1.0.0 Stable
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-1">
        <div className="px-3 mb-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">메인 메뉴</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              id={`sidebar-tab-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer ${
                isActive
                   ? 'bg-blue-600/10 text-blue-400 border-r-4 border-blue-500 rounded-r-none'
                   : 'text-slate-400 hover:text-white hover:bg-slate-800 transition-colors'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon size={16} className={isActive ? 'text-blue-400' : 'text-slate-400 opacity-60'} />
                <span>{item.label}</span>
              </div>
              {item.badge !== null && item.badge > 0 && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                  isActive ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-800 text-slate-400'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
