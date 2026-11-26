import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '../../hooks/useToasts';
import { ToastHost } from '../common/ToastHost';
import { makeArea } from '../../test/fixtures/areas';
import type { FolderNode, RepoTree as Tree } from '../../types/areas';
import { ApiError } from '../../services/connectedReposApi';
import { RepoTree } from './RepoTree';

vi.mock('../../services/folderTreeApi', () => ({
  describeFolders: vi.fn(),
  updateFolderDescription: vi.fn(),
  deleteFolderDescription: vi.fn(),
}));
import { deleteFolderDescription, describeFolders, updateFolderDescription } from '../../services/folderTreeApi';

const n = (path: string, fileCount: number, children: FolderNode[] = [], over: Partial<FolderNode> = {}): FolderNode => ({
  path, name: path.split('/').pop()!, fileCount, areaId: null, description: null, children, ...over,
});
const AI = { text: '이 폴더는 할 일 API를 구현하는 것으로 보입니다.', source: 'ai' as const, generatedAt: '2026-11-26T03:00:00Z' };
const tree = (over: Partial<Tree> = {}): Tree => ({
  repoId: 1, treeHash: 'h', truncated: false, folderCount: 4, limits: { maxDepth: 6, maxNodes: 400 },
  root: {
    ...n('', 140, [
      n('backend', 130, [n('backend/tasks', 5, [n('backend/tasks/sub', 1)], { areaId: 'backend-tasks', description: AI })]),
      n('docs', 12),
    ]),
    name: 'api',
  },
  ...over,
});
const reload = vi.fn();
const areas = [makeArea({ id: 'backend-tasks', displayName: '할 일 API', totalCommits: 9, lastChangeAt: '2026-11-24T08:00:00Z' })];

function show(t: Tree = tree()) {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <MemoryRouter>
        <RepoTree repoId={1} tree={{ status: 'ready', data: t, error: null, reload }} areas={areas} days={30} now={new Date('2026-11-25T03:00:00Z')} />
      </MemoryRouter>
      <ToastHost />
    </ToastProvider>,
  );
  return user;
}
const item = (name: RegExp | string) => screen.getByRole('treeitem', { name: typeof name === 'string' ? new RegExp(`^${name}`) : name });
const panel = () => screen.getByRole('region', { name: /폴더 설명/ });

beforeEach(() => vi.clearAllMocks());

