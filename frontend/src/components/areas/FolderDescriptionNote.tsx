import { CircleDashed, FileText, PencilLine } from 'lucide-react';
import type { FolderDescription } from '../../types/areas';

// 설명 아이콘 한 규격(16px, stroke 1.75). 같은 뜻이 옆 글자에 있으므로 장식.
const icon = { size: 16, strokeWidth: 1.75, 'aria-hidden': true, className: 'inline shrink-0 align-[-3px]' } as const;
export const DescIcon = ({ d }: { d: FolderDescription | null }) =>
  !d ? <CircleDashed {...icon} className={`${icon.className} text-muted`} /> : d.source === 'manual' ? <PencilLine {...icon} /> : <FileText {...icon} />;

export const AI_HINT = '파일 이름만 보고 추정한 거라 정확하지 않을 수 있어요.';
export const sourceLabel = (d: FolderDescription) => (d.source === 'manual' ? '직접 수정함' : 'AI 추정');

/** 출처 표시: 아이콘 + "AI 추정"/"직접 수정함"(색이 아니라 글자와 모양으로 구분) */
export function SourceBadge({ d }: { d: FolderDescription }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border-strong px-1 text-caption font-semibold">
      <DescIcon d={d} />
      <span>{sourceLabel(d)}</span>
    </span>
  );
}

/** 영역 행·상세에 붙는 폴더 설명. compact는 두 줄에서 자른다(전체 문장은 상세와 트리 패널에) */
export function FolderDescriptionNote({ d, compact = false }: { d: FolderDescription | null | undefined; compact?: boolean }) {
  if (!d) return null;
  if (compact) {
    return (
      <p className="line-clamp-2 text-caption">
        <SourceBadge d={d} /> <span>{d.text}</span>
      </p>
    );
  }
  return (
    <div className="space-y-1 text-body-sm">
      <p className="max-w-[38em]">{d.text}</p>
      <p className="flex flex-wrap items-center gap-x-2 text-caption text-muted">
        <SourceBadge d={d} />
        {d.source === 'ai' && <span>{AI_HINT}</span>}
      </p>
    </div>
  );
}
