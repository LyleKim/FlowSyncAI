import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// 내 리뷰 요청 화면 구조 가드. 코드 규칙은 주석을 뺀 출력에, 문구 규칙은 문자열·JSX 텍스트에만 적용한다
// (settingsGuards.test.ts와 같은 방식. 공유 헬퍼로 빼면 설정 가드를 건드리게 되어 복사해 맞췄다).
const SRC = join(__dirname, '../..');
const FILES = ['screens/MyReviewsScreen.tsx'];

const covered = () => [
  ...readdirSync(join(SRC, 'components/queue'))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
    .map((f) => `components/queue/${f}`),
  ...FILES,
];

const CODE_RULES: [string, RegExp][] = [
  ['(a) div·span onClick', /<(div|span)\b[^>]*\sonClick=/],
  ['(b) animate-*', /\banimate-(pulse|ping|bounce)\b/],
  ['(c) 접두 없는 고정 폭', /(?<![:\w-])(w|min-w)-(\[\d+px\]|64|72|80|96)(?![\w-])/],
  ['(d) 작은 글자 text-[Npx]', /text-\[(9|10|10\.5|11)px\]/],
  ['(g) 브라우저 저장소', /\b(localStorage|sessionStorage)\b/],
  ['(h) fetch POST 직접 호출', /fetch\([^)]*method:\s*'POST'/],
];
const TEXT_RULES: [string, RegExp][] = [
  ['(e) 금지 용어', /동기화|감시|Accept|🔥|🎉/],
  ['(e) 영어 병기', /\([A-Za-z ]+\)/],
];

function scan(name: string, source: string): string[] {
  const sf = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const code = ts.createPrinter({ removeComments: true }).printFile(sf);
  for (const [label, re] of CODE_RULES) if (re.test(code)) out.push(`${name}: ${label}`);
  // (f) outline-none이 focus-visible·ring 없이 쓰인 줄
  for (const line of code.split('\n')) if (/outline-none/.test(line) && !/focus-visible|ring/.test(line)) out.push(`${name}: (f) outline-none 단독`);

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

describe('내 리뷰 요청 화면 구조 가드', () => {
  it('스캐너 자체 점검: 규칙 (a)~(h) 위반은 잡고 코드·주석은 통과시킨다', () => {
    const bad: [string, string][] = [
      ['(a)', 'const x = <div onClick={f}>x</div>;'],
      ['(b)', 'const x = <span className="animate-ping" />;'],
      ['(c)', 'const x = <div className="w-[120px]" />;'],
      ['(c)', 'const x = <div className="min-w-64" />;'],
      ['(d)', 'const x = <p className="text-[10px]" />;'],
      ['(e)', 'const x = <p>지금 동기화</p>;'],
      ['(e)', "const x = <p aria-label='🎉 완료'>x</p>;"],
      ['(e)', 'const x = <p>대기 (Pending)</p>;'],
      ['(f)', 'const x = <a className="outline-none" />;'],
      ['(g)', "sessionStorage.setItem('k', 'v');"],
      ['(h)', "fetch('/x', { method: 'POST' });"],
    ];
    for (const [r, s] of bad) expect(scan('a.tsx', s).join(), `${r} ${s}`).toContain(r);
    const ok = [
      'const f = (e) => e.preventDefault();',
      '// 동기화 (Legacy) localStorage animate-pulse outline-none',
      'const x = <div className="sm:w-96 min-w-0 break-words text-xs" />;',
      'const x = <a className="outline-none focus-visible:ring-2" />;',
      'const x = <button onClick={f}>가져오기</button>;',
      "fetch('/x', { method: 'GET' });",
    ];
    for (const s of ok) expect(scan('a.tsx', s), s).toEqual([]);
  });

  it('대상 파일 목록이 비어 있지 않다', () => {
    expect(covered()).toEqual(expect.arrayContaining(['components/queue/PrQueueRow.tsx', 'screens/MyReviewsScreen.tsx']));
  });

  it.each(covered())('%s 위반 0건', (f) => {
    expect(scan(f, readFileSync(join(SRC, f), 'utf8'))).toEqual([]);
  });

  it('PrQueueRow는 긴 제목이 넘치지 않도록 break-words와 min-w-0를 가진다', () => {
    const src = readFileSync(join(SRC, 'components/queue/PrQueueRow.tsx'), 'utf8');
    expect(src).toMatch(/break-words/);
    expect(src).toMatch(/min-w-0/);
  });
});
