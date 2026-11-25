import { useEffect, useRef, useState } from 'react';
import { useTasksContext } from '../../hooks/TasksContext';
import { formatDate } from '../../lib/date';
import type { Task } from '../../types';

const ROLES = ['개발자', '디자이너', '기획자', 'QA'];
const CUSTOM = '__custom';
const btn = 'min-h-6 rounded border border-border px-3 py-1.5 text-body-sm focus-visible:outline-2 focus-visible:outline-focus-ring aria-disabled:opacity-60';
const field = 'min-h-6 rounded border border-border bg-surface px-2 text-body-sm';
const lbl = 'flex flex-col gap-1 text-body-sm';

export function ReviewSection({ task }: { task: Task }) {
  const { addReview, updateReview, deleteReview } = useTasksContext();
  const reviews = task.roleReviews ?? [];
  // 초안은 섹션 로컬 state: 폴링으로 task가 바뀌어도 리셋되지 않는다.
  const [role, setRole] = useState(ROLES[0]);
  const [custom, setCustom] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const adding = useRef(false);

  const submit = async () => {
    const text = comment.trim();
    const roleName = (role === CUSTOM ? custom : role).trim();
    if (adding.current) return;
    if (!text || !roleName) { setError(!roleName ? '역할을 입력해 주세요.' : '검토 내용을 입력해 주세요.'); return; }
    adding.current = true;
    setError('');
    try {
      const r = await addReview(task.id, {
        role: roleName, comment: text, urgency: urgent ? 'urgent' : 'normal',
        ...(reviewer.trim() && { reviewerId: reviewer.trim() }),
      });
      if (!alive.current) return;
      if (r.ok) { setComment(''); setReviewer(''); setUrgent(false); setCustom(''); }
      else setError(`${(r as { error: string }).error} 입력한 내용은 그대로 남아 있어요.`);
    } finally {
      adding.current = false;
    }
  };

  return (
    <details className="mt-4 border-t border-border pt-3">
      <summary className="min-h-6 cursor-pointer text-body-sm font-medium">역할 검토 ({reviews.length})</summary>
      <div className="mt-3 flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {reviews.map((r) => {
            const who = r.reviewerId || r.role;
            return (
              <li key={r.id} className="flex flex-col gap-1 rounded border border-border p-2">
                <div className="flex flex-wrap items-center gap-2 text-caption">
                  <span className="rounded border border-border px-1.5">{r.role}</span>
                  {r.urgency === 'urgent' && <span className="font-medium text-danger">긴급</span>}
                  {r.reviewerId && <span className="text-muted">{r.reviewerId}</span>}
                  <span className="text-muted">{formatDate(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-body-sm">{r.comment}</p>
                <div className="flex items-center gap-2">
                  {r.isAccepted ? (
                    <span className="text-caption text-success">확인함{r.acceptedAt && ` · ${formatDate(r.acceptedAt)}`}</span>
                  ) : (
                    <button type="button" aria-label={`‘${who}’ 검토 확인함`} onClick={() => void updateReview(task.id, r.id, { isAccepted: true })} className={btn}>확인함</button>
                  )}
                  <button type="button" aria-label={`‘${who}’ 검토 삭제`} onClick={() => void deleteReview(task.id, r.id)} className={`${btn} text-danger`}>삭제</button>
                </div>
              </li>
            );
          })}
        </ul>
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="rv-role" className={lbl}>역할
              <select id="rv-role" value={role} onChange={(e) => setRole(e.target.value)} className={field}>
                {ROLES.map((x) => <option key={x} value={x}>{x}</option>)}
                <option value={CUSTOM}>직접 입력</option>
              </select>
            </label>
            {role === CUSTOM && (
              <label htmlFor="rv-custom" className={lbl}>역할 이름
                <input id="rv-custom" value={custom} onChange={(e) => setCustom(e.target.value)} className={field} />
              </label>
            )}
            <label htmlFor="rv-reviewer" className={lbl}>검토자
              <input id="rv-reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)} className={field} />
            </label>
            <label htmlFor="rv-urgency" className={lbl}>긴급도
              <select id="rv-urgency" value={urgent ? 'urgent' : 'normal'} onChange={(e) => setUrgent(e.target.value === 'urgent')} className={field}>
                <option value="normal">보통</option>
                <option value="urgent">긴급</option>
              </select>
            </label>
          </div>
          <label htmlFor="rv-comment" className={lbl}>내용
            <textarea id="rv-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className={field} />
          </label>
          {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
          <button type="submit" className={`${btn} self-start`}>검토 추가</button>
        </form>
      </div>
    </details>
  );
}
