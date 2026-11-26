import { useCallback, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { STATUS_LABEL } from '../lib/taskLabels';
import { DEFAULT_VIEW_STATE, parseTaskViewParams, toTaskViewParams, type TaskViewState } from '../lib/taskView';

const FILTER_KEYS = ['q', 'status', 'kind', 'assignee'] as const;
const CLEARED = { q: '', status: 'all', kind: 'all', assignee: '' } as const;
const KIND_LABEL = { pr: '리뷰 요청', manual: '직접 만든 작업' } as const;
const ASSIGNEE_LABEL: Record<string, string> = { me: '나', none: '없음' };

export function useTaskView() {
  const [sp, setSp] = useSearchParams();
  const { search } = useLocation();
  const state = useMemo(() => parseTaskViewParams(sp), [sp]);

  const set = useCallback(
    (patch: Partial<TaskViewState>, opts?: { replace?: boolean }) =>
      setSp(toTaskViewParams({ ...state, ...patch }), { replace: opts?.replace ?? false }),
    [state, setSp],
  );
  const clearFilters = useCallback(() => set(CLEARED), [set]);

  const activeFilters = useMemo(() => {
    const label = (k: (typeof FILTER_KEYS)[number]): string => {
      switch (k) {
        case 'q': return `검색어 “${state.q}”`;
        case 'status': return `상태 ${STATUS_LABEL[state.status as keyof typeof STATUS_LABEL]}`;
        case 'kind': return `출처 ${KIND_LABEL[state.kind as keyof typeof KIND_LABEL]}`;
        default: return `담당자 ${ASSIGNEE_LABEL[state.assignee] ?? state.assignee}`;
      }
    };
    return FILTER_KEYS.filter(k => state[k] !== DEFAULT_VIEW_STATE[k]).map(key => ({ key, label: label(key) }));
  }, [state]);

  const filter = useMemo(
    () => ({ q: state.q, status: state.status, kind: state.kind, assignee: state.assignee }),
    [state.q, state.status, state.kind, state.assignee],
  );
  return { state, filter, search, set, clearFilters, activeFilters };
}
