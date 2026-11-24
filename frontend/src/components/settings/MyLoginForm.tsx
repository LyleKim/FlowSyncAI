import { useId, useState, type FormEvent } from 'react';
import { normalizeLogin } from '../../lib/storage';
import { useMyLogin } from '../../hooks/useMyLogin';

export default function MyLoginForm({ initial = '', onSaved }: { initial?: string; onSaved: (login: string) => void }) {
  const id = useId();
  const { save } = useMyLogin();
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const preview = normalizeLogin(value);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const login = save(value);
    setInvalid(!login);
    if (login) onSaved(login);
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">내 GitHub 로그인</label>
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => { setValue(e.target.value); setInvalid(false); }}
          aria-invalid={invalid}
          aria-describedby={`${id}-hint`}
          className="min-h-9 w-64 rounded border border-border bg-surface-raised px-3 text-sm"
        />
        <button type="submit" className="min-h-9 rounded bg-accent px-3 text-sm font-medium text-accent-contrast">저장</button>
      </div>
      <p id={`${id}-hint`} className={invalid ? 'text-sm text-danger' : 'text-sm text-muted'}>
        {invalid
          ? 'GitHub 로그인은 영문·숫자·하이픈만 쓸 수 있어요'
          : preview ? `${preview}으로 저장돼요` : ' '}
      </p>
    </form>
  );
}
