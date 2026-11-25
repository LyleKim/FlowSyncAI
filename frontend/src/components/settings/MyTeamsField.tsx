import { useId, useState, type FormEvent } from 'react';
import { MAX_TEAMS } from '../../lib/storage';
import { useMyTeams } from '../../hooks/useMyLogin';

export default function MyTeamsField() {
  const id = useId();
  const { teams, save } = useMyTeams();
  const [value, setValue] = useState(teams.join(', '));
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const res = save(value);
    setStatus('');
    if (res.ok) {
      setError('');
      setStatus(res.teams.length ? `내 팀 ${res.teams.length}개를 저장했어요` : '내 팀을 비웠어요');
    } else if (res.invalid.length) {
      setError(`‘${res.invalid[0]}’은 org/팀이름 형식이 아니에요`);
    } else {
      setError(`팀은 ${MAX_TEAMS}개까지 넣을 수 있어요`);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">내 팀 (선택)</label>
      <p id={`${id}-hint`} className="text-sm text-muted">
        팀에게 요청된 리뷰도 내 리뷰 요청에 보여요. 예: acme/backend, acme/core. 서버가 팀 멤버십을 알지 못해서 직접 알려 주셔야 해요. 이 브라우저에만 저장돼요.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(''); setStatus(''); }}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint ${id}-err`}
          className="min-h-9 min-w-40 max-w-64 flex-1 rounded border border-border bg-surface-raised px-3 text-sm"
        />
        <button type="submit" className="min-h-9 rounded bg-accent px-3 text-sm font-semibold text-accent-contrast">팀 저장</button>
      </div>
      {error && <p id={`${id}-err`} role="alert" className="text-sm text-danger">{error}</p>}
      <p role="status" className="text-sm text-muted">{status}</p>
    </form>
  );
}
