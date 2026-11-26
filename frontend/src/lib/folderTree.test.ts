import { describe, expect, it } from 'vitest';
import type { FolderNode } from '../types/areas';
import { areaDescriptions, chain, defaultExpanded, fileCells, owningAreaId, visibleRows } from './folderTree';

const n = (path: string, fileCount: number, children: FolderNode[] = [], over: Partial<FolderNode> = {}): FolderNode => ({
  path, name: path.split('/').pop() || 'repo', fileCount, areaId: null, description: null, children, ...over,
});
const desc = { text: '할 일 API', source: 'ai' as const, generatedAt: '2026-11-26T00:00:00Z' };
const ROOT = n('', 50, [
  n('backend', 30, [n('backend/tasks', 5, [n('backend/tasks/sub', 1)], { areaId: 'backend-tasks', description: desc })]),
  n('docs', 12),
]);

describe('folderTree', () => {
  it('fileCells: 고정 눈금 1칸 = 파일 10개, 최대 8칸, 80개 넘으면 over', () => {
    expect([0, 1, 10, 11, 80, 81, 5000].map(fileCells)).toEqual([
      { filled: 0, over: false }, { filled: 1, over: false }, { filled: 1, over: false }, { filled: 2, over: false },
      { filled: 8, over: false }, { filled: 8, over: true }, { filled: 8, over: true },
    ]);
  });

  it('기본 펼침은 최상위 폴더만(1~2단계가 보인다)', () => {
    const ex = defaultExpanded(ROOT);
    expect([...ex]).toEqual(['backend']); // 자식 없는 docs는 펼칠 게 없다
    expect(visibleRows(ROOT, ex).map((r) => [r.node.path, r.level, r.posinset, r.setsize])).toEqual([
      ['backend', 1, 1, 2], ['backend/tasks', 2, 1, 1], ['docs', 1, 2, 2],
    ]);
  });

  it('chain·owningAreaId: 가장 가까운 영역 폴더(자기 자신 포함)', () => {
    expect(chain(ROOT, 'backend/tasks/sub').map((x) => x.path)).toEqual(['backend', 'backend/tasks', 'backend/tasks/sub']);
    expect(owningAreaId(ROOT, 'backend/tasks/sub')).toBe('backend-tasks');
    expect(owningAreaId(ROOT, 'backend/tasks')).toBe('backend-tasks');
    expect(owningAreaId(ROOT, 'docs')).toBeNull();
    expect(chain(ROOT, 'nope')).toEqual([]);
  });

  it('areaDescriptions: areaId → 설명, 숨김(되돌리기 대기) 경로는 null', () => {
    expect(areaDescriptions(ROOT).get('backend-tasks')).toEqual(desc);
    expect(areaDescriptions(ROOT, new Set(['backend/tasks'])).get('backend-tasks')).toBeNull();
  });
});
