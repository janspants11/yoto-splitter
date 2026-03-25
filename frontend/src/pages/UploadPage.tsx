import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import FileDropzone from '../components/FileDropzone';
import ChapterList from '../components/ChapterList';
import BitrateTable from '../components/BitrateTable';
import ProgressDisplay from '../components/ProgressDisplay';
import { api, Chapter, SizeEstimate, UploadResponse } from '../api/client';
import { useSSE } from '../hooks/useSSE';
import { useConversionState } from '../context/ConversionContext';

type Stage = 'idle' | 'uploading' | 'ready' | 'converting' | 'complete';

const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Upload your audiobook',
    body: 'Click the box below (or drag your file onto it) and pick an .m4b audiobook file from your computer.',
  },
  {
    step: '2',
    title: 'Pick a quality setting',
    body: 'Choose how good you want the audio to sound. Higher quality = larger file size. 48k is a good balance for most audiobooks.',
  },
  {
    step: '3',
    title: 'Convert',
    body: 'Hit the Convert button. Each chapter of your audiobook will be split into a separate audio file.',
  },
  {
    step: '4',
    title: 'Download & load onto your Yoto card',
    body: 'Download the ZIP file, unzip it, and drag the audio files onto your Yoto MYO card using the Yoto app.',
  },
];

