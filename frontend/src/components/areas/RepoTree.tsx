import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { Area, FolderDescription, FolderNode } from '../../types/areas';
import { FILES_PER_CELL, MAX_CELLS, chain, defaultExpanded, fileCells, owningAreaId, visibleRows } from '../../lib/folderTree';
import { areaHref } from '../../lib/areaRoute';
import { relativeDay, trendLabel } from '../../lib/areaChart';
import { formatDate } from '../../lib/date';
import { deleteFolderDescription, describeFolders, updateFolderDescription } from '../../services/folderTreeApi';
import { ApiError } from '../../services/connectedReposApi';
import { folderUndoKey, useHiddenFolders, type useRepoTree } from '../../hooks/useRepoTree';
import { useUndo } from '../../hooks/useUndo';
import { AI_HINT, DescIcon, SourceBadge } from './FolderDescriptionNote';

interface Props {
  repoId: number;
  tree: ReturnType<typeof useRepoTree>;
  areas: Area[];
  days: number;
  now: Date;
}

const focus = 'focus-visible:outline-2 focus-visible:outline-focus-ring';
const btn = `min-h-9 rounded border border-border bg-surface-raised px-3 text-body-sm font-semibold aria-disabled:text-muted ${focus}`;
const primary = `min-h-9 rounded border border-accent bg-accent px-3 text-body-sm font-semibold text-accent-contrast aria-disabled:border-border aria-disabled:bg-surface-sunken aria-disabled:text-muted ${focus}`;
const MAX_TEXT = 300;

/** 파일 수 고정 눈금 막대: 같은 값이 옆 글자에 있으므로 장식 */
function FileCells({ count }: { count: number }) {
  const { filled, over } = fileCells(count);
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-0.5">
      {Array.from({ length: MAX_CELLS }, (_, i) =>
        i < filled ? <span key={i} data-filled className="block h-2 w-1.5 bg-chart-bar" /> : <span key={i} className="block h-2 w-1.5 border border-border" />,
      )}
      {over ? <span data-over className="ml-0.5 block h-3 w-0.5 bg-chart-bar" /> : <span className="ml-0.5 block w-0.5" />}
    </span>
  );
}

