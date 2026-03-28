import { useRef, useState } from 'react';
import type { Section, ProfilePoint } from '../types';
import { Slider } from '@/components/ui/slider';

interface Props {
  sections: Section[];
  profilePoints: ProfilePoint[];
}

interface HoverState {
  svgX: number;
  elevation: number;
  sectionIdx: number;
}

const RUN_COLOR = '#4AADAD';
const WALK_COLOR = '#E8C170';

const PAD_LEFT = 52;
const PAD_RIGHT = 16;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const VIEW_W = 800;
const VIEW_H = 180;
const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

export function RunWalkAnalysis({ sections, profilePoints }: Props) {
  const [threshold, setThreshold] = useState(15);
  const [hover, setHover] = useState<HoverState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (profilePoints.length < 2) return null;

  const totalDist = profilePoints[profilePoints.length - 1].cumulativeDistance;

  let runDist = 0;
  let walkDist = 0;
  for (const s of sections) {
    if (s.slope >= threshold) walkDist += s.distance;
    else runDist += s.distance;
  }
  const runPct = totalDist > 0 ? (runDist / totalDist) * 100 : 0;
  const walkPct = 100 - runPct;

  const elevations = profilePoints.map((p) => p.elevation);
  const rawMin = Math.min(...elevations);
  const rawMax = Math.max(...elevations);
  const range = Math.max(rawMax - rawMin, 50);
  const margin = range * 0.1;
  const yMin = rawMin - margin;
  const yMax = rawMax + margin;
  const yRange = yMax - yMin;

  function toX(dist: number) {
    return PAD_LEFT + (dist / totalDist) * CHART_W;
  }
  function toY(ele: number) {
    return PAD_TOP + CHART_H - ((ele - yMin) / yRange) * CHART_H;
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const svgX = Math.max(PAD_LEFT, Math.min(VIEW_W - PAD_RIGHT, (relX / rect.width) * VIEW_W));
    const distM = ((svgX - PAD_LEFT) / CHART_W) * totalDist;

    let idx = sections.length - 1;
    for (let i = 0; i < profilePoints.length - 1; i++) {
      if (distM <= profilePoints[i + 1].cumulativeDistance) { idx = i; break; }
    }

    const p1 = profilePoints[idx];
    const p2 = profilePoints[idx + 1] ?? p1;
    const span = p2.cumulativeDistance - p1.cumulativeDistance;
    const t = span > 0 ? (distM - p1.cumulativeDistance) / span : 0;
    const elevation = p1.elevation + t * (p2.elevation - p1.elevation);

    setHover({ svgX, elevation, sectionIdx: idx });
  }

  const yBase = toY(yMin);

  const colorGroups: { color: string; start: number; end: number }[] = [];
  for (let i = 0; i < sections.length; i++) {
    const color = sections[i].slope >= threshold ? WALK_COLOR : RUN_COLOR;
    const last = colorGroups[colorGroups.length - 1];
    if (last && last.color === color) last.end = i;
    else colorGroups.push({ color, start: i, end: i });
  }

  // Stats par groupe (distance totale, pente moyenne pondérée)
  const groupStats = colorGroups.map((g) => {
    const secs = sections.slice(g.start, g.end + 1);
    const dist = secs.reduce((s, sec) => s + sec.distance, 0);
    const avgSlope = secs.reduce((s, sec) => s + sec.slope * sec.distance, 0) / dist;
    return { dist, avgSlope };
  });

  const hoverGroupIdx = hover
    ? colorGroups.findIndex((g) => hover.sectionIdx >= g.start && hover.sectionIdx <= g.end)
    : -1;

  const segmentPaths = colorGroups.map((g, gi) => {
    const pts = profilePoints.slice(g.start, g.end + 2);
    if (pts.length < 2) return null;
    const top = pts.map((p) => `${toX(p.cumulativeDistance)},${toY(p.elevation)}`).join(' L');
    const x1 = toX(pts[0].cumulativeDistance);
    const x2 = toX(pts[pts.length - 1].cumulativeDistance);
    const isActive = hoverGroupIdx === -1 || hoverGroupIdx === gi;
    return (
      <path
        key={gi}
        d={`M ${top} L${x2},${yBase} L${x1},${yBase} Z`}
        fill={g.color}
        fillOpacity={isActive ? (hoverGroupIdx === gi ? 1 : 0.85) : 0.2}
        stroke={hoverGroupIdx === gi ? g.color : 'none'}
        strokeWidth={hoverGroupIdx === gi ? 1.5 : 0}
        strokeOpacity={0.8}
      />
    );
  });

  const outlinePoints = profilePoints
    .map((p) => `${toX(p.cumulativeDistance)},${toY(p.elevation)}`)
    .join(' ');

  const yTicks: number[] = [];
  for (let i = 0; i <= 3; i++) yTicks.push(yMin + (yRange * i) / 3);

  const totalKm = totalDist / 1000;
  const kmStep = totalKm <= 6 ? 1 : totalKm <= 15 ? 2 : totalKm <= 30 ? 5 : 10;
  const xTicks: number[] = [];
  for (let km = 0; km <= totalKm; km += kmStep) xTicks.push(km * 1000);

  // Tooltip — basé sur le groupe entier
  const activeGroup = hoverGroupIdx >= 0 ? colorGroups[hoverGroupIdx] : null;
  const activeStats = hoverGroupIdx >= 0 ? groupStats[hoverGroupIdx] : null;
  const isWalk = activeGroup ? activeGroup.color === WALK_COLOR : false;
  const sectionColor = isWalk ? WALK_COLOR : RUN_COLOR;
  const tooltipOnLeft = hover ? hover.svgX > VIEW_W / 2 : false;
  const tooltipW = 130;
  const tooltipH = 36;
  const tooltipY = PAD_TOP + 4;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 flex flex-col gap-6">
      <h2 className="text-base font-semibold text-gray-200">Course vs Marche</h2>

      {/* Slider */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-400">Seuil de marche</label>
          <span className="text-sm font-semibold" style={{ color: WALK_COLOR }}>≥ {threshold}%</span>
        </div>
        <Slider
          min={5}
          max={30}
          step={1}
          value={[threshold]}
          onValueChange={(vals) => setThreshold(vals[0])}
          className="w-full"
        />
        <div className="flex justify-between text-[11px] text-gray-600">
          <span>5%</span><span>30%</span>
        </div>
      </div>

      {/* Barre de répartition */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium" style={{ color: RUN_COLOR }}>
            Course — {(runDist / 1000).toFixed(1)} km ({runPct.toFixed(1)}%)
          </span>
          <span className="font-medium" style={{ color: WALK_COLOR }}>
            Marche — {(walkDist / 1000).toFixed(1)} km ({walkPct.toFixed(1)}%)
          </span>
        </div>
        <div className="h-4 w-full rounded-full overflow-hidden flex">
          <div className="h-full transition-all duration-300" style={{ width: `${runPct}%`, background: RUN_COLOR }} />
          <div className="h-full transition-all duration-300" style={{ width: `${walkPct}%`, background: WALK_COLOR }} />
        </div>
      </div>

      {/* Profil */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: 'crosshair' }}
      >
        <defs>
          <clipPath id="rw-chart-area">
            <rect x={PAD_LEFT} y={PAD_TOP} width={CHART_W} height={CHART_H} />
          </clipPath>
        </defs>

        {yTicks.map((ele, i) => (
          <line key={i} x1={PAD_LEFT} y1={toY(ele)} x2={VIEW_W - PAD_RIGHT} y2={toY(ele)} stroke="#3D3D37" strokeWidth={1} />
        ))}

        <g clipPath="url(#rw-chart-area)">
          {segmentPaths}
          <polyline points={outlinePoints} fill="none" stroke="#B0ADA5" strokeWidth={1.5} strokeLinejoin="round" />
        </g>

        {yTicks.map((ele, i) => (
          <text key={i} x={PAD_LEFT - 6} y={toY(ele) + 4} textAnchor="end" fontSize={11} fill="#6E6C66">
            {Math.round(ele)}
          </text>
        ))}

        {xTicks.map((dist, i) => (
          <text key={i} x={toX(dist)} y={VIEW_H - 4} textAnchor="middle" fontSize={11} fill="#6E6C66">
            {(dist / 1000).toFixed(0)} km
          </text>
        ))}

        {/* Hover */}
        {hover && activeGroup && activeStats && (
          <g>
            <line
              x1={hover.svgX} y1={PAD_TOP} x2={hover.svgX} y2={PAD_TOP + CHART_H}
              stroke="#ffffff" strokeWidth={1} strokeOpacity={0.3} strokeDasharray="4 3"
            />
            <circle
              cx={hover.svgX} cy={toY(hover.elevation)} r={4}
              fill={sectionColor} stroke="#161614" strokeWidth={1.5}
            />
            <rect
              x={tooltipOnLeft ? hover.svgX - 8 - tooltipW : hover.svgX + 8}
              y={tooltipY} width={tooltipW} height={tooltipH}
              rx={5} fill="#161614" stroke="#3D3D37" strokeWidth={1}
            />
            <text
              x={tooltipOnLeft ? hover.svgX - 8 - tooltipW / 2 : hover.svgX + 8 + tooltipW / 2}
              y={tooltipY + 22} textAnchor="middle" fontSize={13} fill={sectionColor} fontWeight="600"
            >
              {activeStats.dist >= 1000
                ? `${(activeStats.dist / 1000).toFixed(1)} km`
                : `${Math.round(activeStats.dist)} m`}
              {' à '}{Math.abs(activeStats.avgSlope).toFixed(1)}%
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
