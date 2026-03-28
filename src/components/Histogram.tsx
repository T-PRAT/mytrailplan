import type { SlopeBucket } from '../types';
import { HistogramBar } from './HistogramBar';

interface Props {
  title: string;
  buckets: SlopeBucket[];
  icon: string;
}

export function Histogram({ title, buckets, icon }: Props) {
  const maxDistance = Math.max(...buckets.map((b) => b.distance));
  const total = buckets.reduce((s, b) => s + b.distance, 0);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-200 flex items-center gap-2">
          <span>{icon}</span> {title}
        </h2>
        <span className="text-sm text-gray-500">{(total / 1000).toFixed(2)} km</span>
      </div>
      <div className="flex flex-col gap-3">
        {buckets.map((b) => (
          <HistogramBar key={b.label} bucket={b} maxDistance={maxDistance} />
        ))}
      </div>
    </div>
  );
}
