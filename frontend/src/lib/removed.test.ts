import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe('폐기된 기능이 소스에 남아 있지 않다', () => {
  const files = sources(root).map((p) => ({ p, text: readFileSync(p, 'utf8') }));
  const banned = [
    'AnalyticsView',
    'ActivityFeed',
    'INITIAL_ACTIVITIES',
    'logActivity',
    'saveActivitiesToLocal',
    'saveTasksToLocal',
    /['"]task-['"]\s*\+\s*Date\.now/,
    /localStorage\.getItem\(\s*['"]tasks['"]/,
  ];
  it.each(banned.map((b) => [String(b), b] as const))('%s 0건', (_n, pat) => {
    const hits = files.filter(({ text }) =>
      typeof pat === 'string' ? text.includes(pat) : pat.test(text)
    );
    expect(hits.map((h) => h.p)).toEqual([]);
  });
});
