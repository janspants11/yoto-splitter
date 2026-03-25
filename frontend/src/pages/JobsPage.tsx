import { useCallback, useEffect, useRef, useState } from 'react';
import JobCard from '../components/JobCard';
import { api, Job } from '../api/client';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await api.getJobs();
      setJobs(data);
    } catch {
      // Silently fail on refresh
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();

    // Auto-refresh if any jobs are in progress
    intervalRef.current = setInterval(() => {
      setJobs((prev) => {
        const hasActive = prev.some(
          (j) => j.status === 'converting' || j.status === 'queued',
        );
        if (hasActive) fetchJobs();
        return prev;
      });
    }, 10000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchJobs]);

  const handleDelete = async (id: string) => {
    await api.deleteJob(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const handleDownload = (id: string) => {
    window.location.href = api.downloadUrl(id);
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <p className="font-mono text-sm text-cream/30">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-semibold">
          Conversion History
        </h2>
      </div>

      <div className="h-px bg-amber/20" />

      {jobs.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-4 text-center">
          {/* Empty state book icon */}
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            className="text-amber/30"
          >
            <rect
              x="12"
              y="8"
              width="40"
              height="48"
              rx="3"
              stroke="currentColor"
              strokeWidth="2"
            />
            <line
              x1="20"
              y1="8"
              x2="20"
              y2="56"
              stroke="currentColor"
              strokeWidth="2"
            />
            <line
              x1="26"
              y1="20"
              x2="44"
              y2="20"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.5"
            />
            <line
              x1="26"
              y1="28"
              x2="40"
              y2="28"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.5"
            />
            <line
              x1="26"
              y1="36"
              x2="42"
              y2="36"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.5"
            />
          </svg>
          <p className="font-display text-xl text-cream/40">
            No conversions yet
          </p>
          <p className="font-body text-sm text-cream/25">
            Upload an audiobook to get started
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onDelete={() => handleDelete(job.id)}
              onDownload={() => handleDownload(job.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
