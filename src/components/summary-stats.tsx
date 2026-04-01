import { Card, CardContent } from "@/components/ui/card";
import type { AnalysisResult } from "../types";

interface Props {
  result: AnalysisResult;
}

function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <Card className="border-gray-700 bg-gray-900 text-center shadow-none">
      <CardContent className="p-5">
        <div className="font-bold text-2xl text-gray-100">
          {value}{" "}
          <span className="font-normal text-base text-gray-500">{unit}</span>
        </div>
        <div className="mt-1 text-gray-500 text-sm">{label}</div>
      </CardContent>
    </Card>
  );
}

export function SummaryStats({ result }: Props) {
  const km = (result.totalDistance / 1000).toFixed(2);
  const gain = Math.round(result.totalGain);
  const loss = Math.round(result.totalLoss);
  const sections = result.sections.length;

  return (
    <div className="grid grid-cols-4 gap-3">
      <div data-testid="stat-distance"><StatCard label="Distance totale" unit="km" value={km} /></div>
      <div data-testid="stat-gain"><StatCard label="Dénivelé positif" unit="m" value={`+${gain}`} /></div>
      <div data-testid="stat-loss"><StatCard label="Dénivelé négatif" unit="m" value={`-${loss}`} /></div>
      <div data-testid="stat-sections"><StatCard
        label="Sections analysées"
        unit="× 100m"
        value={String(sections)}
      /></div>
    </div>
  );
}
