import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * 정의되지 않은 색 토큰 클래스(bg-surface-muted 등)를 잡는다.
 * 한계(보수적): 문자열 리터럴·템플릿 조각·JSX 텍스트 안의 클래스만 본다. 색 유틸리티 접두사 뒤 토큰이
 * 커스텀 토큰 머리말(surface/text/muted/border/accent/danger/success/warning/status/priority/focus)로
 * 시작할 때만 검사하고, 그 외(text-sm, border-t, bg-white, 팔레트 색 등)는 건드리지 않는다.
 * 문자열을 이어 붙여 만든 클래스, 임의값(bg-[...])은 보지 못한다.
 * 죽은 코드(TaskModal, 아키텍처 화면)는 A-T7에서 삭제되므로 제외한다.
 */
const SRC = join(__dirname, '..');
const EXCLUDE = [/\.test\./, /^components\/common\/TaskModal\.tsx$/, /^components\/dashboard\/architecture\//, /ArchitectureView\.tsx$/];
const CUSTOM_HEAD = /^(surface|text|muted|border|accent|danger|success|warning|status|priority|focus)(-|$)/;
const CLASS_RE = /(?<![\w-])(?:[\w[\]-]+:)*(?:bg|text|border|ring|divide|fill|stroke|outline|from|to)-([a-z][a-z0-9-]*)(?:\/[\w.[\]]+)?(?![\w-])/g;

export const definedTokens = (css: string) => new Set([...css.matchAll(/--color-([\w-]+):/g)].map((m) => m[1]));

/** 정의되지 않은 커스텀 색 토큰 이름 목록 */
export function undefinedTokens(name: string, source: string, defined: Set<string>): string[] {
  const sf = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    let text: string | undefined;
    if (ts.isStringLiteralLike(n) && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent)) text = n.text;
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) text = n.text;
    if (text) for (const m of text.matchAll(CLASS_RE)) if (CUSTOM_HEAD.test(m[1]) && !defined.has(m[1])) out.push(`${name}: ${m[0]}`);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const walk = (d: string): string[] => readdirSync(join(SRC, d), { withFileTypes: true }).flatMap((e) => {
  const p = d ? `${d}/${e.name}` : e.name;
  return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
});
const files = walk('').filter((f) => !EXCLUDE.some((re) => re.test(relative(SRC, join(SRC, f)))));
const defined = definedTokens(readFileSync(join(SRC, 'index.css'), 'utf8'));

describe('색 토큰 클래스 가드', () => {
  it('index.css @theme에서 토큰을 읽는다', () => {
    expect(defined.has('surface-sunken') && defined.has('muted') && !defined.has('text-muted')).toBe(true);
  });

  it('스캐너 자체 점검: 미정의 토큰은 잡고 정의된 것·색 아닌 유틸은 통과시킨다', () => {
    for (const s of ['<p className="text-text-muted" />', "const c = 'bg-surface-muted';", 'const c = `x ${a} hover:border-border-weak`;', 'const c = "ring-focus-x/50";']) {
      expect(undefinedTokens('a.tsx', s, defined), s).not.toEqual([]);
    }
    for (const s of ['<p className="text-muted bg-surface-sunken/50 text-text border-border-strong ring-focus-ring" />',
      '<p className="text-center text-sm text-xs border-t border-b-2 bg-white text-black border-transparent ring-2 from-accent" />',
      'const f = (e) => e.text; // text-text-muted', "import x from './text-text-muted';"]) {
      expect(undefinedTokens('a.tsx', s, defined), s).toEqual([]);
    }
  });

  it('대상 파일이 있다', () => expect(files.length).toBeGreaterThan(20));

  it.each(files)('%s 미정의 색 토큰 0건', (f) => {
    expect(undefinedTokens(f, readFileSync(join(SRC, f), 'utf8'), defined)).toEqual([]);
  });
});
