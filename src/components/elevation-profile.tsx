import { useRef, useState } from "react";
import type { ProfilePoint, Section } from "../types";

interface Props {
  profilePoints: ProfilePoint[];
  sections: Section[];
  slopeHexFn: (slope: number) => string;
}

interface HoverState {
  distM: number;
  elevation: number;
  slope: number;
  slopeColor: string;
  svgX: number;
}

interface ZoomRange {
  from: number; // mètres
  to: number;
}

interface DragState {
  currentSvgX: number;
  startSvgX: number;
}

const PAD_LEFT = 52;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const VIEW_W = 800;
const VIEW_H = 260;
const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = VIEW_H - PAD_TOP - PAD_BOTTOM;
const MIN_DRAG_PX = 8; // seuil minimum pour déclencher un zoom

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex by nature
export function ElevationProfile({
  sections,
  profilePoints,
  slopeHexFn,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [zoom, setZoom] = useState<ZoomRange | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const lastPoint = profilePoints.at(-1);
  if (profilePoints.length < 2 || !lastPoint) {
    return null;
  }

  const totalDist = lastPoint.cumulativeDistance;
  const visibleFrom = zoom?.from ?? 0;
  const visibleTo = zoom?.to ?? totalDist;
  const visibleRange = visibleTo - visibleFrom;

  const elevations = profilePoints.map((p) => p.elevation);
  const rawMin = Math.min(...elevations);
  const rawMax = Math.max(...elevations);
  const range = Math.max(rawMax - rawMin, 50);
  const margin = range * 0.1;
  const yMin = rawMin - margin;
  const yMax = rawMax + margin;
  const yRange = yMax - yMin;

  function toX(dist: number) {
    return PAD_LEFT + ((dist - visibleFrom) / visibleRange) * CHART_W;
  }

  function toY(ele: number) {
    return PAD_TOP + CHART_H - ((ele - yMin) / yRange) * CHART_H;
  }

  function svgXToDist(svgX: number): number {
    return visibleFrom + ((svgX - PAD_LEFT) / CHART_W) * visibleRange;
  }

  function getClientSvgX(e: React.MouseEvent): number {
    const svg = svgRef.current;
    if (!svg) {
      return 0;
    }
    const rect = svg.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    return Math.max(
      PAD_LEFT,
      Math.min(VIEW_W - PAD_RIGHT, (relX / rect.width) * VIEW_W)
    );
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    const svgX = getClientSvgX(e);
    setDrag({ startSvgX: svgX, currentSvgX: svgX });
    setHover(null);
  }

  function handleMouseMove(e: React.MouseEvent) {
    const svgX = getClientSvgX(e);

    if (drag) {
      setDrag((d) => (d ? { ...d, currentSvgX: svgX } : null));
      return;
    }

    // Hover normal
    const distM = svgXToDist(svgX);
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
    const slope = sections[idx].slope;
    setHover({ svgX, distM, elevation, slope, slopeColor: slopeHexFn(slope) });
  }

  function handleMouseUp() {
    if (!drag) {
      return;
    }
    const { startSvgX, currentSvgX } = drag;
    const dx = currentSvgX - startSvgX;
    setDrag(null);

    if (Math.abs(dx) < MIN_DRAG_PX) {
      return; // simple clic, pas de zoom
    }

    const fromDist = svgXToDist(Math.min(startSvgX, currentSvgX));
    const toDist = svgXToDist(Math.max(startSvgX, currentSvgX));
    setZoom({ from: Math.max(0, fromDist), to: Math.min(totalDist, toDist) });
    setHover(null);
  }

  function handleDoubleClick() {
    setZoom(null);
    setHover(null);
  }

  function handleMouseLeave() {
    setDrag(null);
    setHover(null);
  }

  const yBase = toY(yMin);

  // Grouper les sections consécutives de même couleur en un seul chemin SVG
  const colorGroups: { color: string; start: number; end: number }[] = [];
  for (let i = 0; i < sections.length; i++) {
    const color = slopeHexFn(sections[i].slope);
    const last = colorGroups.at(-1);
    if (last && last.color === color) {
      last.end = i;
    } else {
      colorGroups.push({ color, start: i, end: i });
    }
  }

  const segmentPaths = colorGroups.map((g) => {
    const pts = profilePoints.slice(g.start, g.end + 2);
    if (pts.length < 2) {
      return null;
    }
    const top = pts
      .map((p) => `${toX(p.cumulativeDistance)},${toY(p.elevation)}`)
      .join(" L");
    const x1 = toX(pts[0].cumulativeDistance);
    const x2 = toX(pts.at(-1)?.cumulativeDistance ?? pts[0].cumulativeDistance);
    return (
      <path
        d={`M ${top} L${x2},${yBase} L${x1},${yBase} Z`}
        fill={g.color}
        fillOpacity={0.85}
        key={`seg-${g.start}-${g.color}`}
      />
    );
  });

  const outlinePoints = profilePoints
    .map((p) => `${toX(p.cumulativeDistance)},${toY(p.elevation)}`)
    .join(" ");

  const yTicks: number[] = [];
  for (let i = 0; i <= 4; i++) {
    yTicks.push(yMin + (yRange * i) / 4);
  }

  const totalKm = visibleRange / 1000;
  let kmStep: number;
  if (totalKm <= 2) {
    kmStep = 0.5;
  } else if (totalKm <= 6) {
    kmStep = 1;
  } else if (totalKm <= 15) {
    kmStep = 2;
  } else if (totalKm <= 30) {
    kmStep = 5;
  } else {
    kmStep = 10;
  }
  const xTicks: number[] = [];
  const startKm = Math.ceil(visibleFrom / 1000 / kmStep) * kmStep;
  for (let km = startKm; km <= visibleTo / 1000 + 0.001; km += kmStep) {
    xTicks.push(km * 1000);
  }

  // Sélection en cours (rectangle de zoom)
  const selX1 = drag ? Math.min(drag.startSvgX, drag.currentSvgX) : 0;
  const selX2 = drag ? Math.max(drag.startSvgX, drag.currentSvgX) : 0;
  const selW = selX2 - selX1;

  // Tooltip
  const tooltipOnLeft = hover ? hover.svgX > VIEW_W / 2 : false;
  const tooltipW = 110;
  const tooltipH = 46;
  const tooltipY = PAD_TOP + 8;

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-base text-gray-200">
          Profil altimétrique
        </h2>
        {zoom && (
          <button
            className="text-gray-500 text-xs underline hover:text-gray-300"
            onClick={() => setZoom(null)}
            type="button"
          >
            Réinitialiser le zoom
          </button>
        )}
      </div>

      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: interactive SVG chart; no HTML semantic alternative */}
      <svg
        aria-label="Profil altimétrique"
        data-testid="elevation-profile"
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        preserveAspectRatio="xMidYMid meet"
        ref={svgRef}
        role="application"
        style={{
          cursor: drag ? "col-resize" : "crosshair",
          userSelect: "none",
        }}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
      >
        <defs>
          <clipPath id="chart-area">
            <rect height={CHART_H} width={CHART_W} x={PAD_LEFT} y={PAD_TOP} />
          </clipPath>
        </defs>

        {/* Grille horizontale */}
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

        {/* Contenu clipé */}
        <g clipPath="url(#chart-area)">
          {segmentPaths}
          <polyline
            fill="none"
            points={outlinePoints}
            stroke="#B0ADA5"
            strokeLinejoin="round"
            strokeWidth={1.5}
          />

          {/* Rectangle de sélection */}
          {drag && selW > 1 && (
            <rect
              fill="#ffffff"
              fillOpacity={0.08}
              height={CHART_H}
              stroke="#ffffff"
              strokeOpacity={0.3}
              strokeWidth={1}
              width={selW}
              x={selX1}
              y={PAD_TOP}
            />
          )}
        </g>

        {/* Labels Y */}
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

        {/* Labels X */}
        {xTicks.map((dist) => (
          <text
            fill="#6E6C66"
            fontSize={11}
            key={`xlabel-${dist}`}
            textAnchor="middle"
            x={toX(dist)}
            y={VIEW_H - 6}
          >
            {(dist / 1000) % 1 === 0
              ? `${dist / 1000} km`
              : `${(dist / 1000).toFixed(1)} km`}
          </text>
        ))}

        {/* Hover */}
        {hover && !drag && (
          <g>
            <line
              stroke="#ffffff"
              strokeDasharray="4 3"
              strokeOpacity={0.4}
              strokeWidth={1}
              x1={hover.svgX}
              x2={hover.svgX}
              y1={PAD_TOP}
              y2={PAD_TOP + CHART_H}
            />
            <circle
              cx={hover.svgX}
              cy={toY(hover.elevation)}
              fill={hover.slopeColor}
              r={4}
              stroke="#161614"
              strokeWidth={1.5}
            />
            <rect
              fill="#161614"
              height={tooltipH}
              rx={5}
              stroke="#3D3D37"
              strokeWidth={1}
              width={tooltipW}
              x={tooltipOnLeft ? hover.svgX - 8 - tooltipW : hover.svgX + 8}
              y={tooltipY}
            />
            <text
              fill="#B0ADA5"
              fontSize={12}
              fontWeight="600"
              textAnchor="middle"
              x={
                tooltipOnLeft
                  ? hover.svgX - 8 - tooltipW / 2
                  : hover.svgX + 8 + tooltipW / 2
              }
              y={tooltipY + 17}
            >
              {(hover.distM / 1000).toFixed(2)} km
            </text>
            <text
              fill={hover.slopeColor}
              fontSize={12}
              fontWeight="600"
              textAnchor="middle"
              x={
                tooltipOnLeft
                  ? hover.svgX - 8 - tooltipW / 2
                  : hover.svgX + 8 + tooltipW / 2
              }
              y={tooltipY + 34}
            >
              {hover.slope >= 0 ? "+" : ""}
              {hover.slope.toFixed(1)}%
            </text>
          </g>
        )}
      </svg>
      {!zoom && (
        <p className="mt-2 text-center text-[11px] text-gray-600">
          Glisser pour zoomer · Double-clic pour dézoomer
        </p>
      )}
    </div>
  );
}
