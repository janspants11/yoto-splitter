import { Job, api } from '../api/client';

interface JobCardProps {
  job: Job;
  onDelete: () => void;
  onDownload: () => void;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}

const STATUS_STYLES: Record<string, string> = {
  complete: 'bg-amber/20 text-amber',
  converting: 'bg-sage/20 text-sage',
  queued: 'bg-cream/10 text-cream/50',
  uploaded: 'bg-cream/10 text-cream/50',
  error: 'bg-red-400/20 text-red-400',
  cancelled: 'bg-cream/10 text-cream/30',
};

export default function JobCard({ job, onDelete, onDownload }: JobCardProps) {
  const displayName = job.filename.replace(/\.m4b$/i, '');
  const statusStyle = STATUS_STYLES[job.status] ?? STATUS_STYLES.queued;

  const handleDelete = () => {
    if (window.confirm(`Delete "${displayName}" and all its files?`)) {
      onDelete();
    }
  };

  return (
    <div className="bg-forest-700 rounded-lg p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-display text-lg leading-tight">{displayName}</h3>
        <span
          className={`shrink-0 text-xs font-mono px-2 py-0.5 rounded ${statusStyle}`}
        >
          {job.status}
        </span>
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-4 font-mono text-xs text-cream/40">
        {job.chapterCount != null && (
          <span>{job.chapterCount} chapters</span>
        )}
        {job.bitrate != null && <span>{job.bitrate}k</span>}
        {job.outputSize != null && <span>{formatSize(job.outputSize)}</span>}
        <span className="ml-auto">{relativeTime(job.createdAt)}</span>
      </div>

      {job.errorMessage && (
        <p className="font-mono text-xs text-red-400">{job.errorMessage}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        {job.status === 'complete' && (
          <a
            href={api.downloadUrl(job.id)}
            onClick={(e) => {
              e.preventDefault();
              onDownload();
            }}
            className="px-4 py-1.5 text-sm font-body bg-amber text-forest-900 rounded
              hover:bg-amber-light transition-colors cursor-pointer font-bold"
          >
            Download
          </a>
        )}
        <button
          onClick={handleDelete}
          className="px-3 py-1.5 text-sm font-body text-cream/30 border border-transparent
            rounded hover:text-red-400 hover:border-red-400/30 transition-colors cursor-pointer"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
