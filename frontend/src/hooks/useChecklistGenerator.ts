import { useEffect, useRef, useState } from 'react';
import { AiChecklistError, generateChecklist } from '../services/aiApi';
import { useTasksContext } from './TasksContext';
import type { Task } from '../types';

const MSG_UPSTREAM = 'AI 서버가 응답하지 않았어요. 잠시 뒤에 다시 시도해 주세요.';
const MSG_OTHER = '체크리스트를 제안받지 못했어요. 잠시 뒤에 다시 시도해 주세요.';

/** 제안 → replaceSubtasks(PUT). 저장 실패는 replaceSubtasks가 이미 알리므로 여기서 다시 알리지 않는다. */
export function useChecklistGenerator(task: Task) {
  const { replaceSubtasks } = useTasksContext();
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const generate = async () => {
    if (busy.current) return;
    busy.current = true;
    setState('loading');
    setError(null);
    try {
      const items = await generateChecklist({ title: task.title, description: task.description, roleReviews: task.roleReviews ?? [] });
      await replaceSubtasks(task.id, items);
      if (alive.current) setState('idle');
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof AiChecklistError && e.kind === 'upstream' ? MSG_UPSTREAM : MSG_OTHER);
      setState('error');
    } finally {
      busy.current = false;
    }
  };
  return { generate, state, error };
}
