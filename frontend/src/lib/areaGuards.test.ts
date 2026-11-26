import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// 영역 흐름 가드. queue.guard.test.ts와 같은 방식(TS AST): 코드 규칙은 주석을 뺀 출력에,
// 문구 규칙은 문자열·JSX 텍스트에만 적용한다.
const SRC = join(__dirname, '..');

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [relative(SRC, join(dir, e.name))],
  );
const isSource = (f: string) => /\.tsx?$/.test(f) && !/\.test\./.test(f);
const ALL = () => walk(SRC).filter(isSource);
const AREA = () =>
  ALL().filter((f) => /^(components\/areas\/|screens\/Area[^/]*$|lib\/area[^/]*$|hooks\/useArea[^/]*$)/.test(f));

const sourceOf = (name: string, source: string) =>
  ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const codeOf = (sf: ts.SourceFile) => ts.createPrinter({ removeComments: true }).printFile(sf);

// (1) 전 소스: 구 아키텍처 화면 흔적, recharts, BrowserRouter 코드 사용, location.hash
const GLOBAL_RULES: [string, RegExp][] = [
  ['(a) 구 아키텍처 화면', /ArchitectureView|CouplingGraph|GroupCard|WeeklyChart|architectureApi|REPO_URL_KEY|groupColors/],
  ['(b) recharts', /\brecharts\b/],
  ['(i) BrowserRouter', /\bBrowserRouter\b/],
  ['(j) window.location.hash', /\blocation\.hash\b/],
];
// (2) 영역 파일: 구조 규칙
const AREA_CODE_RULES: [string, RegExp][] = [
  ['(c) div·span onClick', /<(div|span)\b[^>]*\sonClick=/],
  ['(c) animate-*', /\banimate-(pulse|ping|bounce)\b/],
  ['(c) localStorage', /\blocalStorage\b/],
  ['(c) hsl()', /\bhsl\(/],
];
const AREA_TEXT_RULES: [string, RegExp][] = [
  ['(c) 금지 문구', /조용함|정체 후보|진행률 \d|완료율/],
  ['(c) hsl()', /hsl\(/],
];

function texts(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      if (!ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent)) out.push(n.text);
    } else if (ts.isJsxText(n)) out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// (d) outline-none은 같은 className(문자열) 안에 focus-visible 대체가 있을 때만 허용
function outlineViolations(sf: ts.SourceFile): boolean {
  return texts(sf).some((t) => /\boutline-none\b/.test(t) && !/focus-visible:|\bring\b|focus-visible:ring/.test(t));
}

function scanGlobal(name: string, source: string): string[] {
  const code = codeOf(sourceOf(name, source));
  return GLOBAL_RULES.filter(([, re]) => re.test(code)).map(([l]) => `${name}: ${l}`);
}

function scanArea(name: string, source: string): string[] {
  const sf = sourceOf(name, source);
  const code = codeOf(sf);
  const out = AREA_CODE_RULES.filter(([, re]) => re.test(code)).map(([l]) => `${name}: ${l}`);
  const ts_ = texts(sf);
  for (const [label, re] of AREA_TEXT_RULES) {
    const hit = ts_.find((t) => re.test(t));
    if (hit !== undefined) out.push(`${name}: ${label} "${hit.trim()}"`);
  }
  if (outlineViolations(sf)) out.push(`${name}: (d) outline-none 단독`);
  return out;
}

describe('영역 흐름 가드', () => {
  it('스캐너 자체 점검: 위반은 잡고 주석·허용 문구는 통과시킨다', () => {
    const badGlobal: [string, string][] = [
      ['(a)', "import { ArchitectureView } from './x';"],
      ['(a)', "import { fetchArchitecture } from './architectureApi';"],
      ['(b)', "import { Bar } from 'recharts';"],
      ['(i)', 'const r = createBrowserRouter ? <BrowserRouter /> : null;'],
      ['(j)', 'const h = window.location.hash;'],
    ];
    for (const [r, s] of badGlobal) expect(scanGlobal('a.tsx', s).join(), `${r} ${s}`).toContain(r);
    const okGlobal = ['// recharts BrowserRouter ArchitectureView location.hash', "const x = createHashRouter([]);"];
    for (const s of okGlobal) expect(scanGlobal('a.tsx', s), s).toEqual([]);

    const badArea: [string, string][] = [
      ['(c)', 'const x = <div onClick={f}>x</div>;'],
      ['(c)', 'const x = <span className="animate-pulse" />;'],
      ['(c)', "localStorage.getItem('k');"],
      ['(c)', "const c = 'hsl(10, 50%, 50%)';"],
      ['(c)', 'const x = <p>조용함</p>;'],
      ['(c)', 'const x = <p>정체 후보</p>;'],
      ['(c)', 'const x = <p>진행률 40%</p>;'],
      ['(c)', 'const x = <p>완료율</p>;'],
      ['(d)', 'const x = <a className="outline-none" />;'],
      ['(d)', 'const x = <a className="outline-none focus:bg-x" />;'],
    ];
    for (const [r, s] of badArea) expect(scanArea('a.tsx', s).join(), `${r} ${s}`).toContain(r);
    const okArea = [
      '// 조용함 localStorage animate-pulse outline-none hsl(1)',
      'const x = <p>진행률이 아니에요</p>;',
      'const x = <a className="outline-none focus-visible:ring-2" />;',
      'const x = <a className="focus-visible:outline-none ring-2" />;',
      'const x = <button onClick={f}>보기</button>;',
    ];
    for (const s of okArea) expect(scanArea('a.tsx', s), s).toEqual([]);
  });

  it('스캔 대상이 비어 있지 않다', () => {
    expect(ALL().length).toBeGreaterThan(0);
    expect(ALL().filter((f) => f.startsWith('components/areas/')).length).toBeGreaterThan(0);
    expect(AREA().some((f) => f.startsWith('screens/Area'))).toBe(true);
    expect(AREA().some((f) => f.startsWith('lib/area'))).toBe(true);
    expect(AREA().some((f) => f.startsWith('hooks/useArea'))).toBe(true);
  });

  it('구 아키텍처 파일이 남아 있지 않다', () => {
    expect(ALL().filter((f) => /ArchitectureView|dashboard\/architecture\/|architectureApi/.test(f))).toEqual([]);
  });

  it('전체 소스에 구 화면·recharts·BrowserRouter·location.hash 사용이 없다', () => {
    expect(ALL().flatMap((f) => scanGlobal(f, readFileSync(join(SRC, f), 'utf8')))).toEqual([]);
  });

  it('영역 파일 구조 규칙 위반 0건', () => {
    expect(AREA().flatMap((f) => scanArea(f, readFileSync(join(SRC, f), 'utf8')))).toEqual([]);
  });

  it('index.html·index.css에 외부 CDN URL이 없다', () => {
    const files = [join(SRC, 'index.css'), join(SRC, '../../index.html')];
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/https?:\/\//);
  });
});