describe('RepoTree', () => {
  it('트리 구조·기본 펼침(1~2단계)·aria·범례·설명 유무', () => {
    show();
    const t = screen.getByRole('tree', { name: /api 폴더 트리/ });
    expect(within(t).getAllByRole('treeitem').map((e) => e.getAttribute('aria-level'))).toEqual(['1', '2', '1']);
    expect(item('backend')).toHaveAttribute('aria-expanded', 'true');
    expect(item('tasks')).toHaveAttribute('aria-expanded', 'false');
    expect(item('docs')).not.toHaveAttribute('aria-expanded');
    expect(item('tasks')).toHaveAccessibleName(/파일 5개.*설명 있음\(AI 추정\)/);
    expect(item('docs')).toHaveAccessibleName(/설명 없음/);
    expect(screen.getByText(/1칸 = 파일 10개/)).toBeInTheDocument();
    // 고정 눈금: 130개는 8칸 + 넘침 표시, 12개는 2칸
    expect(item('backend').querySelectorAll('[data-filled]')).toHaveLength(8);
    expect(item('backend').querySelector('[data-over]')).not.toBeNull();
    expect(item('docs').querySelectorAll('[data-filled]')).toHaveLength(2);
    expect(screen.queryByText(/일부 폴더만/)).toBeNull();
  });

  it('화살표 칸 클릭은 접기/펼치기만, 행 클릭은 선택', async () => {
    const user = show();
    await user.click(item('backend').querySelector('[data-chevron]')!);
    expect(item('backend')).toHaveAttribute('aria-expanded', 'false');
    expect(item('backend')).toHaveAttribute('aria-selected', 'false');
    await user.click(item('docs'));
    expect(item('docs')).toHaveAttribute('aria-selected', 'true');
  });

  it('키보드: 화살표 이동, 좌우 접기/펼치기, Enter 선택(로빙 tabindex)', async () => {
    const user = show();
    expect(item('backend')).toHaveAttribute('tabindex', '0');
    item('backend').focus();
    await user.keyboard('{ArrowDown}');
    expect(item('tasks')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(item('tasks')).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowRight}');
    expect(item('sub')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(item('tasks')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(item('tasks')).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{End}');
    expect(item('docs')).toHaveFocus();
    await user.keyboard('{Home}{Enter}');
    expect(item('backend')).toHaveAttribute('aria-selected', 'true');
    expect(within(panel()).getByRole('heading', { name: 'backend' })).toBeInTheDocument();
  });

  it('설명 있는 폴더 선택: 설명·AI 추정·안내·파일 수·속한 영역·최근 활동', async () => {
    const user = show();
    await user.click(item('tasks'));
    const p = panel();
    expect(within(p).getByText(AI.text)).toBeInTheDocument();
    expect(within(p).getByText('AI 추정')).toBeInTheDocument();
    expect(within(p).getByText(/파일 이름만 보고 추정한 거라 정확하지 않을 수 있어요/)).toBeInTheDocument();
    expect(within(p).getByText(/파일 5개/)).toBeInTheDocument();
    expect(within(p).getByRole('link', { name: '할 일 API' })).toHaveAttribute('href', '/areas/backend-tasks?repo=1');
    expect(within(p).getByText(/마지막 변경 어제/)).toBeInTheDocument();
    // 하위 폴더는 위쪽 영역에 속한다
    await user.keyboard('{ArrowRight}{ArrowDown}{Enter}');
    expect(within(panel()).getByRole('heading', { name: 'backend/tasks/sub' })).toBeInTheDocument();
    expect(within(panel()).getByRole('link', { name: '할 일 API' })).toBeInTheDocument();
  });

  it('설명 없는 폴더: 안내 + AI로 설명 만들기 → 진행 중 → 결과·부분 실패', async () => {
    let done!: (v: unknown) => void;
    vi.mocked(describeFolders).mockReturnValue(new Promise((r) => (done = r)) as never);
    const user = show();
    await user.click(item('docs'));
    expect(within(panel()).getByText('아직 설명이 없어요')).toBeInTheDocument();
    expect(within(panel()).getByText(/영역으로 묶이지 않은 폴더/)).toBeInTheDocument();
    const btn = within(panel()).getByRole('button', { name: 'AI로 설명 만들기' });
    await user.click(btn);
    expect(describeFolders).toHaveBeenCalledWith(1);
    expect(screen.getByText(/설명을 만드는 중이에요/)).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    await user.click(btn);
    expect(describeFolders).toHaveBeenCalledTimes(1);
    await act(async () => done({ generated: ['docs', 'backend'], failed: ['backend/tasks/sub'], limited: false, skippedManual: 0, skippedUnchanged: 0 }));
    expect(reload).toHaveBeenCalled();
    expect(screen.getByText(/폴더 2개의 설명을 만들었어요/)).toBeInTheDocument();
    expect(screen.getByText(/1개 폴더는 만들지 못했어요/)).toBeInTheDocument();
  });

  it.each([
    [new ApiError('t', 429, 'describe_throttled', { retryAfterSeconds: 87 }), /87초 뒤에 다시/],
    [new ApiError('k', 503, 'ai_unavailable'), /AI 키가 설정되지 않아 설명을 만들 수 없어요/],
    [new ApiError('f', 502, 'ai_failed', { failed: ['docs'] }), /설명을 만들지 못했어요/],
  ])('오류 안내 %#', async (err, text) => {
    vi.mocked(describeFolders).mockRejectedValue(err);
    const user = show();
    await user.click(item('docs'));
    await user.click(within(panel()).getByRole('button', { name: 'AI로 설명 만들기' }));
    expect((await screen.findByText(text)).closest('[role=alert]')).not.toBeNull();
    expect(within(panel()).getByRole('button', { name: 'AI로 설명 만들기' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('설명 고치기(PATCH) → 직접 수정함 표시', async () => {
    vi.mocked(updateFolderDescription).mockResolvedValue({ text: '할 일 화면 API', source: 'manual', generatedAt: '2026-11-26T04:00:00Z' });
    const user = show();
    await user.click(item('tasks'));
    await user.click(within(panel()).getByRole('button', { name: '설명 고치기' }));
    const box = within(panel()).getByRole('textbox', { name: /설명/ });
    expect(box).toHaveFocus();
    await user.clear(box);
    await user.type(box, '할 일 화면 API');
    await user.click(within(panel()).getByRole('button', { name: '저장' }));
    expect(updateFolderDescription).toHaveBeenCalledWith(1, 'backend/tasks', '할 일 화면 API');
    expect(within(panel()).getByText('할 일 화면 API')).toBeInTheDocument();
    expect(within(panel()).getByText('직접 수정함')).toBeInTheDocument();
    expect(within(panel()).queryByText(/정확하지 않을 수 있어요/)).toBeNull();
    expect(reload).toHaveBeenCalled();
    expect(within(panel()).getByRole('button', { name: '설명 고치기' })).toHaveFocus();
  });

  it('설명 지우기: 즉시 숨기고 10초 되돌리기, 되돌리면 DELETE 안 함', async () => {
    const user = show();
    await user.click(item('tasks'));
    await user.click(within(panel()).getByRole('button', { name: '설명 지우기' }));
    expect(within(panel()).getByText('아직 설명이 없어요')).toBeInTheDocument();
    expect(item('tasks')).toHaveAccessibleName(/설명 없음/);
    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(within(panel()).getByText(AI.text)).toBeInTheDocument();
    expect(deleteFolderDescription).not.toHaveBeenCalled();
  });

  it('truncated면 한 줄 안내, 선택 전엔 고르라는 안내', () => {
    show(tree({ truncated: true, folderCount: 400 }));
    expect(screen.getByText(/폴더가 많아 400개만 보여요/)).toBeInTheDocument();
    expect(within(panel()).getByText(/폴더를 고르면/)).toBeInTheDocument();
  });
});
