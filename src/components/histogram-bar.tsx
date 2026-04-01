import type { SlopeBucket } from "../types";

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
      <div className="w-16 shrink-0 text-right font-medium text-gray-500 text-sm">
        {bucket.label}
      </div>
      <div className="h-7 flex-1 overflow-hidden rounded bg-gray-800">
        <div
          className={`h-full rounded transition-all duration-500 ${bucket.color}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="w-28 shrink-0 text-gray-300 text-sm">
        {bucket.distance > 0 ? (
          <span>
            <span className="font-semibold">{km} km</span>{" "}
            <span className="text-gray-500">({pct}%)</span>
          </span>
        ) : (
          <span className="text-gray-700">—</span>
        )}
      </div>
    </div>
  );
}