function describeError(e: unknown): string {
  const code = e instanceof ApiError ? e.code : undefined;
  if (code === 'describe_throttled') {
    const s = Number((e as ApiError & { body?: { retryAfterSeconds?: number } }).body?.retryAfterSeconds);
    return `방금 설명을 만들었어요. ${Number.isFinite(s) && s > 0 ? `${Math.ceil(s)}초` : '잠시'} 뒤에 다시 할 수 있어요.`;
  }
  if (code === 'ai_unavailable') return 'AI 키가 설정되지 않아 설명을 만들 수 없어요. 설명은 직접 쓸 수 있어요.';
  if (code === 'github_unavailable') return 'GitHub에 닿지 않아 설명을 만들지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
  if (code === 'network') return '서버에 연결하지 못해 설명을 만들지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
  return '설명을 만들지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-caption font-semibold text-muted">{term}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

export function RepoTree({ repoId, tree, areas, days, now }: Props) {
  const data = tree.data;
  const { schedule } = useUndo();
  const hidden = useHiddenFolders(repoId);
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [overrides, setOverrides] = useState(new Map<string, FolderDescription | null>());
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<{ seq: number; text: string } | null>(null);
  const [editing, setEditing] = useState<{ draft: string; error: string | null; saving: boolean } | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const moveFocus = useRef(false);
  const editBtnRef = useRef<HTMLButtonElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const [focusTo, setFocusTo] = useState<'edit' | 'head' | null>(null);

  // 다시 읽은 트리가 오면 임시로 덮어 둔 설명은 버린다(서버 값이 기준)
  useEffect(() => setOverrides(new Map()), [data]);
  useEffect(() => {
    if (focusTo === 'edit') editBtnRef.current?.focus();
    if (focusTo === 'head') headRef.current?.focus();
    if (focusTo) setFocusTo(null);
  }, [focusTo]);
  useEffect(() => {
    if (moveFocus.current && active) itemRefs.current.get(active)?.focus();
    moveFocus.current = false;
  }, [active, expanded]);

  if (tree.status === 'loading' || tree.status === 'idle') {
    return (
      <div className="space-y-2">
        <p role="status" className="text-body-sm text-muted">레포 폴더 트리를 읽는 중이에요</p>
        <div aria-hidden="true" className="space-y-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-8 rounded bg-surface-sunken" />)}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div role="alert" className="rounded border border-danger bg-surface-raised p-4 text-body-sm">
        <p className="font-semibold">폴더 트리를 읽지 못했어요.</p>
        <p className="mt-1">
          {tree.error?.code === 'github_unavailable' ? 'GitHub에 잠시 닿지 않아요. ' : ''}위의 영역 흐름은 그대로예요. 잠시 뒤에 다시 시도해 주세요.
        </p>
        <button type="button" onClick={tree.reload} className={`mt-3 ${btn}`}>다시 시도</button>
      </div>
    );
  }

  const root = data.root;
  const open = expanded ?? defaultExpanded(root);
  const rows = visibleRows(root, open);
  const focusPath = active && rows.some((r) => r.node.path === active) ? active : rows[0]?.node.path ?? null;
  const descOf = (x: FolderNode) => (hidden.has(x.path) ? null : overrides.has(x.path) ? overrides.get(x.path)! : x.description);
  const toggle = (path: string, to?: boolean) => {
    const next = new Set(open);
    if (to ?? !next.has(path)) next.add(path);
    else next.delete(path);
    setExpanded(next);
  };
  const select = (path: string) => {
    setSelected(path);
    setActive(path);
    setEditing(null);
  };

  const onKey = (e: KeyboardEvent) => {
    const i = rows.findIndex((r) => r.node.path === focusPath);
    if (i < 0) return;
    const row = rows[i];
    const has = row.node.children.length > 0;
    const go = (j: number) => {
      moveFocus.current = true;
      setActive(rows[Math.max(0, Math.min(rows.length - 1, j))].node.path);
    };
    switch (e.key) {
      case 'ArrowDown': go(i + 1); break;
      case 'ArrowUp': go(i - 1); break;
      case 'Home': go(0); break;
      case 'End': go(rows.length - 1); break;
      case 'ArrowRight':
        if (has && !open.has(row.node.path)) toggle(row.node.path, true);
        else if (has) go(i + 1);
        break;
      case 'ArrowLeft':
        if (has && open.has(row.node.path)) toggle(row.node.path, false);
        else if (row.parent !== null) {
          moveFocus.current = true;
          setActive(row.parent);
        }
        break;
      case 'Enter':
      case ' ':
        select(row.node.path);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const runDescribe = async () => {
    if (running) return;
    setRunning(true);
    setFailure(null);
    setStatus('설명을 만드는 중이에요. 폴더가 많으면 1분쯤 걸릴 수 있어요.');
    try {
      const r = await describeFolders(repoId);
      const parts = [
        r.generated.length ? `폴더 ${r.generated.length}개의 설명을 만들었어요.` : '새로 만들 설명이 없어요. 이미 있거나 직접 쓴 설명은 건너뛰어요.',
      ];
      if (r.failed.length) parts.push(`${r.failed.length}개 폴더는 만들지 못했어요. 잠시 뒤에 다시 시도해 주세요.`);
      if (r.limited) parts.push('큰 폴더부터 40개까지만 만들었어요.');
      setStatus(parts.join(' '));
      tree.reload();
    } catch (e) {
      setStatus('');
      setFailure((f) => ({ seq: (f?.seq ?? 0) + 1, text: describeError(e) }));
    } finally {
      setRunning(false);
    }
  };

  const sel = selected ? chain(root, selected).at(-1) ?? null : null;
  const selDesc = sel ? descOf(sel) : null;

  const save = async () => {
    if (!sel || !editing || editing.saving) return;
    const text = editing.draft.trim().replace(/\s+/g, ' ');
    if (!text) return setEditing({ ...editing, error: '설명을 한 글자 이상 써 주세요.' });
    setEditing({ ...editing, saving: true, error: null });
    try {
      const d = await updateFolderDescription(repoId, sel.path, text);
      setOverrides((m) => new Map(m).set(sel.path, d));
      setEditing(null);
      setFocusTo('edit');
      tree.reload();
    } catch (e) {
      const msg = e instanceof ApiError && e.code === 'invalid_text' ? `설명은 1~${MAX_TEXT}자로 써 주세요.` : '저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
      setEditing((ed) => ed && { ...ed, saving: false, error: msg });
    }
  };

  const remove = () => {
    if (!sel) return;
    const path = sel.path;
    schedule({
      label: `‘${path}’ 설명을 지웠어요`,
      key: folderUndoKey(repoId, path),
      hide: () => {},
      restore: () => {},
      commit: async () => {
        try {
          await deleteFolderDescription(repoId, path);
          setOverrides((m) => new Map(m).set(path, null));
          tree.reload();
          return { ok: true };
        } catch {
          return { ok: false, error: `‘${path}’ 설명을 지우지 못해 원래대로 되돌렸어요. 잠시 후 다시 시도해 주세요.` };
        }
      },
    });
    setFocusTo('head');
  };

  const areaId = sel ? owningAreaId(root, sel.path) : null;
  const area = areaId ? areas.find((a) => a.id === areaId) : undefined;

  let panel: ReactNode;
  if (!sel) {
    panel = <p className="text-muted">폴더를 고르면 그 폴더가 맡은 역할 설명이 여기 보여요.</p>;
  } else {
    let descBlock: ReactNode;
    if (editing) {
      descBlock = (
        <div className="space-y-2">
          <label htmlFor="folder-desc-edit" className="block text-caption font-semibold">설명({MAX_TEXT}자 이내)</label>
          <textarea
            id="folder-desc-edit"
            autoFocus
            rows={4}
            maxLength={MAX_TEXT}
            value={editing.draft}
            aria-invalid={!!editing.error}
            aria-describedby={editing.error ? 'folder-desc-error' : undefined}
            onChange={(e) => setEditing({ ...editing, draft: e.target.value, error: null })}
            className={`w-full rounded border border-border-strong bg-surface-raised p-2 text-body-sm ${focus}`}
          />
          {editing.error && <p id="folder-desc-error" role="alert" className="text-caption text-danger">{editing.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-disabled={editing.saving} onClick={save} className={primary}>{editing.saving ? '저장하는 중' : '저장'}</button>
            <button type="button" onClick={() => { setEditing(null); setFocusTo('edit'); }} className={btn}>취소</button>
          </div>
        </div>
      );
    } else if (selDesc) {
      descBlock = (
        <div className="space-y-2">
          <p className="text-body">{selDesc.text}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
            <SourceBadge d={selDesc} />
            <span>{formatDate(selDesc.generatedAt)}</span>
          </p>
          {selDesc.source === 'ai' && <p className="text-caption text-muted">{AI_HINT}</p>}
          <div className="flex flex-wrap gap-2">
            <button ref={editBtnRef} type="button" onClick={() => setEditing({ draft: selDesc.text, error: null, saving: false })} className={btn}>설명 고치기</button>
            <button type="button" onClick={remove} className={btn}>설명 지우기</button>
          </div>
        </div>
      );
    } else {
      descBlock = (
        <div className="space-y-2">
          <p className="font-semibold">아직 설명이 없어요</p>
          <p className="text-caption text-muted">
            AI가 폴더 이름과 파일 이름만 보고 역할을 추정해요. 정확하지 않을 수 있어요. 한 번에 큰 폴더부터 최대 40개를 만들어요.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-disabled={running} onClick={runDescribe} className={primary}>AI로 설명 만들기</button>
            <button ref={editBtnRef} type="button" onClick={() => setEditing({ draft: '', error: null, saving: false })} className={btn}>직접 쓰기</button>
          </div>
        </div>
      );
    }
    panel = (
      <div className="space-y-4">
        <h3 ref={headRef} tabIndex={-1} className={`font-mono text-body-sm font-semibold wrap-anywhere ${focus}`}>{sel.path}</h3>
        {descBlock}
        <dl className="space-y-3">
          <Fact term="파일 수">파일 {sel.fileCount}개(하위 폴더 포함)</Fact>
          <Fact term="속한 영역">
            {areaId ? (
              <Link to={areaHref(areaId, { repoId, days })} className={`inline-flex min-h-6 items-center underline underline-offset-2 wrap-anywhere ${focus}`}>
                {area?.displayName ?? areaId}
              </Link>
            ) : (
              <span className="text-muted">영역으로 묶이지 않은 폴더예요.</span>
            )}
          </Fact>
          <Fact term="최근 활동">
            {area ? (
              <span>
                {trendLabel(area.trend)} · 마지막 변경 {relativeDay(area.lastChangeAt, now, days)} · 최근 {days}일 커밋 {area.totalCommits}개
                <span className="block text-caption text-muted">영역 전체 기준이에요.</span>
              </span>
            ) : (
              <span className="text-muted">폴더마다 활동을 따로 세지는 않아요. 영역에 속한 폴더만 활동이 보여요.</span>
            )}
          </Fact>
        </dl>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1 text-body-sm text-muted">
        <p>
          막대 1칸 = 파일 {FILES_PER_CELL}개(하위 폴더 포함)예요. 모든 폴더가 같은 눈금이고 최대 {MAX_CELLS}칸({FILES_PER_CELL * MAX_CELLS}개)까지 그려요.
          넘으면 끝에 세로선을 그어요.
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1"><DescIcon d={{ text: '', source: 'ai', generatedAt: '' }} />AI 추정 설명</span>
          <span className="inline-flex items-center gap-1"><DescIcon d={{ text: '', source: 'manual', generatedAt: '' }} />직접 쓴 설명</span>
          <span className="inline-flex items-center gap-1"><DescIcon d={null} />설명 없음</span>
        </p>
        {data.truncated && <p>폴더가 많아 {data.folderCount}개만 보여요(얕고 큰 폴더 먼저, 깊이 {data.limits.maxDepth}단계까지).</p>}
      </div>
      {/* 항상 마운트된 진행·결과 알림(같은 노드의 글자만 바뀐다) */}
      <p role="status" className="text-body-sm empty:hidden">{status}</p>
      {failure && (
        <div key={failure.seq} role="alert" className="rounded border border-danger bg-surface-raised p-3 text-body-sm">{failure.text}</div>
      )}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_20rem]">
        <ul role="tree" aria-label={`${root.name} 폴더 트리`} onKeyDown={onKey} className="min-w-0 border-y border-border text-body-sm">
          {rows.map(({ node, level, posinset, setsize }) => {
            const has = node.children.length > 0;
            const isOpen = open.has(node.path);
            const d = descOf(node);
            const isSel = node.path === selected;
            return (
              <li
                key={node.path}
                ref={(el) => { if (el) itemRefs.current.set(node.path, el); else itemRefs.current.delete(node.path); }}
                role="treeitem"
                aria-label={`${node.name}, 파일 ${node.fileCount}개, ${d ? `설명 있음(${d.source === 'manual' ? '직접 수정함' : 'AI 추정'})` : '설명 없음'}`}
                aria-level={level}
                aria-posinset={posinset}
                aria-setsize={setsize}
                aria-expanded={has ? isOpen : undefined}
                aria-selected={isSel}
                tabIndex={node.path === focusPath ? 0 : -1}
                // 화살표 칸을 누르면 접기/펼치기, 나머지는 선택
                onClick={(e) => ((e.target as Element).closest('[data-chevron]') ? (toggle(node.path), setActive(node.path)) : select(node.path))}
                onFocus={() => setActive(node.path)}
                style={{ paddingLeft: `${(level - 1) * 0.75}rem` }}
                className={`flex min-h-9 cursor-pointer items-center gap-2 border-b border-border pr-2 last:border-b-0 hover:bg-surface-sunken ${isSel ? 'bg-accent-subtle font-semibold' : ''} ${focus} focus-visible:-outline-offset-2`}
              >
                {has ? (
                  <span
                    aria-hidden="true"
                    data-chevron
                    className="inline-flex h-9 w-6 shrink-0 items-center justify-center"
                  >
                    <ChevronRight size={16} strokeWidth={1.75} className={isOpen ? 'rotate-90' : ''} />
                  </span>
                ) : (
                  <span aria-hidden="true" className="w-6 shrink-0" />
                )}
                <DescIcon d={d} />
                <span className="min-w-0 flex-1 wrap-anywhere">{node.name}</span>
                <FileCells count={node.fileCount} />
                <span className="w-10 shrink-0 text-right text-caption tabular-nums text-muted md:w-16"><span className="max-md:hidden">파일 </span>{node.fileCount}개</span>
              </li>
            );
          })}
        </ul>
        <section aria-label="선택한 폴더 설명" className="min-w-0 rounded border border-border bg-surface-raised p-4 text-body-sm md:self-start">
          {panel}
        </section>
      </div>
    </div>
  );
}
