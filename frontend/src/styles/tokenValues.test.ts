import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync('frontend/src/index.css', 'utf8');
const fontCss = readFileSync('frontend/src/styles/pretendard.css', 'utf8');
const NAMES = [
  'surface', 'surface-raised', 'surface-sunken', 'text', 'text-muted', 'border', 'border-strong',
  'accent', 'accent-contrast', 'focus-ring', 'danger', 'success', 'warning',
  'status-todo', 'status-inprogress', 'status-review', 'status-done',
  'priority-low', 'priority-medium', 'priority-high', 'priority-urgent',
];
const block = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
// 죽은 코드 TaskModal.tsx는 F-T16이 삭제한다(tokenClasses 가드와 같은 제외)
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = join(d, e.name);
  return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && e.name !== 'TaskModal.tsx' ? [p] : [];
});

describe('시각 토큰 값(F-T17)', () => {
  it('(a) TEMP 표기 0건', () => expect(css).not.toContain('TEMP: Impeccable'));
  it('(b) --font-sans는 Pretendard로 시작하고 시스템 한글 폴백을 포함', () => {
    const v = css.match(/--font-sans:\s*([^;]+);/)?.[1] ?? '';
    expect(v).toMatch(/^"Pretendard Variable"/);
    for (const f of ['Apple SD Gothic Neo', 'Malgun Gothic', 'system-ui']) expect(v).toContain(f);
  });
  it('(c) @font-face src는 모두 /fonts/ 로컬 경로, 원격 URL 0건', () => {
    const urls = [...(css + fontCss).matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(/^\/fonts\//);
    expect(fontCss).toContain('font-display: swap');
  });
  it('(d) 비테스트 소스의 dark: 변형 0건', () => {
    const hits = walk('frontend/src').filter((f) => /\bdark:/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
  it.each([':root', '.dark'])('(e) %s 블록의 토큰 21개가 hex 값', (sel) => {
    const b = block(sel);
    for (const n of NAMES) expect(b, n).toMatch(new RegExp(`--${n}:\\s*#[0-9a-f]{6};`, 'i'));
  });
});
