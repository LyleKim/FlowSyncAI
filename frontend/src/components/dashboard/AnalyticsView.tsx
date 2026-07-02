import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie } from 'recharts';
import { Kanban, CheckCircle2, AlertCircle, TrendingUp, BarChart2, PieChart as PieChartIcon, Percent } from 'lucide-react';
import { Task, TaskStatus, TaskPriority } from '../../types';

interface AnalyticsViewProps {
  tasks: Task[];
}

export default function AnalyticsView({ tasks }: AnalyticsViewProps) {
  // Compute key stats
  const stats = useMemo(() => {
    const total = tasks.length;
    const todo = tasks.filter((t) => t.status === 'todo').length;
    const inprogress = tasks.filter((t) => t.status === 'inprogress').length;
    const review = tasks.filter((t) => t.status === 'review').length;
    const done = tasks.filter((t) => t.status === 'done').length;

    // Checklist stats
    let totalSubtasks = 0;
    let completedSubtasks = 0;
    tasks.forEach((t) => {
      totalSubtasks += t.subtasks.length;
      completedSubtasks += t.subtasks.filter((s) => s.completed).length;
    });

    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    const checklistRate = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

    return {
      total,
      todo,
      inprogress,
      review,
      done,
      completionRate,
      checklistRate,
      totalSubtasks,
      completedSubtasks
    };
  }, [tasks]);

  // Format data for Recharts - Tasks by Status
  const statusData = useMemo(() => {
    return [
      { name: 'To Do', value: stats.todo, color: '#64748b' },
      { name: 'In Progress', value: stats.inprogress, color: '#3b82f6' },
      { name: 'In Review', value: stats.review, color: '#d97706' },
      { name: 'Completed', value: stats.done, color: '#10b981' }
    ];
  }, [stats]);

  // Format data for Recharts - Tasks by Priority
  const priorityData = useMemo(() => {
    const high = tasks.filter((t) => t.priority === 'high').length;
    const medium = tasks.filter((t) => t.priority === 'medium').length;
    const low = tasks.filter((t) => t.priority === 'low').length;

    return [
      { name: 'High', value: high, color: '#f43f5e' },
      { name: 'Medium', value: medium, color: '#fbbf24' },
      { name: 'Low', value: low, color: '#3b82f6' }
    ];
  }, [tasks]);

  // Format data for Recharts - Tasks by Category
  const categoryData = useMemo(() => {
    const categories: { [key: string]: number } = {};
    tasks.forEach((t) => {
      categories[t.category] = (categories[t.category] || 0) + 1;
    });

    return Object.entries(categories).map(([name, value]) => ({
      name,
      value,
      color: '#60a5fa'
    }));
  }, [tasks]);

  return (
    <div className="space-y-8 pb-12" id="analytics-view">
      {/* Visual KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" id="stats-grid">
        {/* Total Tasks Card */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 flex items-center justify-center text-slate-500 dark:text-slate-400">
            <BarChart2 size={20} />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 tracking-wider">Total Tasks</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-sans mt-0.5">{stats.total}</p>
          </div>
        </div>

        {/* Active In Progress Card */}
        <div className="p-5 rounded-xl border border-blue-100 dark:border-blue-950/40 bg-blue-50/5 dark:bg-blue-950/10 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-100/40 dark:bg-blue-950/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Kanban size={18} />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase text-blue-400 dark:text-blue-500 tracking-wider">In Progress</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 font-sans mt-0.5">{stats.inprogress}</p>
          </div>
        </div>

        {/* Completion Progress Card */}
        <div className="p-5 rounded-xl border border-emerald-100 dark:border-emerald-950/40 bg-emerald-50/5 dark:bg-emerald-950/10 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-100/40 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={18} />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-mono uppercase text-emerald-400 dark:text-emerald-500 tracking-wider">Completed Tasks</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-sans">{stats.done}</span>
              <span className="text-[11px] font-semibold text-emerald-500 font-mono">({stats.completionRate}%)</span>
            </div>
          </div>
        </div>

        {/* Checklist Completion Card */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 flex items-center justify-center text-blue-500">
            <Percent size={18} />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 tracking-wider">Checklist Items Done</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-sans">
                {stats.completedSubtasks}
              </span>
              <span className="text-[11px] font-semibold text-blue-500 font-mono">({stats.checklistRate}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recharts Charts Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="charts-grid">
        {/* Status Distribution - Column Bar Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <BarChart2 size={16} className="text-blue-600" />
            <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider font-sans">Tasks by Status Stage</h3>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: '#f1f5f9', opacity: 0.4 }}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={45}>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Priority Breakdown - Pie Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <PieChartIcon size={16} className="text-blue-600" />
            <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider font-sans">Tasks Priority Levels</h3>
          </div>
          <div className="h-64 w-full flex items-center justify-center">
            {stats.total === 0 ? (
              <p className="text-xs text-slate-400">No priority data available</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={priorityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {priorityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px'
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
