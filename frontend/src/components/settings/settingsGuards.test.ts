import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../..');
const DIRS = ['components/settings', 'components/firstrun'];
const FILES = ['services/connectedReposApi.ts', 'services/areaAliasesApi.ts', 'lib/repoCopy.ts', 'screens/SettingsScreen.tsx'];

const covered = () => [
  ...DIRS.flatMap((d) => readdirSync(join(SRC, d))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
    .map((f) => `${d}/${f}`)),
  ...FILES,
];

// 코드 전체(주석 제외)에 적용
const CODE_RULES: [string, RegExp][] = [
  ['원색 팔레트 클래스', /\b(slate|gray|zinc|neutral|red|green|amber|emerald|blue|indigo|violet)-\d{2,3}\b/],
  ['dark: 변형', /\bdark:[\w[-]/],
  ['브라우저 저장소 직접 접근', /\b(localStorage|sessionStorage)\b/],
  ['옛 패널·함수', /\b(WatchedReposPanel|formatLastSynced)\b/],
  ['animate-*', /\banimate-(pulse|ping|bounce)\b/],
  ['div·span onClick', /<(div|span)\b[^>]*\sonClick=/],
];
// 사용자에게 보이는 글자(문자열 리터럴·템플릿 조각·JSX 텍스트)에만 적용
const TEXT_RULES: [string, RegExp][] = [
  ['금지 용어', /감시|동기화|Accept/],
  ['영어 병기', /\([A-Za-z ]+\)/],
];

/** 위반 목록을 돌려준다. 코드 규칙은 주석을 뺀 출력에, 문구 규칙은 문자열·JSX 텍스트에만 적용한다. */
function scan(name: string, source: string): string[] {
  const sf = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const code = ts.createPrinter({ removeComments: true }).printFile(sf);
  for (const [label, re] of CODE_RULES) if (re.test(code)) out.push(`${name}: ${label}`);

  const texts: string[] = [];
  const isLogin = (n: ts.Node | undefined) => !!n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) && n.text === 'githubLogin';
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      // import 경로는 화면 문구가 아니다
      if (!ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent)) texts.push(n.text);
    } else if (ts.isJsxText(n)) texts.push(n.text);
    // githubLogin을 값으로 싣는 코드(타입 선언 PropertySignature는 허용)
    if ((ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) && isLogin(n.name)) out.push(`${name}: githubLogin을 요청에 실음`);
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(n.left) && isLogin(n.left.name)) out.push(`${name}: githubLogin을 요청에 실음`);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  for (const [label, re] of TEXT_RULES) {
    const hit = texts.find((t) => re.test(t));
    if (hit !== undefined) out.push(`${name}: ${label} "${hit.trim()}"`);
  }
  return out;
}

describe('설정 계획 최종 가드', () => {
  it('스캐너 자체 점검: 위반 예시는 잡고 코드·주석은 통과시킨다', () => {
    const bad: [string, string][] = [
      ['a.tsx', 'const x = <p>저장 (Save)</p>;'],
      ['a.tsx', "const x = <button aria-label='레포 감시'>x</button>;"],
      ['a.ts', 'const m = `${n}개 동기화됨`;'],
      ['a.ts', "const h = 'Accept';"],
      ['a.tsx', 'const x = <div className="bg-slate-100" />;'],
      ['a.tsx', 'const x = <div className="dark:bg-surface" />;'],
      ['a.ts', "localStorage.getItem('k');"],
      ['a.tsx', 'const x = <div onClick={f}>x</div>;'],
      ['a.tsx', 'const x = <span className="animate-pulse" />;'],
      ['a.ts', "postJson('/x', { url, githubLogin: me });"],
      ['a.ts', 'postJson("/x", { githubLogin });'],
      ['a.ts', 'body.githubLogin = me;'],
      ['a.ts', 'formatLastSynced(t);'],
    ];
    for (const [n, s] of bad) expect(scan(n, s), s).not.toEqual([]);
    const ok = [
      'const f = (e) => e.preventDefault();',
      'items.map((r) => r.id);',
      '// 감시·동기화 (Legacy) localStorage dark:bg-x 는 주석이라 괜찮다',
      '/* WatchedReposPanel 대체 */ const a = 1;',
      'interface R { readonly githubLogin: string | null }',
      'const logins = repos.map((r) => r.githubLogin);',
      "const t = '확인해요 (대소문자는 구분하지 않아요)';",
      'const o = { dark: true };',
    ];
    for (const s of ok) expect(scan('a.tsx', s), s).toEqual([]);
  });

  it('대상 파일 목록이 비어 있지 않다', () => {
    expect(covered()).toEqual(expect.arrayContaining(['screens/SettingsScreen.tsx', 'components/settings/MyLoginForm.tsx', 'components/firstrun/FirstRunFlow.tsx']));
  });

  it.each(covered())('%s 위반 0건', (f) => {
    expect(scan(f, readFileSync(join(SRC, f), 'utf8'))).toEqual([]);
  });
});
