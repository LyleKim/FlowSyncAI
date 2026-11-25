import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError, connectRepo, type ConnectedRepo } from '../../services/connectedReposApi';

interface Props {
  onConnected: (repo: ConnectedRepo, alreadyConnected: boolean) => void;
  autoFocus?: boolean;
}

const SAVE_FAILED = '저장하지 못했어요';
const SAVE_FAILED_BODY = '입력한 내용은 그대로 두었어요. 잠시 후 다시 시도해 주세요.';

export default function ConnectRepoForm({ onConnected, autoFocus }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [invalid, setInvalid] = useState('');
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (adding) return;
    setInvalid('');
    setFailed(false);
    setNotice('');
    if (!url.trim()) {
      setInvalid('레포 주소를 입력해 주세요');
      return;
    }
    setAdding(true);
    try {
      const { repo, alreadyConnected } = await connectRepo(url.trim());
      setUrl('');
      if (alreadyConnected) setNotice('이미 연결된 레포예요');
      onConnected(repo, alreadyConnected);
    } catch (err) {
      // 4xx는 서버 문장을 입력 오류로, 그 외(네트워크·5xx)는 저장 실패로 알린다. 입력값은 둘 다 유지.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) setInvalid(err.message);
      else setFailed(true);
    } finally {
      setAdding(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">레포 추가</label>
      <div className="flex gap-2">
        <input
          id={id}
          ref={inputRef}
          value={url}
          onChange={(e) => { setUrl(e.target.value); setInvalid(''); }}
          placeholder="github.com/owner/name"
          aria-invalid={!!invalid}
          aria-describedby={invalid ? `${id}-err` : undefined}
          className="min-h-9 w-full min-w-0 max-w-md rounded border border-border bg-surface-raised px-3 text-sm"
        />
        <button type="submit" aria-disabled={adding} className="min-h-9 shrink-0 rounded bg-accent px-3 text-sm font-medium text-accent-contrast aria-disabled:opacity-60">
          {adding ? '추가하는 중…' : '추가'}
        </button>
      </div>
      {invalid && <p id={`${id}-err`} role="alert" className="text-sm text-danger">{invalid}</p>}
      {failed && (
        <p role="alert" className="text-sm text-danger">
          <span className="font-medium">{SAVE_FAILED}</span> {SAVE_FAILED_BODY}
        </p>
      )}
      {notice && <p role="status" className="text-sm text-muted">{notice}</p>}
    </form>
  );
}
