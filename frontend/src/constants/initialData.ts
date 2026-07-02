import { Activity } from '../types';

export const INITIAL_ACTIVITIES: Activity[] = [
  {
    id: 'a1',
    userName: 'Sarah Chen',
    userAvatarColor: 'bg-rose-500',
    userAvatarText: 'SC',
    action: 'completed',
    targetName: 'Design System Typography & Tokens',
    timestamp: '2 hours ago'
  },
  {
    id: 'a2',
    userName: 'Marcus Johnson',
    userAvatarColor: 'bg-indigo-500',
    userAvatarText: 'MJ',
    action: 'started',
    targetName: 'Implement Authentication API Endpoints',
    timestamp: '4 hours ago'
  },
  {
    id: 'a3',
    userName: 'Dev Patel',
    userAvatarColor: 'bg-sky-500',
    userAvatarText: 'DP',
    action: 'submitted',
    targetName: 'Draft Product Launch Press Release',
    timestamp: 'Yesterday at 3:30 PM'
  },
  {
    id: 'a4',
    userName: 'Alex Morgan',
    userAvatarColor: 'bg-amber-500',
    userAvatarText: 'AM',
    action: 'created',
    targetName: 'Optimize Database Indexing & Queries',
    timestamp: '2 days ago'
  }
];
