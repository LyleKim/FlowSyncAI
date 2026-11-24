export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return iso && !isNaN(d.getTime()) ? d.toLocaleDateString('ko-KR') : '-';
};

// 미래 시각(시계 어긋남)은 0으로 보정 (07 F11)
export const minutesAgo = (iso: string, now: Date = new Date()): number =>
  Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60000));
