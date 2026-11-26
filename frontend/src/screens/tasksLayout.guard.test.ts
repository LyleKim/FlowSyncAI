import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// 전체 작업 화면 레이아웃 가드. queue.guard.test.ts와 같은 방식(코드 규칙은 주석 제거 출력, 문구 규칙은 문자열·JSX 텍스트).
const SRC = join(__dirname, '..');
const DASH = ['TaskList', 'TaskBoard', 'TaskFilterBar', 'TaskStatusControl', 'TaskCollectionStates', 'TaskControls'];

const covered = () => [
  'screens/TasksScreen.tsx',
  ...DASH.map((n) => `components/dashboard/${n}.tsx`).filter((f) => existsSync(join(SRC, f))),
  'components/common/PrBadge.tsx',
  ...readdirSync(join(SRC, 'components/task'))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
    .map((f) => `components/task/${f}`),
];
function existsSync(p: string) {
  try { readFileSync(p); return true; } catch { return false; }
}

const CODE_RULES: [string, RegExp][] = [
  ['(a) 접두 없는 고정 폭', /(?<![:\w-])(w|min-w)-(\[\d+px\]|64|72|80|96)(?![\w-])/],
  ['(b) div·span onClick', /<(div|span)\b[^>]*\sonClick=/],
  ['(c) animate-*', /\banimate-(pulse|ping|bounce)\b/],
  ['(c) slate/blue 팔레트', /\b(slate|blue)-\d/],
  ['(c) 하드코딩 색', /#[0-9a-fA-F]{3,8}\b/],
  ['(d) 작은 글자 text-[Npx]', /text-\[(9|10|10\.5|11)px\]/],
];
const TEXT_RULES: [string, RegExp][] = [
  ['(c) 이모지', /🔥|🎉/],
  ['(e) 금지 용어', /칸반|모든 작업|작업 대장|검토 중|Accept|업무/],
];

function scan(name: string, source: string): string[] {
  const sf = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const code = ts.createPrinter({ removeComments: true }).printFile(sf);
  for (const [label, re] of CODE_RULES) if (re.test(code)) out.push(`${name}: ${label}`);
  for (const line of code.split('\n')) if (/outline-none/.test(line) && !/focus-visible|ring-/.test(line)) out.push(`${name}: (f) outline-none 단독`);

  const texts: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      if (!ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent)) texts.push(n.text);
    } else if (ts.isJsxText(n)) texts.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  for (const [label, re] of TEXT_RULES) {
    const hit = texts.find((t) => re.test(t));
    if (hit !== undefined) out.push(`${name}: ${label} "${hit.trim()}"`);
  }
  return out;
}

describe('전체 작업 화면 레이아웃 가드', () => {
  it('스캐너 자체 점검: 규칙 (a)~(f) 위반은 잡고 코드·주석·허용 폭은 통과시킨다', () => {
    const bad: [string, string][] = [
      ['(a)', 'const x = <div className="w-[320px]" />;'],
      ['(a)', 'const x = <div className="min-w-96" />;'],
      ['(b)', 'const x = <div onClick={f}>x</div>;'],
      ['(c)', 'const x = <i className="animate-pulse" />;'],
      ['(c)', 'const x = <i className="text-slate-500" />;'],
      ['(c)', 'const x = <i className="bg-blue-600" />;'],
      ['(c)', "const x = <i style={{ color: '#fff' }} />;"],
      ['(c)', 'const x = <p>🔥 급함</p>;'],
      ['(d)', 'const x = <p className="text-[11px]" />;'],
      ['(e)', 'const x = <h1>칸반</h1>;'],
      ['(e)', 'const x = <h1>모든 작업</h1>;'],
      ['(e)', "const x = <p aria-label='검토 중'>x</p>;"],
      ['(e)', 'const x = <p>Accept</p>;'],
      ['(f)', 'const x = <a className="outline-none" />;'],
    ];
    for (const [r, s] of bad) expect(scan('a.tsx', s).join(), `${r} ${s}`).toContain(r);
    const ok = [
      '// 칸반 검토 중 animate-pulse w-96 outline-none #fff',
      'const x = <div className="w-4 h-4 w-6 max-w-2xl md:w-96 min-w-0 text-xs" />;',
      'const x = <a className="outline-none focus-visible:ring-2" />;',
      'const x = <button onClick={f}>리뷰 중</button>;',
    ];
    for (const s of ok) expect(scan('a.tsx', s), s).toEqual([]);
  });

  it('대상 파일 목록이 비어 있지 않다', () => {
    expect(covered()).toEqual(expect.arrayContaining(['screens/TasksScreen.tsx', 'components/dashboard/TaskList.tsx', 'components/common/PrBadge.tsx', 'components/task/TaskDetailDialog.tsx']));
  });

  it.each(covered())('%s 위반 0건', (f) => {
    expect(scan(f, readFileSync(join(SRC, f), 'utf8'))).toEqual([]);
  });
});
