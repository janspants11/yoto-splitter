import { SSEState } from '../hooks/useSSE';

interface ProgressDisplayProps {
  sse: SSEState;
  onCancel: () => void;
}

export default function ProgressDisplay({ sse, onCancel }: ProgressDisplayProps) {
  return (
    <div className="flex items-center gap-6 animate-fade-in">
      {/* Overall progress bar */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-mono text-xs text-cream/40 uppercase tracking-wider">
            {sse.chaptersComplete > 0
              ? `${sse.chaptersComplete} of ${sse.totalChapters} chapters`
              : 'Starting conversion...'}
          </span>
          <span className="font-mono text-sm text-amber">{sse.overallPercent}%</span>
        </div>
        <div className="h-2 bg-forest-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber rounded-full transition-all duration-500 ease-out"
            style={{ width: `${sse.overallPercent}%` }}
          />
        </div>
      </div>

      {/* Cancel button */}
      <button
        onClick={onCancel}
        className="flex-shrink-0 px-4 py-2 text-sm font-body text-cream/50 border border-forest-500
          rounded hover:text-red-400 hover:border-red-400/50 transition-colors cursor-pointer"
      >
        Cancel
      </button>
    </div>
  );
}
