import { useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import type { ProfilePoint, Section } from "../types";

interface Props {
  profilePoints: ProfilePoint[];
  sections: Section[];
}

interface HoverState {
  elevation: number;
  sectionIdx: number;
  svgX: number;
}

const RUN_COLOR = "#4AADAD";
const WALK_COLOR = "#E8C170";

const PAD_LEFT = 52;
const PAD_RIGHT = 16;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const VIEW_W = 800;
const VIEW_H = 180;
const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex by nature
export function RunWalkAnalysis({ sections, profilePoints }: Props) {
  const [threshold, setThreshold] = useState(15);
  const [hover, setHover] = useState<HoverState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const lastPoint = profilePoints.at(-1);
  if (profilePoints.length < 2 || !lastPoint) {
    return null;
  }

  const totalDist = lastPoint.cumulativeDistance;

  let runDist = 0;
  let walkDist = 0;
  for (const s of sections) {
    if (s.slope >= threshold) {
      walkDist += s.distance;
    } else {
      runDist += s.distance;
    }
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
    if (!svg) {
      return;
    }
    const rect = svg.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const svgX = Math.max(
      PAD_LEFT,
      Math.min(VIEW_W - PAD_RIGHT, (relX / rect.width) * VIEW_W)
    );
    const distM = ((svgX - PAD_LEFT) / CHART_W) * totalDist;

    let idx = sections.length - 1;
    for (let i = 0; i < profilePoints.length - 1; i++) {
      if (distM <= profilePoints[i + 1].cumulativeDistance) {
        idx = i;
        break;
      }
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
    const last = colorGroups.at(-1);
    if (last && last.color === color) {
      last.end = i;
    } else {
      colorGroups.push({ color, start: i, end: i });
    }
  }

  // Stats par groupe (distance totale, pente moyenne pondérée)
  const groupStats = colorGroups.map((g) => {
    const secs = sections.slice(g.start, g.end + 1);
    const dist = secs.reduce((s, sec) => s + sec.distance, 0);
    const avgSlope =
      secs.reduce((s, sec) => s + sec.slope * sec.distance, 0) / dist;
    return { dist, avgSlope };
  });

  const hoverGroupIdx = hover
    ? colorGroups.findIndex(
        (g) => hover.sectionIdx >= g.start && hover.sectionIdx <= g.end
      )
    : -1;

  const segmentPaths = colorGroups.map((g, gi) => {
    const pts = profilePoints.slice(g.start, g.end + 2);
    if (pts.length < 2) {
      return null;
    }
    const top = pts
      .map((p) => `${toX(p.cumulativeDistance)},${toY(p.elevation)}`)
      .join(" L");
    const x1 = toX(pts[0].cumulativeDistance);
    const x2 = toX(pts.at(-1)?.cumulativeDistance ?? pts[0].cumulativeDistance);
    const isActive = hoverGroupIdx === -1 || hoverGroupIdx === gi;
    const isHovered = hoverGroupIdx === gi;
    let fillOpacity: number;
    if (!isActive) {
      fillOpacity = 0.2;
    } else if (isHovered) {
      fillOpacity = 1;
    } else {
      fillOpacity = 0.85;
    }
    return (
      <path
        d={`M ${top} L${x2},${yBase} L${x1},${yBase} Z`}
        fill={g.color}
        fillOpacity={fillOpacity}
        key={`rwseg-${g.start}-${g.color}`}
        stroke={isHovered ? g.color : "none"}
        strokeOpacity={0.8}
        strokeWidth={isHovered ? 1.5 : 0}
      />
    );
  });

  const outlinePoints = profilePoints
    .map((p) => `${toX(p.cumulativeDistance)},${toY(p.elevation)}`)
    .join(" ");

  const yTicks: number[] = [];
  for (let i = 0; i <= 3; i++) {
    yTicks.push(yMin + (yRange * i) / 3);
  }

  const totalKm = totalDist / 1000;
  let kmStep: number;
  if (totalKm <= 6) {
    kmStep = 1;
  } else if (totalKm <= 15) {
    kmStep = 2;
  } else if (totalKm <= 30) {
    kmStep = 5;
  } else {
    kmStep = 10;
  }
  const xTicks: number[] = [];
  for (let km = 0; km <= totalKm; km += kmStep) {
    xTicks.push(km * 1000);
  }

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
    <div className="flex flex-col gap-6 rounded-xl border border-gray-700 bg-gray-900 p-6">
      <h2 className="font-semibold text-base text-gray-200">
        Course vs Marche
      </h2>

      {/* Slider */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-sm">Seuil de marche</span>
          <span className="font-semibold text-sm" style={{ color: WALK_COLOR }}>
            ≥ {threshold}%
          </span>
        </div>
        <Slider
          className="w-full"
          max={30}
          min={5}
          onValueChange={(vals) => setThreshold(vals[0])}
          step={1}
          value={[threshold]}
        />
        <div className="flex justify-between text-[11px] text-gray-600">
          <span>5%</span>
          <span>30%</span>
        </div>
      </div>

      {/* Barre de répartition */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium" data-testid="run-distance" style={{ color: RUN_COLOR }}>
            Course — {(runDist / 1000).toFixed(1)} km ({runPct.toFixed(1)}%)
          </span>
          <span className="font-medium" data-testid="walk-distance" style={{ color: WALK_COLOR }}>
            Marche — {(walkDist / 1000).toFixed(1)} km ({walkPct.toFixed(1)}%)
          </span>
        </div>
        <div className="flex h-4 w-full overflow-hidden rounded-full">
          <div
            className="h-full transition-all duration-300"
            style={{ width: `${runPct}%`, background: RUN_COLOR }}
          />
          <div
            className="h-full transition-all duration-300"
            style={{ width: `${walkPct}%`, background: WALK_COLOR }}
          />
        </div>
      </div>

      {/* Profil */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: interactive SVG chart; no HTML semantic alternative */}
      <svg
        aria-label="Profil course/marche"
        onMouseLeave={() => setHover(null)}
        onMouseMove={handleMouseMove}
        preserveAspectRatio="xMidYMid meet"
        ref={svgRef}
        role="application"
        style={{ cursor: "crosshair" }}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
      >
        <defs>
          <clipPath id="rw-chart-area">
            <rect height={CHART_H} width={CHART_W} x={PAD_LEFT} y={PAD_TOP} />
          </clipPath>
        </defs>

        {yTicks.map((ele) => (
          <line
            key={`hgrid-${ele}`}
            stroke="#3D3D37"
            strokeWidth={1}
            x1={PAD_LEFT}
            x2={VIEW_W - PAD_RIGHT}
            y1={toY(ele)}
            y2={toY(ele)}
          />
        ))}

        <g clipPath="url(#rw-chart-area)">
          {segmentPaths}
          <polyline
            fill="none"
            points={outlinePoints}
            stroke="#B0ADA5"
            strokeLinejoin="round"
            strokeWidth={1.5}
          />
        </g>

        {yTicks.map((ele) => (
          <text
            fill="#6E6C66"
            fontSize={11}
            key={`ylabel-${ele}`}
            textAnchor="end"
            x={PAD_LEFT - 6}
            y={toY(ele) + 4}
          >
            {Math.round(ele)}
          </text>
        ))}

        {xTicks.map((dist) => (
          <text
            fill="#6E6C66"
            fontSize={11}
            key={`xlabel-${dist}`}
            textAnchor="middle"
            x={toX(dist)}
            y={VIEW_H - 4}
          >
            {(dist / 1000).toFixed(0)} km
          </text>
        ))}

        {/* Hover */}
        {hover && activeGroup && activeStats && (
          <g>
            <line
              stroke="#ffffff"
              strokeDasharray="4 3"
              strokeOpacity={0.3}
              strokeWidth={1}
              x1={hover.svgX}
              x2={hover.svgX}
              y1={PAD_TOP}
              y2={PAD_TOP + CHART_H}
            />
            <circle
              cx={hover.svgX}
              cy={toY(hover.elevation)}
              fill={sectionColor}
              r={4}
              stroke="var(--chart-surface)"
              strokeWidth={1.5}
            />
            <rect
              fill="var(--chart-surface)"
              height={tooltipH}
              rx={5}
              stroke="#3D3D37"
              strokeWidth={1}
              width={tooltipW}
              x={tooltipOnLeft ? hover.svgX - 8 - tooltipW : hover.svgX + 8}
              y={tooltipY}
            />
            <text
              fill={sectionColor}
              fontSize={13}
              fontWeight="600"
              textAnchor="middle"
              x={
                tooltipOnLeft
                  ? hover.svgX - 8 - tooltipW / 2
                  : hover.svgX + 8 + tooltipW / 2
              }
              y={tooltipY + 22}
            >
              {activeStats.dist >= 1000
                ? `${(activeStats.dist / 1000).toFixed(1)} km`
                : `${Math.round(activeStats.dist)} m`}
              {" à "}
              {Math.abs(activeStats.avgSlope).toFixed(1)}%
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
