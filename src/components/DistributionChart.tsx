import type { SlopeBucket } from '../types';

interface Props {
  uphillBuckets: SlopeBucket[];
  downhillBuckets: SlopeBucket[];
}

const CHART_H = 192;
const PAD_LEFT = 44;
const PAD_RIGHT = 8;
const PAD_TOP = 36;
const PAD_BOTTOM = 36;
const VIEW_W = 800;
const VIEW_H = CHART_H + PAD_TOP + PAD_BOTTOM;


export function DistributionChart({ uphillBuckets, downhillBuckets }: Props) {
  // Descente : ordre inversé (steep d'abord à gauche)
  const downhillReversed = [...downhillBuckets].reverse();
  const bars = [
    ...downhillReversed.map((b) => ({ bucket: b, hex: b.color })),
    ...uphillBuckets.map((b) => ({ bucket: b, hex: b.color })),
  ];

  const maxDist = Math.max(...bars.map((b) => b.bucket.distance), 1);

  const n = bars.length;
  const chartW = VIEW_W - PAD_LEFT - PAD_RIGHT;
  const barW = chartW / n;
  const gap = barW * 0.12;
  const innerW = barW - gap * 2;

  const yTicks = [0, 0.5, 1];
  const separatorX = PAD_LEFT + downhillBuckets.length * barW;
  const axisY = PAD_TOP + CHART_H;

  // Labels aux frontières des barres
  function boundaryLabel(i: number): string {
    if (i === 0) return '';
    if (i === downhillBuckets.length) return '0';
    if (i === n) return '';
    if (i < downhillBuckets.length) {
      // frontière dans la descente (ordre inversé)
      const bucket = downhillReversed[i - 1];
      return `-${bucket.minSlope}`;
    } else {
      // frontière dans la montée
      const bucket = uphillBuckets[i - downhillBuckets.length];
      return `+${bucket.minSlope}`;
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
      <h2 className="text-base font-semibold text-gray-200 mb-4">Distribution des pentes</h2>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" preserveAspectRatio="xMidYMid meet">

        {/* Grille horizontale + labels Y */}
        {yTicks.map((t, i) => {
          const y = PAD_TOP + CHART_H - t * CHART_H;
          const km = ((maxDist * t) / 1000).toFixed(1);
          return (
            <g key={i}>
              <line x1={PAD_LEFT} y1={y} x2={VIEW_W - PAD_RIGHT} y2={y} stroke="#3D3D37" strokeWidth={1} />
              <text x={PAD_LEFT - 6} y={y + 4} textAnchor="end" fontSize={11} fill="#6E6C66">
                {t > 0 ? `${km}km` : '0'}
              </text>
            </g>
          );
        })}

        {/* Axe X */}
        <line x1={PAD_LEFT} y1={axisY} x2={VIEW_W - PAD_RIGHT} y2={axisY} stroke="#56554E" strokeWidth={1} />

        {/* Ticks et labels de l'axe X aux frontières des barres */}
        {Array.from({ length: n + 1 }, (_, i) => {
          const x = PAD_LEFT + i * barW;
          const label = boundaryLabel(i);
          return (
            <g key={i}>
              <line x1={x} y1={axisY} x2={x} y2={axisY + 5} stroke="#56554E" strokeWidth={1} />
              {label && (
                <text x={x} y={axisY + 18} textAnchor="middle" fontSize={10} fill="#6E6C66">
                  {label}%
                </text>
              )}
            </g>
          );
        })}

        {/* Label axe X */}
        <text x={VIEW_W / 2} y={VIEW_H - 2} textAnchor="middle" fontSize={11} fill="#56554E">
          Pente (%)
        </text>

        {/* Barres */}
        {bars.map((bar, i) => {
          const h = (bar.bucket.distance / maxDist) * CHART_H;
          const x = PAD_LEFT + i * barW + gap;
          const y = PAD_TOP + CHART_H - h;

          return (
            <g key={i}>
              <rect x={x} y={y} width={innerW} height={h} fill={bar.hex} rx={3} fillOpacity={0.9} />
              {bar.bucket.distance > 0 && (
                <g>
                  <text x={x + innerW / 2} y={y - 14} textAnchor="middle" fontSize={10} fill="#B0ADA5">
                    {(bar.bucket.distance / 1000).toFixed(1)}km
                  </text>
                  <text x={x + innerW / 2} y={y - 3} textAnchor="middle" fontSize={10} fill="#6E6C66">
                    {bar.bucket.percentage.toFixed(1)}%
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Séparateur 0% */}
        <line x1={separatorX} y1={PAD_TOP} x2={separatorX} y2={axisY} stroke="#6E6C66" strokeWidth={1.5} strokeDasharray="4 3" />
      </svg>
    </div>
  );
}
