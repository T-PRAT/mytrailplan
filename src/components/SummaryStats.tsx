import type { AnalysisResult } from '../types';

interface Props {
  result: AnalysisResult;
}

function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 text-center">
      <div className="text-2xl font-bold text-gray-100">{value} <span className="text-base font-normal text-gray-500">{unit}</span></div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}

export function SummaryStats({ result }: Props) {
  const km = (result.totalDistance / 1000).toFixed(2);
  const gain = Math.round(result.totalGain);
  const loss = Math.round(result.totalLoss);
  const sections = result.sections.length;

  return (
    <div className="grid grid-cols-4 gap-3">
      <StatCard label="Distance totale" value={km} unit="km" />
      <StatCard label="Dénivelé positif" value={`+${gain}`} unit="m" />
      <StatCard label="Dénivelé négatif" value={`-${loss}`} unit="m" />
      <StatCard label="Sections analysées" value={String(sections)} unit="× 100m" />
    </div>
  );
}
