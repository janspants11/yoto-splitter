import { useCallback, useRef, useState } from 'react';

interface FileDropzoneProps {
  onFile: (file: File) => void;
  uploadPercent: number | null;
  disabled?: boolean;
}

export default function FileDropzone({
  onFile,
  uploadPercent,
  disabled,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.m4b')) {
        onFile(file);
      }
    },
    [onFile, disabled],
  );

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  const isUploading = uploadPercent !== null;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`
        relative cursor-pointer rounded-lg border-2 border-dashed
        transition-all duration-300 ease-out
        flex flex-col items-center justify-center gap-4 py-16
        ${
          isDragging
            ? 'border-amber bg-amber/5 scale-[1.01] shadow-[0_0_30px_rgba(212,134,58,0.1)]'
            : 'border-forest-500 hover:border-amber/50'
        }
        ${disabled ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      {/* Waveform icon */}
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        className="text-amber"
      >
        <rect x="6" y="18" width="3" height="12" rx="1.5" fill="currentColor" opacity="0.6" />
        <rect x="12" y="12" width="3" height="24" rx="1.5" fill="currentColor" opacity="0.8" />
        <rect x="18" y="8" width="3" height="32" rx="1.5" fill="currentColor" />
        <rect x="24" y="14" width="3" height="20" rx="1.5" fill="currentColor" opacity="0.9" />
        <rect x="30" y="10" width="3" height="28" rx="1.5" fill="currentColor" />
        <rect x="36" y="16" width="3" height="16" rx="1.5" fill="currentColor" opacity="0.7" />
        <rect x="42" y="20" width="3" height="8" rx="1.5" fill="currentColor" opacity="0.5" />
      </svg>

      {isUploading ? (
        <div className="w-64 flex flex-col items-center gap-3">
          <span className="font-display text-lg text-cream/80">
            Uploading...
          </span>
          <div className="w-full h-2 bg-forest-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber rounded-full transition-all duration-300 ease-out"
              style={{ width: `${uploadPercent}%` }}
            />
          </div>
          <span className="font-mono text-sm text-amber">{uploadPercent}%</span>
        </div>
      ) : (
        <>
          <p className="font-display text-xl text-cream/90">
            Drop an .m4b audiobook
          </p>
          <p className="font-body text-sm text-cream/40">or click to browse</p>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".m4b"
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
