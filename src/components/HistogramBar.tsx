import type { SlopeBucket } from '../types';

interface Props {
  bucket: SlopeBucket;
  maxDistance: number;
}

export function HistogramBar({ bucket, maxDistance }: Props) {
  const widthPct = maxDistance > 0 ? (bucket.distance / maxDistance) * 100 : 0;
  const km = (bucket.distance / 1000).toFixed(2);
  const pct = bucket.percentage.toFixed(1);

  return (
    <div className="flex items-center gap-3">
      <div className="w-16 text-right text-sm font-medium text-gray-500 shrink-0">
        {bucket.label}
      </div>
      <div className="flex-1 h-7 bg-gray-800 rounded overflow-hidden">
        <div
          className={`h-full rounded transition-all duration-500 ${bucket.color}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="w-28 text-sm text-gray-300 shrink-0">
        {bucket.distance > 0 ? (
          <span><span className="font-semibold">{km} km</span> <span className="text-gray-500">({pct}%)</span></span>
        ) : (
          <span className="text-gray-700">—</span>
        )}
      </div>
    </div>
  );
}
