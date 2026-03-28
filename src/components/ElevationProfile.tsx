import { useRef, useState } from 'react';
import type { Section, ProfilePoint } from '../types';

interface Props {
  sections: Section[];
  profilePoints: ProfilePoint[];
  slopeHexFn: (slope: number) => string;
}

interface HoverState {
  svgX: number;
  distM: number;
  elevation: number;
  slope: number;
  slopeColor: string;
}

interface ZoomRange {
  from: number; // mètres
  to: number;
}

interface DragState {
  startSvgX: number;
  currentSvgX: number;
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

export function ElevationProfile({ sections, profilePoints, slopeHexFn }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [zoom, setZoom] = useState<ZoomRange | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  if (profilePoints.length < 2) return null;

  const totalDist = profilePoints[profilePoints.length - 1].cumulativeDistance;
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
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    return Math.max(PAD_LEFT, Math.min(VIEW_W - PAD_RIGHT, (relX / rect.width) * VIEW_W));
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const svgX = getClientSvgX(e);
    setDrag({ startSvgX: svgX, currentSvgX: svgX });
    setHover(null);
  }

  function handleMouseMove(e: React.MouseEvent) {
    const svgX = getClientSvgX(e);

    if (drag) {
      setDrag((d) => d ? { ...d, currentSvgX: svgX } : null);
      return;
    }

    // Hover normal
    const distM = svgXToDist(svgX);
    let idx = sections.length - 1;
    for (let i = 0; i < profilePoints.length - 1; i++) {
      if (distM <= profilePoints[i + 1].cumulativeDistance) { idx = i; break; }
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
    if (!drag) return;
    const { startSvgX, currentSvgX } = drag;
    const dx = currentSvgX - startSvgX;
    setDrag(null);

    if (Math.abs(dx) < MIN_DRAG_PX) return; // simple clic, pas de zoom

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
    const last = colorGroups[colorGroups.length - 1];
    if (last && last.color === color) last.end = i;
    else colorGroups.push({ color, start: i, end: i });
  }

  const segmentPaths = colorGroups.map((g, gi) => {
    const pts = profilePoints.slice(g.start, g.end + 2);
    if (pts.length < 2) return null;
    const top = pts.map((p) => `${toX(p.cumulativeDistance)},${toY(p.elevation)}`).join(' L');
    const x1 = toX(pts[0].cumulativeDistance);
    const x2 = toX(pts[pts.length - 1].cumulativeDistance);
    return (
      <path
        key={gi}
        d={`M ${top} L${x2},${yBase} L${x1},${yBase} Z`}
        fill={g.color}
        fillOpacity={0.85}
      />
    );
  });

  const outlinePoints = profilePoints
    .map((p) => `${toX(p.cumulativeDistance)},${toY(p.elevation)}`)
    .join(' ');

  const yTicks: number[] = [];
  for (let i = 0; i <= 4; i++) yTicks.push(yMin + (yRange * i) / 4);

  const totalKm = visibleRange / 1000;
  const kmStep = totalKm <= 2 ? 0.5 : totalKm <= 6 ? 1 : totalKm <= 15 ? 2 : totalKm <= 30 ? 5 : 10;
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
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-200">Profil altimétrique</h2>
        {zoom && (
          <button
            onClick={() => setZoom(null)}
            className="text-xs text-gray-500 hover:text-gray-300 underline"
          >
            Réinitialiser le zoom
          </button>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: drag ? 'col-resize' : 'crosshair', userSelect: 'none' }}
      >
        <defs>
          <clipPath id="chart-area">
            <rect x={PAD_LEFT} y={PAD_TOP} width={CHART_W} height={CHART_H} />
          </clipPath>
        </defs>

        {/* Grille horizontale */}
        {yTicks.map((ele, i) => (
          <line key={i} x1={PAD_LEFT} y1={toY(ele)} x2={VIEW_W - PAD_RIGHT} y2={toY(ele)} stroke="#3D3D37" strokeWidth={1} />
        ))}

        {/* Contenu clipé */}
        <g clipPath="url(#chart-area)">
          {segmentPaths}
          <polyline points={outlinePoints} fill="none" stroke="#B0ADA5" strokeWidth={1.5} strokeLinejoin="round" />

          {/* Rectangle de sélection */}
          {drag && selW > 1 && (
            <rect x={selX1} y={PAD_TOP} width={selW} height={CHART_H} fill="#ffffff" fillOpacity={0.08} stroke="#ffffff" strokeOpacity={0.3} strokeWidth={1} />
          )}
        </g>

        {/* Labels Y */}
        {yTicks.map((ele, i) => (
          <text key={i} x={PAD_LEFT - 6} y={toY(ele) + 4} textAnchor="end" fontSize={11} fill="#6E6C66">
            {Math.round(ele)}
          </text>
        ))}

        {/* Labels X */}
        {xTicks.map((dist, i) => (
          <text key={i} x={toX(dist)} y={VIEW_H - 6} textAnchor="middle" fontSize={11} fill="#6E6C66">
            {(dist / 1000 % 1 === 0) ? `${dist / 1000} km` : `${(dist / 1000).toFixed(1)} km`}
          </text>
        ))}

        {/* Hover */}
        {hover && !drag && (
          <g>
            <line x1={hover.svgX} y1={PAD_TOP} x2={hover.svgX} y2={PAD_TOP + CHART_H} stroke="#ffffff" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="4 3" />
            <circle cx={hover.svgX} cy={toY(hover.elevation)} r={4} fill={hover.slopeColor} stroke="#161614" strokeWidth={1.5} />
            <rect
              x={tooltipOnLeft ? hover.svgX - 8 - tooltipW : hover.svgX + 8}
              y={tooltipY}
              width={tooltipW}
              height={tooltipH}
              rx={5}
              fill="#161614"
              stroke="#3D3D37"
              strokeWidth={1}
            />
            <text x={tooltipOnLeft ? hover.svgX - 8 - tooltipW / 2 : hover.svgX + 8 + tooltipW / 2} y={tooltipY + 17} textAnchor="middle" fontSize={12} fill="#B0ADA5" fontWeight="600">
              {(hover.distM / 1000).toFixed(2)} km
            </text>
            <text x={tooltipOnLeft ? hover.svgX - 8 - tooltipW / 2 : hover.svgX + 8 + tooltipW / 2} y={tooltipY + 34} textAnchor="middle" fontSize={12} fill={hover.slopeColor} fontWeight="600">
              {hover.slope >= 0 ? '+' : ''}{hover.slope.toFixed(1)}%
            </text>
          </g>
        )}
      </svg>
      {!zoom && <p className="text-[11px] text-gray-600 mt-2 text-center">Glisser pour zoomer · Double-clic pour dézoomer</p>}
    </div>
  );
}
