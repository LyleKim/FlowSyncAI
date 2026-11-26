import { ROUTES } from '../routes';

export const AREA_DAY_OPTIONS = [30, 60, 90, 180] as const;
export type AreaDays = (typeof AREA_DAY_OPTIONS)[number];
export type AreaSort = 'recent' | 'waiting' | 'name';
const SORTS: AreaSort[] = ['recent', 'waiting', 'name'];

export function parseAreaParams(sp: URLSearchParams): { repoId: number | null; days: AreaDays; sort: AreaSort } {
  const repo = Number(sp.get('repo'));
  const days = Number(sp.get('days'));
  const sort = sp.get('sort') as AreaSort;
  return {
    repoId: sp.get('repo') && Number.isInteger(repo) && repo > 0 ? repo : null,
    days: AREA_DAY_OPTIONS.find((d) => d === days) ?? 30,
    sort: SORTS.includes(sort) ? sort : 'recent',
  };
}

function query(repoId: number, days?: number, sort?: AreaSort): string {
  const q = new URLSearchParams({ repo: String(repoId) });
  if (days && days !== 30) q.set('days', String(days));
  if (sort && sort !== 'recent') q.set('sort', sort);
  return `?${q}`;
}

export const areasHref = (p: { repoId: number; days?: number; sort?: AreaSort }): string =>
  ROUTES.areas + query(p.repoId, p.days, p.sort);

export const areaHref = (areaId: string, p: { repoId: number; days?: number }): string =>
  ROUTES.area(areaId) + query(p.repoId, p.days);
