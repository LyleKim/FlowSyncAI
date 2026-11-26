import type { FolderDescription, FolderNode } from '../types/areas';

// 고정 눈금(영역 막대·결합 선과 같은 문법): 1칸 = 파일 10개, 최대 8칸. 최댓값으로 정규화하지 않는다.
export const FILES_PER_CELL = 10;
export const MAX_CELLS = 8;
export const fileCells = (count: number) => ({
  filled: Math.min(MAX_CELLS, Math.ceil(count / FILES_PER_CELL)),
  over: count > FILES_PER_CELL * MAX_CELLS,
});

/** 처음엔 최상위 폴더만 펼친다: 1단계와 그 아래 2단계까지 보인다. */
export const defaultExpanded = (root: FolderNode) => new Set(root.children.filter((c) => c.children.length).map((c) => c.path));

export interface Row {
  node: FolderNode;
  level: number;
  parent: string | null;
  posinset: number;
  setsize: number;
}

/** 펼친 상태에서 화면에 보이는 행(루트 제외, 최상위 = level 1) */
export function visibleRows(root: FolderNode, expanded: ReadonlySet<string>): Row[] {
  const out: Row[] = [];
  const walk = (kids: FolderNode[], level: number, parent: string | null) =>
    kids.forEach((node, i) => {
      out.push({ node, level, parent, posinset: i + 1, setsize: kids.length });
      if (expanded.has(node.path)) walk(node.children, level + 1, node.path);
    });
  walk(root.children, 1, null);
  return out;
}

/** 최상위부터 path까지의 노드들(없으면 빈 배열) */
export function chain(root: FolderNode, path: string): FolderNode[] {
  const out: FolderNode[] = [];
  let cur = root;
  while (cur.path !== path) {
    const next = cur.children.find((c) => path === c.path || path.startsWith(`${c.path}/`));
    if (!next) return [];
    out.push(next);
    cur = next;
  }
  return out;
}

/** 이 폴더가 속한 영역: 자기 자신부터 위로 가장 가까운 영역 폴더 */
export const owningAreaId = (root: FolderNode, path: string): string | null =>
  chain(root, path).reverse().find((x) => x.areaId)?.areaId ?? null;

/** 영역 id → 그 폴더 설명. hidden(되돌리기 대기 중) 경로는 설명 없음으로 본다 */
export function areaDescriptions(root: FolderNode, hidden: ReadonlySet<string> = new Set()) {
  const m = new Map<string, FolderDescription | null>();
  const walk = (x: FolderNode) => {
    if (x.areaId) m.set(x.areaId, hidden.has(x.path) ? null : x.description);
    x.children.forEach(walk);
  };
  walk(root);
  return m;
}
