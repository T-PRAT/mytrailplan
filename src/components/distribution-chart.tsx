import type { SlopeBucket } from "../types";

interface Props {
  downhillBuckets: SlopeBucket[];
  uphillBuckets: SlopeBucket[];
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
    if (i === 0) {
      return "";
    }
    if (i === downhillBuckets.length) {
      return "0";
    }
    if (i === n) {
      return "";
    }
    if (i < downhillBuckets.length) {
      // frontière dans la descente (ordre inversé)
      const bucket = downhillReversed[i - 1];
      return `-${bucket.minSlope}`;
    }
    // frontière dans la montée
    const bucket = uphillBuckets[i - downhillBuckets.length];
    return `+${bucket.minSlope}`;
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
      <h2 className="mb-4 font-semibold text-base text-gray-200">
        Distribution des pentes
      </h2>
      <svg
        aria-label="Distribution des pentes"
        data-testid="distribution-chart"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
      >
        {/* Grille horizontale + labels Y */}
        {yTicks.map((t) => {
          const y = PAD_TOP + CHART_H - t * CHART_H;
          const km = ((maxDist * t) / 1000).toFixed(1);
          return (
            <g key={`ytick-${t}`}>
              <line
                stroke="#3D3D37"
                strokeWidth={1}
                x1={PAD_LEFT}
                x2={VIEW_W - PAD_RIGHT}
                y1={y}
                y2={y}
              />
              <text
                fill="#6E6C66"
                fontSize={11}
                textAnchor="end"
                x={PAD_LEFT - 6}
                y={y + 4}
              >
                {t > 0 ? `${km}km` : "0"}
              </text>
            </g>
          );
        })}

        {/* Axe X */}
        <line
          stroke="#56554E"
          strokeWidth={1}
          x1={PAD_LEFT}
          x2={VIEW_W - PAD_RIGHT}
          y1={axisY}
          y2={axisY}
        />

        {/* Ticks et labels de l'axe X aux frontières des barres */}
        {Array.from({ length: n + 1 }, (_, i) => {
          const x = PAD_LEFT + i * barW;
          const label = boundaryLabel(i);
          return (
            <g key={`xtick-x${Math.round(x)}`}>
              <line
                stroke="#56554E"
                strokeWidth={1}
                x1={x}
                x2={x}
                y1={axisY}
                y2={axisY + 5}
              />
              {label && (
                <text
                  fill="#6E6C66"
                  fontSize={10}
                  textAnchor="middle"
                  x={x}
                  y={axisY + 18}
                >
                  {label}%
                </text>
              )}
            </g>
          );
        })}

        {/* Label axe X */}
        <text
          fill="#56554E"
          fontSize={11}
          textAnchor="middle"
          x={VIEW_W / 2}
          y={VIEW_H - 2}
        >
          Pente (%)
        </text>

        {/* Barres */}
        {bars.map((bar, i) => {
          const h = (bar.bucket.distance / maxDist) * CHART_H;
          const x = PAD_LEFT + i * barW + gap;
          const y = PAD_TOP + CHART_H - h;

          return (
            <g key={bar.hex}>
              <rect
                fill={bar.hex}
                fillOpacity={0.9}
                height={h}
                rx={3}
                width={innerW}
                x={x}
                y={y}
              />
              {bar.bucket.distance > 0 && (
                <g>
                  <text
                    fill="#B0ADA5"
                    fontSize={10}
                    textAnchor="middle"
                    x={x + innerW / 2}
                    y={y - 14}
                  >
                    {(bar.bucket.distance / 1000).toFixed(1)}km
                  </text>
                  <text
                    fill="#6E6C66"
                    fontSize={10}
                    textAnchor="middle"
                    x={x + innerW / 2}
                    y={y - 3}
                  >
                    {bar.bucket.percentage.toFixed(1)}%
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Séparateur 0% */}
        <line
          stroke="#6E6C66"
          strokeDasharray="4 3"
          strokeWidth={1.5}
          x1={separatorX}
          x2={separatorX}
          y1={PAD_TOP}
          y2={axisY}
        />
      </svg>
    </div>
  );
}
