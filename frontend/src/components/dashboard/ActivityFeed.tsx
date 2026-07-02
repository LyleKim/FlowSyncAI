import React from 'react';
import { History, CheckCircle, ArrowRight, Play, Sparkles } from 'lucide-react';
import { Activity } from '../../types';

interface ActivityFeedProps {
  activities: Activity[];
}

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  const getActionIcon = (action: string) => {
    switch (action) {
      case 'completed':
        return <CheckCircle size={12} className="text-emerald-500" />;
      case 'moved':
      case 'started':
        return <ArrowRight size={12} className="text-blue-500" />;
      case 'created':
        return <Sparkles size={12} className="text-amber-500" />;
      default:
        return <Play size={12} className="text-slate-400" />;
    }
  };

  return (
    <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col h-full shrink-0 overflow-y-auto" id="app-activity-feed">
      {/* Feed Header */}
      <div className="flex items-center gap-2 pb-4 border-b border-slate-100 dark:border-slate-800 mb-6">
        <History size={16} className="text-slate-500" />
        <h3 className="font-sans font-bold text-slate-800 dark:text-slate-100 text-sm leading-none">
          활동 스트림
        </h3>
      </div>

      {/* Chronological List of activities */}
      {activities.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-slate-400 dark:text-slate-500">
          <p className="text-xs">최근 활동 기록이 없습니다</p>
        </div>
      ) : (
        <div className="flex-1 space-y-5">
          {activities.map((act) => (
            <div key={act.id} className="flex gap-3 relative" id={`activity-item-${act.id}`}>
              {/* Profile Avatar / Initials */}
              <div className={`w-8 h-8 rounded-full ${act.userAvatarColor} text-white flex items-center justify-center font-bold text-[10px] shrink-0 shadow-sm relative z-10`}>
                {act.userAvatarText}
              </div>

              {/* Activity details */}
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-normal">
                  <span className="font-bold text-slate-800 dark:text-slate-200">{act.userName}</span>{' '}
                  <span className="text-slate-500 dark:text-slate-400">{act.action}</span>{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate inline-block max-w-full align-bottom">
                    "{act.targetName}"
                  </span>
                </p>
                
                {/* Meta details with icon */}
                <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-mono text-slate-400 dark:text-slate-500">
                  {getActionIcon(act.action)}
                  <span>{act.timestamp}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
