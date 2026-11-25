import { useEffect, useId, useRef, useState } from 'react';
import { listConnectedRepos, type ConnectedRepo } from '../../services/connectedReposApi';
import { fetchAreaAliases, fetchAreas } from '../../services/areasApi';
import { AliasConflictError, createAreaAlias, deleteAreaAlias, updateAreaAlias } from '../../services/areaAliasesApi';
import { usePendingIds, useUndo } from '../../hooks/useUndo';
import type { AreaAlias } from '../../types/areas';

type RowMsg = { kind: 'saved' } | { kind: 'error' } | { kind: 'conflict'; mine: string; current: string };
const pendingKey = (id: number) => `alias:${id}`;
const STATUS_TEXT = { connected: '연결됨', disconnected: '연결 끊김', unknown: '확인하지 못함' } as const;
const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export default function AreaNamesSection() {
  const id = useId();
  const { schedule } = useUndo();
  const pending = usePendingIds();
  const [repos, setRepos] = useState<ConnectedRepo[] | null>(null);
  const [repoId, setRepoId] = useState<number | null>(null);
  const [aliases, setAliases] = useState<AreaAlias[]>([]);
  const [aliasesFailed, setAliasesFailed] = useState(false);
  const [areaPaths, setAreaPaths] = useState<string[] | 'loading' | 'failed'>('loading');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [msgs, setMsgs] = useState<Record<string, RowMsg>>({});
  const saving = useRef(new Set<string>());

  useEffect(() => {
    listConnectedRepos()
      .then((r) => { setRepos(r); setRepoId(r[0]?.id ?? null); })
      .catch(() => setRepos([]));
  }, []);

  // 별칭은 빠르게, 영역 목록은 느릴 수 있으므로 각각 비동기로 채운다.
  useEffect(() => {
    if (repoId === null) return;
    const ac = new AbortController();
    setAliases([]); setAliasesFailed(false); setAreaPaths('loading'); setDrafts({}); setMsgs({});
    fetchAreaAliases(repoId, ac.signal).then(setAliases).catch((e) => { if (!isAbort(e)) setAliasesFailed(true); });
    fetchAreas(repoId, 30, { signal: ac.signal })
      .then((r) => setAreaPaths(r.areas.map((a) => a.pathPrefix)))
      .catch((e) => { if (!isAbort(e)) setAreaPaths('failed'); });
    return () => ac.abort();
  }, [repoId]);

  const setDraft = (path: string, v: string | undefined) =>
    setDrafts((d) => { const n = { ...d }; if (v === undefined) delete n[path]; else n[path] = v; return n; });
  const setMsg = (path: string, m: RowMsg | undefined) =>
    setMsgs((d) => { const n = { ...d }; if (m === undefined) delete n[path]; else n[path] = m; return n; });
  const upsert = (a: AreaAlias) => setAliases((p) => [...p.filter((x) => x.pathPrefix !== a.pathPrefix), a]);

  const save = async (path: string, alias: AreaAlias | undefined, value: string) => {
    if (repoId === null || saving.current.has(path)) return;
    saving.current.add(path);
    setMsg(path, undefined);
    try {
      const name = value.trim();
      const saved = alias
        ? await updateAreaAlias(repoId, alias.id, name, alias.updatedAt)
        : await createAreaAlias(repoId, path, name);
      upsert(saved);
      setDraft(path, undefined);
      setMsg(path, { kind: 'saved' });
    } catch (e) {
      const server = e instanceof AliasConflictError ? (e.current ?? e.existing) : undefined;
      if (server) {
        // 서버 최신값을 기준으로 삼고 내 입력은 남긴다 → [내 이름으로 저장]은 server.updatedAt으로 PATCH.
        upsert(server);
        setMsg(path, { kind: 'conflict', mine: value, current: server.displayName });
      } else {
        setMsg(path, { kind: 'error' });
      }
    } finally {
      saving.current.delete(path);
    }
  };

  const remove = (alias: AreaAlias) => {
    if (repoId === null) return;
    const rid = repoId;
    setDraft(alias.pathPrefix, undefined);
    setMsg(alias.pathPrefix, undefined);
    schedule({
      label: `‘${alias.displayName}’ 이름을 지웠어요 · 팀 모두에게 적용돼요`,
      key: pendingKey(alias.id),
      hide: () => {},
      restore: () => {},
      commit: async () => {
        try {
          await deleteAreaAlias(rid, alias.id);
          setAliases((p) => p.filter((x) => x.id !== alias.id));
          return { ok: true };
        } catch {
          return { ok: false, error: `‘${alias.displayName}’ 이름을 지우지 못해 원래대로 되돌렸어요. 잠시 후 다시 시도해 주세요.` };
        }
      },
    });
  };

  const areasKnown = Array.isArray(areaPaths) ? areaPaths : [];
  const liveAliases = aliases.filter((a) => !pending.has(pendingKey(a.id)));
  const byPath = new Map<string, AreaAlias>(liveAliases.map((a) => [a.pathPrefix, a]));
  const paths = [...areasKnown, ...liveAliases.map((a) => a.pathPrefix).filter((p) => !areasKnown.includes(p))];

  const statusOf = (path: string, alias: AreaAlias | undefined): keyof typeof STATUS_TEXT => {
    if (areasKnown.includes(path)) return 'connected';
    if (areaPaths === 'failed') return 'unknown';
    if (areaPaths === 'loading') return alias?.status ?? 'unknown';
    return alias?.status === 'unknown' ? 'unknown' : 'disconnected';
  };

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-3">
      <h2 id={`${id}-h`} className="text-base font-semibold">영역 이름</h2>
      <p className="text-sm text-muted">폴더 이름 대신 팀이 부르는 이름을 붙여요. 팀 전체에 공유돼요.</p>
      {repos === null ? (
        <p className="text-sm text-muted">불러오는 중이에요</p>
      ) : repos.length === 0 ? (
        <p className="text-sm">연결된 레포가 있으면 영역 이름을 붙일 수 있어요</p>
      ) : (
        <>
          {repos.length > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor={`${id}-repo`}>레포</label>
              <select id={`${id}-repo`} value={repoId ?? ''} onChange={(e) => setRepoId(Number(e.target.value))}
                className="min-h-9 rounded border border-border bg-surface px-2">
                {repos.map((r) => <option key={r.id} value={r.id}>{r.owner}/{r.name}</option>)}
              </select>
            </div>
          )}
          {areaPaths === 'loading' && <p className="text-sm text-muted">영역을 불러오는 중…</p>}
          {areaPaths === 'failed' && (
            <p className="rounded border border-border bg-surface-sunken p-3 text-sm">영역 목록을 읽지 못했어요. 이미 붙인 이름만 보여드려요.</p>
          )}
          {aliasesFailed && (
            <p role="alert" className="text-sm text-danger">이미 붙인 이름을 읽지 못했어요. 잠시 후 다시 열어 주세요.</p>
          )}
          {paths.length > 0 && (
            <table className="block w-full text-sm md:table">
              <thead className="hidden md:table-header-group">
                <tr className="text-left text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">원래 경로</th>
                  <th scope="col" className="py-2 pr-3 font-medium">표시 이름</th>
                  <th scope="col" className="py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group">
                {paths.map((path, i) => {
                  const alias = byPath.get(path);
                  const original = alias?.displayName ?? '';
                  const value = drafts[path] ?? original;
                  const len = value.trim().length;
                  const changed = value !== original;
                  const valid = len >= 1 && len <= 80;
                  const canSave = changed && valid;
                  const st = statusOf(path, alias);
                  const msg = msgs[path];
                  const rid = `${id}-r${i}`;
                  return (
                    <tr key={path} className="block border-t border-border py-2 md:table-row">
                      <td className="block break-all py-1 pr-3 align-top md:table-cell md:py-2">
                        <span className="font-mono">{path}</span>
                        {st === 'disconnected' && (
                          <p className="text-muted">팀이 붙인 이름 · 가리키던 경로 {path}가 코드에서 보이지 않아요</p>
                        )}
                      </td>
                      <td className="block py-1 pr-3 align-top md:table-cell md:py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input type="text" aria-label={`${path} 표시 이름`} value={value}
                            onChange={(e) => { setDraft(path, e.target.value); if (msg?.kind !== 'conflict') setMsg(path, undefined); }}
                            aria-describedby={changed && !valid ? `${rid}-why` : undefined}
                            className="min-h-9 min-w-0 flex-1 rounded border border-border bg-surface px-2" />
                          <button type="button" aria-disabled={!canSave}
                            onClick={() => { if (canSave) void save(path, alias, value); }}
                            className="min-h-9 rounded border border-border px-3 aria-disabled:opacity-60">저장</button>
                          {alias && (
                            <button type="button" onClick={() => remove(alias)} className="min-h-9 rounded px-2 text-muted underline">이름 지우기</button>
                          )}
                        </div>
                        {changed && !valid && <p id={`${rid}-why`} className="mt-1 text-muted">이름은 1~80자로 써 주세요</p>}
                        <div role="status" className="mt-1">{msg?.kind === 'saved' && '저장했어요'}</div>
                        {msg?.kind === 'error' && (
                          <div role="alert" className="mt-1 text-danger">
                            <p className="font-medium">저장하지 못했어요</p>
                            <p>입력한 내용은 그대로 두었어요. 잠시 후 다시 시도해 주세요.</p>
                          </div>
                        )}
                        {msg?.kind === 'conflict' && (
                          <div className="mt-1 space-y-1 rounded border border-border-strong bg-surface-sunken p-2">
                            <p className="font-medium">다른 사람이 방금 이름을 바꿨어요</p>
                            <p>지금 이름은 “{msg.current}”예요. 내가 쓴 “{msg.mine}”은 그대로 남겨 두었어요.</p>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => void save(path, alias, value)}
                                className="min-h-9 rounded border border-border px-3">내 이름으로 저장</button>
                              <button type="button" onClick={() => { setDraft(path, undefined); setMsg(path, undefined); }}
                                className="min-h-9 rounded border border-border px-3">그대로 두기</button>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="block py-1 align-top md:table-cell md:py-2">{STATUS_TEXT[st]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
      <p className="text-sm text-muted">이름을 비우면 원래 경로 이름으로 돌아가요. 합치기는 아직 지원하지 않아요.</p>
    </section>
  );
}
