import type { ArchGroupKind } from './index';

export type AreaTrend = 'rising' | 'steady' | 'quiet';

export interface AreaWeek {
  weekStart: string;
  commits: number;
  filesChanged: number;
}

export interface Area {
  id: string;
  name: string;
  displayName: string;
  alias: { id: number; displayName: string; updatedAt: string } | null;
  pathPrefix: string;
  kind: ArchGroupKind;
  fileCount: number;
  samplePaths: string[];
  weekly: AreaWeek[];
  totalCommits: number;
  lastChangeAt: string | null;
  authors: string[];
  trend: AreaTrend;
  reviewWaiting: { prCount: number; oldestRequestedAt: string | null };
}

export interface AreasResponse {
  repoId: number;
  generatedAt: string;
  days: number;
  truncated: boolean;
  analyzedCommits: number;
  areas: Area[];
  couplings: { a: string; b: string; count: number }[];
}

export interface WaitingPr {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  isDraft: boolean;
  requestedReviewers: string[];
  oldestRequestedAt: string;
  size: { additions: number; deletions: number; changedFiles: number };
  primaryAreaId: string;
  isPrimary: boolean;
  touchedAreas: { areaId: string; displayName: string; fileCount: number }[];
  unmapped: number;
  filesTruncated: boolean;
}

export interface AreaDetail extends Area {
  recentCommits: { sha7: string; message: string; author: string; date: string }[];
  waitingPullRequests: WaitingPr[];
  coupledWith: { areaId: string; count: number }[];
}

export interface AreaAlias {
  id: number;
  repoId: number;
  pathPrefix: string;
  displayName: string;
  status: 'connected' | 'disconnected' | 'unknown';
  createdAt: string;
  updatedAt: string;
}