function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-forest-600 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left
          hover:bg-forest-700/40 transition-colors cursor-pointer"
      >
        <span className="font-display text-base text-cream/70">How does this work?</span>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          className={`text-cream/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-forest-600">
          <ol className="mt-4 space-y-4">
            {HOW_IT_WORKS.map(({ step, title, body }) => (
              <li key={step} className="flex gap-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber/15 border border-amber/30
                  flex items-center justify-center font-mono text-xs text-amber">
                  {step}
                </span>
                <div>
                  <p className="font-display text-sm text-cream/90">{title}</p>
                  <p className="mt-0.5 font-body text-sm text-cream/50">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 font-body text-xs text-cream/30">
            Your file is processed privately and deleted automatically after 24 hours.
          </p>
        </div>
      )}
    </div>
  );
}

export default function UploadPage() {
  const [stage, setStage] = useState<Stage>('idle');
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [estimates, setEstimates] = useState<SizeEstimate[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [selectedBitrate, setSelectedBitrate] = useState(48);
  const [error, setError] = useState<string | null>(null);
  const abortUploadRef = useRef<(() => void) | null>(null);
  const { setConverting } = useConversionState();

  useEffect(() => {
    return () => {
      abortUploadRef.current?.();
    };
  }, []);
  const [testResult, setTestResult] = useState<{
    bitrate: number;
    actualMB: number;
  } | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  // SSE for conversion progress — only active during converting stage
  const sseJobId = stage === 'converting' ? jobId : null;
  const sse = useSSE(sseJobId);

  // Track completed chapters from SSE
  const completedChapters = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < sse.chaptersComplete; i++) {
      set.add(i);
    }
    return set;
  }, [sse.chaptersComplete]);

  // Transition to complete when SSE signals done
  useEffect(() => {
    if (sse.status === 'complete' && stage === 'converting') {
      setStage('complete');
    }
  }, [sse.status, stage]);

  // Sync isConverting flag with stage
  useEffect(() => {
    setConverting(stage === 'converting');
  }, [stage, setConverting]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setStage('uploading');
    setUploadPercent(0);

    try {
      const { promise, abort } = api.uploadFile(file, (pct) =>
        setUploadPercent(pct),
      );
      abortUploadRef.current = abort;
      const res: UploadResponse = await promise;
      abortUploadRef.current = null;
      setJobId(res.jobId);
      setChapters(res.chapters);
      setEstimates(res.estimates);
      setSelectedBitrate(48);
      setTestResult(null);
      setStage('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStage('idle');
    } finally {
      setUploadPercent(null);
    }
  }, []);

  const handleConvert = useCallback(async () => {
    if (!jobId) return;
    setError(null);
    try {
      await api.convertJob(jobId, selectedBitrate);
      setStage('converting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start conversion');
    }
  }, [jobId, selectedBitrate]);

  const handleTestEncode = useCallback(
    async (bitrate: number) => {
      if (!jobId) return;
      setTestLoading(true);
      setTestResult(null);
      try {
        const result = await api.testEncode(jobId, bitrate);
        setTestResult({ bitrate: result.bitrate, actualMB: result.actualMB });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Test encode failed',
        );
      } finally {
        setTestLoading(false);
      }
    },
    [jobId],
  );

  const handleCancel = useCallback(async () => {
    if (!jobId) return;
    try {
      await api.cancelJob(jobId);
      setStage('ready');
    } catch {
      // Ignore cancel errors
    }
  }, [jobId]);

  const handleReset = () => {
    setStage('idle');
    setJobId(null);
    setChapters([]);
    setEstimates([]);
    setError(null);
    setTestResult(null);
  };

  const handleDownload = () => {
    if (jobId) {
      window.location.href = api.downloadUrl(jobId);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div>
        <h2 className="font-display text-3xl font-semibold">
          Convert Audiobook
        </h2>
        <p className="mt-1 font-body text-sm text-cream/40">
          Prepare for Yoto MYO cards
        </p>
      </div>

      {/* Amber rule */}
      <div className="h-px bg-amber/20" />

      {/* Error banner */}
      {error && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3 font-mono text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Stage: idle / uploading */}
      {(stage === 'idle' || stage === 'uploading') && (
        <>
          <HowItWorks />
          <FileDropzone
            onFile={handleFile}
            uploadPercent={uploadPercent}
            disabled={stage === 'uploading'}
          />
        </>
      )}

      {/* Stage: ready */}
      {stage === 'ready' && (
        <div className="space-y-8 animate-fade-in">
          <section>
            <h3 className="font-display text-xl mb-4">Output Quality</h3>
            <BitrateTable
              estimates={estimates}
              selectedBitrate={selectedBitrate}
              onSelect={setSelectedBitrate}
              onTestEncode={handleTestEncode}
              testEncodeResult={testResult}
              testEncodeLoading={testLoading}
            />
          </section>

          <div className="flex items-center gap-4">
            <button
              onClick={handleConvert}
              className="px-6 py-3 text-base font-body font-bold bg-amber text-forest-900 rounded-lg
                hover:bg-amber-light hover:shadow-[0_0_20px_rgba(212,134,58,0.2)]
                transition-all duration-200 cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-amber focus:ring-offset-2 focus:ring-offset-forest-800"
            >
              Convert
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-3 text-sm font-body text-cream/40 hover:text-cream transition-colors cursor-pointer"
            >
              Start Over
            </button>
          </div>

          <div className="h-px bg-amber/20" />

          <section>
            <h3 className="font-display text-xl mb-4">
              Chapters
              <span className="ml-2 font-mono text-sm text-cream/40">
                {chapters.length}
              </span>
            </h3>
            <ChapterList chapters={chapters} />
          </section>
        </div>
      )}

      {/* Stage: converting */}
      {stage === 'converting' && (
        <div className="space-y-6">
          <ProgressDisplay sse={sse} onCancel={handleCancel} />
          <ChapterList
            chapters={chapters}
            completedChapters={completedChapters}
            activeChapterIndex={sse.chapterIndex ?? undefined}
            activeChapterPercent={sse.chapterPercent}
          />
        </div>
      )}

      {/* Stage: complete */}
      {stage === 'complete' && (
        <div className="space-y-6 animate-fade-in text-center py-8">
          {/* Success icon */}
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            className="mx-auto text-amber"
          >
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.3"
            />
            <path
              d="M20 32L28 40L44 24"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <h3 className="font-display text-2xl">Conversion Complete</h3>
          <p className="font-mono text-sm text-cream/40">
            {chapters.length} chapters at {selectedBitrate}k
          </p>

          <div className="flex items-center justify-center gap-4 pt-4">
            <button
              onClick={handleDownload}
              className="px-6 py-3 text-base font-body font-bold bg-amber text-forest-900 rounded-lg
                hover:bg-amber-light hover:shadow-[0_0_20px_rgba(212,134,58,0.2)]
                transition-all duration-200 cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-amber focus:ring-offset-2 focus:ring-offset-forest-800"
            >
              Download ZIP
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-3 text-sm font-body text-cream/40 hover:text-cream
                border border-forest-500 hover:border-cream/30
                rounded-lg transition-colors cursor-pointer"
            >
              Convert Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
