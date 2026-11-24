import React from 'react';

export default function PrBadge({ url }: { url?: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="GitHub PR 열기"
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black border shrink-0 bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800"
    >
      PR
    </a>
  );
}
