import { SizeEstimate } from '../api/client';

interface BitrateTableProps {
  estimates: SizeEstimate[];
  selectedBitrate: number;
  onSelect: (bitrate: number) => void;
  onTestEncode?: (bitrate: number) => void;
  testEncodeResult?: { bitrate: number; actualMB: number } | null;
  testEncodeLoading?: boolean;
}

const QUALITY_LABELS: Record<number, string> = {
  32: 'Low',
  48: 'Standard',
  64: 'Good',
  96: 'High',
  128: 'Lossless-like',
};

function formatSize(mb: number): string {
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}

export default function BitrateTable({
  estimates,
  selectedBitrate,
  onSelect,
  onTestEncode,
  testEncodeResult,
  testEncodeLoading,
}: BitrateTableProps) {
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_100px_80px_70px] gap-2 px-4 py-2 text-xs font-mono text-cream/40 uppercase tracking-wider">
        <span>Quality</span>
        <span className="text-right">Bitrate</span>
        <span className="text-right">Est. Size</span>
        <span className="text-center">Yoto</span>
        <span className="text-center">Test</span>
      </div>

      <div className="h-px bg-amber/30 mb-1" />

      {estimates.map((est) => {
        const isSelected = est.bitrate === selectedBitrate;
        const hasTestResult =
          testEncodeResult && testEncodeResult.bitrate === est.bitrate;

        return (
          <button
            key={est.bitrate}
            onClick={() => onSelect(est.bitrate)}
            className={`
              w-full grid grid-cols-[1fr_80px_100px_80px_70px] gap-2 px-4 py-3
              rounded transition-all duration-200
              text-left cursor-pointer
              ${
                isSelected
                  ? 'bg-forest-700 border-l-2 border-amber text-amber'
                  : 'hover:bg-forest-700/50 border-l-2 border-transparent'
              }
            `}
          >
            <span className="font-body text-sm">
              {QUALITY_LABELS[est.bitrate] ?? `${est.bitrate}k`}
            </span>
            <span className="text-right font-mono text-sm">
              {est.bitrate}k
            </span>
            <span className="text-right font-mono text-sm">
              {formatSize(est.estimatedMB)}
              {hasTestResult && (
                <span className="ml-1 text-xs bg-amber/20 text-amber px-1.5 py-0.5 rounded">
                  {formatSize(testEncodeResult.actualMB)}
                </span>
              )}
            </span>
            <span className="text-center font-mono text-sm">
              {est.fitsYoto ? (
                <span className="text-sage">&#10003;</span>
              ) : (
                <span className="text-red-400">&times;</span>
              )}
            </span>
            <span className="text-center">
              {onTestEncode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTestEncode(est.bitrate);
                  }}
                  disabled={testEncodeLoading}
                  className="text-xs font-mono text-cream/40 hover:text-amber
                    border border-forest-500 hover:border-amber/50
                    px-2 py-0.5 rounded transition-colors
                    disabled:opacity-30 disabled:cursor-wait"
                >
                  {testEncodeLoading &&
                  testEncodeResult === null &&
                  isSelected
                    ? '...'
                    : 'Test'}
                </button>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
