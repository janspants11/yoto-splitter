import { Chapter } from '../api/client';

interface ChapterListProps {
  chapters: Chapter[];
  completedChapters?: Set<number>;
  activeChapterIndex?: number;
  activeChapterPercent?: number;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTotalDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h} hr ${m} min`;
  }
  return `${m} min`;
}

export default function ChapterList({
  chapters,
  completedChapters,
  activeChapterIndex,
  activeChapterPercent = 0,
}: ChapterListProps) {
  const totalDuration = chapters.reduce((sum, ch) => sum + ch.duration, 0);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 px-3 py-2 text-xs font-mono text-cream/40 uppercase tracking-wider">
        <span className="w-8 text-right">#</span>
        <span className="flex-1">Title</span>
        <span className="w-20 text-right">Duration</span>
      </div>

      {/* Amber divider */}
      <div className="h-px bg-amber/30 mb-1" />

      {/* Chapters */}
      <div className="space-y-0">
        {chapters.map((ch, i) => {
          const isComplete = completedChapters?.has(ch.index);
          const isActive = activeChapterIndex === ch.index;
          const baseRow = i % 2 === 0 ? 'bg-forest-800' : 'bg-forest-700/50';

          return (
            <div
              key={ch.index}
              className="relative overflow-hidden rounded opacity-0 animate-fade-slide-up"
              style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'forwards' }}
            >
              {/* Row background */}
              <div className={`absolute inset-0 ${baseRow}`} />

              {/* Completed fill */}
              {isComplete && (
                <div className="absolute inset-0 bg-amber/10" />
              )}

              {/* Active chapter progress fill */}
              {isActive && (
                <div
                  className="absolute inset-0 bg-amber/15 transition-all duration-500 ease-out origin-left"
                  style={{ transform: `scaleX(${activeChapterPercent / 100})` }}
                />
              )}

              {/* Row content */}
              <div className="relative flex items-center gap-4 px-3 py-2">
                {/* Index / check */}
                <span className="w-8 text-right flex-shrink-0">
                  {isComplete ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="inline text-amber">
                      <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span className={`font-mono text-sm ${isActive ? 'text-amber' : 'text-amber/40'}`}>
                      {(ch.index + 1).toString().padStart(2, '0')}
                    </span>
                  )}
                </span>

                <span className={`flex-1 font-display text-base truncate transition-colors ${isComplete ? 'text-cream/50' : isActive ? 'text-cream' : 'text-cream/80'}`}>
                  {ch.title}
                </span>

                <span className={`w-20 text-right font-mono text-sm flex-shrink-0 ${isComplete ? 'text-cream/30' : 'text-cream/60'}`}>
                  {formatDuration(ch.duration)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="h-px bg-forest-600 mt-2 mb-2" />
      <div className="flex justify-end px-3">
        <span className="font-mono text-sm text-cream/50">
          Total: {formatTotalDuration(totalDuration)}
        </span>
      </div>
    </div>
  );
}
