export const getInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

export const getAvatarColor = (name: string) => {
  const colors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-rose-500',
    'bg-amber-500',
    'bg-purple-500',
    'bg-sky-500',
    'bg-indigo-500',
    'bg-pink-500',
  ];
  if (!name) return 'bg-slate-500';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};
