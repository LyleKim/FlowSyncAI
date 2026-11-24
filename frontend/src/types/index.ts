export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'inprogress' | 'review' | 'done';

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface RoleReview {
  id: string;
  role: string;
  comment: string;
  createdAt: string;
  reviewerId?: string;
  isAccepted?: boolean;
  acceptedAt?: string;
  urgency?: 'normal' | 'urgent';
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  assigneeId: string;
  subtasks: SubTask[];
  createdAt: string;
  roles?: string[];
  roleReviews?: RoleReview[];
  hasUnreflectedReview?: boolean;
  lastReviewAddedAt?: string;
  sourceUrl?: string | null;
  kind?: 'pr' | 'manual';
  author?: string | null;
}

export interface WatchedRepo {
  id: number;
  url: string;
  owner: string;
  name: string;
  githubLogin: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface SyncResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface Activity {
  id: string;
  userName: string;
  userAvatarColor: string;
  userAvatarText: string;
  action: string;
  targetName: string;
  timestamp: string;
}

export type ArchGroupKind = 'backend' | 'frontend' | 'infra' | 'docs' | 'other';
export type ArchTrend = 'rising' | 'steady' | 'quiet';

export interface ArchWeek {
  weekStart: string;
  commits: number;
  filesChanged: number;
}

export interface ArchGroup {
  id: string;
  name: string;
  kind: ArchGroupKind;
  fileCount: number;
  samplePaths: string[];
  weekly: ArchWeek[];
  totalCommits: number;
  lastChangeAt: string | null;
  authors: string[];
  recentCommits: { sha7: string; message: string; author: string; date: string }[];
  trend: ArchTrend;
}

export interface ArchCoupling {
  a: string;
  b: string;
  count: number;
}

export interface ArchitectureResponse {
  repo: { owner: string; name: string; url: string };
  generatedAt: string;
  days: number;
  truncated: boolean;
  analyzedCommits: number;
  groups: ArchGroup[];
  couplings: ArchCoupling[];
}
