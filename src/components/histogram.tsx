import type { SlopeBucket } from "../types";
import { HistogramBar } from "./histogram-bar";

interface Props {
  buckets: SlopeBucket[];
  icon: string;
  title: string;
}

export function Histogram({ title, buckets, icon }: Props) {
  const maxDistance = Math.max(...buckets.map((b) => b.distance));
  const total = buckets.reduce((s, b) => s + b.distance, 0);

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-base text-gray-200">
          <span>{icon}</span> {title}
        </h2>
        <span className="text-gray-500 text-sm">
          {(total / 1000).toFixed(2)} km
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {buckets.map((b) => (
          <HistogramBar bucket={b} key={b.label} maxDistance={maxDistance} />
        ))}
      </div>
    </div>
  );
}
