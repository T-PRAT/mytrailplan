import { useMemo, useRef, useState } from 'react';
import type { AidStation, ProfilePoint, Section } from '../types';
import {
  formatPace, formatTime, gapPaceFromTime, parseDuration, simulateGap,
} from '../lib/gapCalculation';

interface Props {
  sections: Section[];
  profilePoints: ProfilePoint[];
  totalDistance: number;
  slopeHexFn: (slope: number) => string;
}

interface HoverState {
  svgX: number;
  distM: number;
  elevation: number;
  slope: number;
}

interface Leg {
  fromName: string;
  toName: string;
  fromDist: number;
  toDist: number;
  distance: number;
  elevGain: number;
  elevLoss: number;
  time: number;
  cumulativeTime: number;
}

const PAD_LEFT = 52;
const PAD_RIGHT = 16;
const PAD_TOP = 20;
const PAD_BOTTOM = 28;
const VIEW_W = 800;
const VIEW_H_PROFILE = 230;
const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = VIEW_H_PROFILE - PAD_TOP - PAD_BOTTOM;

const VIEW_H_BAR = 90;
const BAR_PAD_TOP = 22;
const BAR_H = 34;

const DEFAULT_GAP_PACE = 360;
const SLIDER_MIN = 180;
const SLIDER_MAX = 1200;

const AID_COLORS = ['#2E6B8A', '#4AADAD', '#7DCFB6', '#5B8DB8', '#3D8B9E'];

function computeLegs(
  sections: Section[],
  profilePoints: ProfilePoint[],
  aidStations: AidStation[],
  totalDistance: number,
  gapPace: number,
): Leg[] {
  const sorted = [...aidStations].sort((a, b) => a.distanceFromStart - b.distanceFromStart);
  const boundaries = [0, ...sorted.map(s => s.distanceFromStart), totalDistance];
  const names = ['Départ', ...sorted.map(s => s.name), 'Arrivée'];

  const legs: Leg[] = [];
  let cumulativeTime = 0;

  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i];
    const to = boundaries[i + 1];

    const legSections: Section[] = [];
    let elevGain = 0;
    let elevLoss = 0;

    for (let j = 0; j < sections.length; j++) {
      const secStart = profilePoints[j].cumulativeDistance;
      const secEnd = (profilePoints[j + 1] ?? profilePoints[j]).cumulativeDistance;
      const mid = (secStart + secEnd) / 2;
      if (mid >= from && mid < to) {
        legSections.push(sections[j]);
        elevGain += sections[j].elevationGain;
        elevLoss += sections[j].elevationLoss;
      }
    }

    const sim = simulateGap(legSections, gapPace);
    cumulativeTime += sim.totalTime;

    legs.push({
      fromName: names[i],
      toName: names[i + 1],
      fromDist: from,
      toDist: to,
      distance: to - from,
      elevGain,
      elevLoss,
      time: sim.totalTime,
      cumulativeTime,
    });
  }

  return legs;
}

export function AidStationPlanner({ sections, profilePoints, totalDistance, slopeHexFn }: Props) {
  const [aidStations, setAidStations] = useState<AidStation[]>([]);
  const [mode, setMode] = useState<'vap' | 'duration'>('vap');
  const [sliderPace, setSliderPace] = useState(DEFAULT_GAP_PACE);
  const [durationInput, setDurationInput] = useState('');
  const [hover, setHover] = useState<HoverState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoveredLegIdx, setHoveredLegIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const didDragRef = useRef(false);

  const parsedDuration = useMemo(() => parseDuration(durationInput), [durationInput]);
  const durationInvalid = durationInput.length > 0 && parsedDuration === null;

  const gapPace = useMemo(() => {
    if (mode === 'vap') return sliderPace;
    if (parsedDuration) return gapPaceFromTime(sections, parsedDuration);
    return null;
  }, [mode, sliderPace, parsedDuration, sections]);

  const legs = useMemo(() => {
    if (!gapPace) return [];
    return computeLegs(sections, profilePoints, aidStations, totalDistance, gapPace);
  }, [sections, profilePoints, aidStations, totalDistance, gapPace]);

  if (profilePoints.length < 2) return null;

  // --- Coordinate helpers ---
  const elevations = profilePoints.map(p => p.elevation);
  const rawMin = Math.min(...elevations);
  const rawMax = Math.max(...elevations);
  const eleRange = Math.max(rawMax - rawMin, 50);
  const eleMargin = eleRange * 0.1;
  const yMin = rawMin - eleMargin;
  const yMax = rawMax + eleMargin;
  const yRange = yMax - yMin;

  function toX(distM: number) {
    return PAD_LEFT + (distM / totalDistance) * CHART_W;
  }
  function toY(ele: number) {
    return PAD_TOP + CHART_H - ((ele - yMin) / yRange) * CHART_H;
  }
  function svgXToDist(svgX: number): number {
    return ((svgX - PAD_LEFT) / CHART_W) * totalDistance;
  }
  function getClientSvgX(e: React.MouseEvent): number {
    const svg = svgRef.current;
    if (!svg) return PAD_LEFT;
    const rect = svg.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    return Math.max(PAD_LEFT, Math.min(VIEW_W - PAD_RIGHT, (relX / rect.width) * VIEW_W));
  }

  // --- Elevation profile rendering ---
  const colorGroups: { color: string; start: number; end: number }[] = [];
  for (let i = 0; i < sections.length; i++) {
    const color = slopeHexFn(sections[i].slope);
    const last = colorGroups[colorGroups.length - 1];
    if (last && last.color === color) last.end = i;
    else colorGroups.push({ color, start: i, end: i });
  }
  const yBase = toY(yMin);

  const elevationPaths = colorGroups.map((g, gi) => {
    const pts = profilePoints.slice(g.start, g.end + 2);
    if (pts.length < 2) return null;
    const top = pts.map(p => `${toX(p.cumulativeDistance)},${toY(p.elevation)}`).join(' L');
    const x1 = toX(pts[0].cumulativeDistance);
    const x2 = toX(pts[pts.length - 1].cumulativeDistance);
    return (
      <path key={gi} d={`M ${top} L${x2},${yBase} L${x1},${yBase} Z`}
        fill={g.color} fillOpacity={0.85} />
    );
  });

  const outlinePoints = profilePoints
    .map(p => `${toX(p.cumulativeDistance)},${toY(p.elevation)}`)
    .join(' ');

  const yTicks: number[] = [];
  for (let i = 0; i <= 4; i++) yTicks.push(yMin + (yRange * i) / 4);

  const totalKm = totalDistance / 1000;
  const kmStep = totalKm <= 2 ? 0.5 : totalKm <= 6 ? 1 : totalKm <= 15 ? 2 : totalKm <= 30 ? 5 : 10;
  const xTicks: number[] = [];
  for (let km = 0; km <= totalKm + 0.001; km += kmStep) xTicks.push(km * 1000);

  // --- Hover logic ---
  function getSectionAtDist(distM: number): number {
    let idx = sections.length - 1;
    for (let i = 0; i < profilePoints.length - 1; i++) {
      if (distM <= profilePoints[i + 1].cumulativeDistance) { idx = i; break; }
    }
    return idx;
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svgX = getClientSvgX(e);
    const distM = Math.max(0, Math.min(totalDistance, svgXToDist(svgX)));

    if (dragId) {
      didDragRef.current = true;
      const sorted = [...aidStations].sort((a, b) => a.distanceFromStart - b.distanceFromStart);
      const idx = sorted.findIndex(s => s.id === dragId);
      const prevDist = idx > 0 ? sorted[idx - 1].distanceFromStart : 0;
      const nextDist = idx < sorted.length - 1 ? sorted[idx + 1].distanceFromStart : totalDistance;
      const MIN_GAP = 200;
      const clamped = Math.max(prevDist + MIN_GAP, Math.min(nextDist - MIN_GAP, distM));
      setAidStations(prev => prev.map(s => s.id === dragId ? { ...s, distanceFromStart: clamped } : s));
      return;
    }

    const idx = getSectionAtDist(distM);
    const p1 = profilePoints[idx];
    const p2 = profilePoints[idx + 1] ?? p1;
    const span = p2.cumulativeDistance - p1.cumulativeDistance;
    const t = span > 0 ? (distM - p1.cumulativeDistance) / span : 0;
    const elevation = p1.elevation + t * (p2.elevation - p1.elevation);
    setHover({ svgX, distM, elevation, slope: sections[idx]?.slope ?? 0 });
  }

  function handleMouseLeave() {
    if (!dragId) setHover(null);
    setDragId(null);
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    // Drag is initiated from marker circles via their onMouseDown
    // Here we just reset the didDrag flag
    didDragRef.current = false;
  }

  function handleMouseUp(e: React.MouseEvent<SVGSVGElement>) {
    if (dragId) {
      setDragId(null);
      didDragRef.current = false;
      return;
    }
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    // Click to add
    const svgX = getClientSvgX(e);
    const distM = Math.max(0, Math.min(totalDistance, svgXToDist(svgX)));
    const MIN_FROM_EDGE = 500;
    if (distM < MIN_FROM_EDGE || distM > totalDistance - MIN_FROM_EDGE) return;
    const tooClose = aidStations.some(s => Math.abs(s.distanceFromStart - distM) < MIN_FROM_EDGE);
    if (tooClose) return;

    const newStation: AidStation = {
      id: crypto.randomUUID(),
      distanceFromStart: distM,
      name: `Ravito ${aidStations.length + 1}`,
    };
    setAidStations(prev => [...prev, newStation].sort((a, b) => a.distanceFromStart - b.distanceFromStart));
  }

  function handleMarkerMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    didDragRef.current = true;
    setDragId(id);
  }

  function deleteStation(id: string) {
    setAidStations(prev => {
      const filtered = prev.filter(s => s.id !== id);
      // Renumber names of remaining stations
      return filtered.sort((a, b) => a.distanceFromStart - b.distanceFromStart)
        .map((s, i) => ({ ...s, name: s.name.startsWith('Ravito ') ? `Ravito ${i + 1}` : s.name }));
    });
  }

  function updateStationName(id: string, name: string) {
    setAidStations(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  }

  const sortedStations = [...aidStations].sort((a, b) => a.distanceFromStart - b.distanceFromStart);

  const profileCursor = dragId ? 'grabbing' : 'crosshair';
  const tooltipOnLeft = hover ? hover.svgX > VIEW_W / 2 : false;

  // --- Bar chart ---
  const totalTime = legs.reduce((s, l) => s + l.time, 0);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-200">Ravitaillements</h2>
        <p className="text-xs text-gray-600">Cliquer sur le profil pour ajouter un ravitaillement</p>
      </div>

      {/* Contrôles VAP/durée */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 w-fit">
          <button
            onClick={() => setMode('vap')}
            className={['px-3 py-1 rounded-md text-sm font-medium transition-colors',
              mode === 'vap' ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'].join(' ')}
          >
            VAP cible
          </button>
          <button
            onClick={() => setMode('duration')}
            className={['px-3 py-1 rounded-md text-sm font-medium transition-colors',
              mode === 'duration' ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'].join(' ')}
          >
            Durée cible
          </button>
        </div>

        {mode === 'vap' ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">VAP cible</span>
              <span className="text-sm font-semibold text-gray-100">
                {formatPace(sliderPace)}<span className="text-gray-500 font-normal"> /km</span>
              </span>
            </div>
            <input type="range" min={SLIDER_MIN} max={SLIDER_MAX} step={5}
              value={sliderPace}
              onChange={e => setSliderPace(Number(e.target.value))}
              style={{ accentColor: '#F0EDE5' }}
              className="w-full"
            />
            <div className="flex justify-between text-[11px] text-gray-600">
              <span>{formatPace(SLIDER_MIN)}/km</span>
              <span>{formatPace(SLIDER_MAX)}/km</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 shrink-0">Durée estimée</label>
            <input
              type="text" value={durationInput}
              onChange={e => setDurationInput(e.target.value)}
              placeholder="ex: 4:30 ou 4h30"
              maxLength={10}
              className={['w-36 bg-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-100 outline-none border',
                durationInvalid ? 'border-red-700 focus:border-red-500' : 'border-gray-700 focus:border-gray-500'].join(' ')}
            />
            {parsedDuration && gapPace && (
              <span className="text-sm text-gray-500">
                → VAP <span className="text-gray-300 font-medium">{formatPace(gapPace)}/km</span>
              </span>
            )}
          </div>
        )}

        {gapPace && (
          <div className="flex gap-6">
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Temps total estimé</p>
              <p className="text-lg font-semibold text-gray-100">{formatTime(totalTime || 0)}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Ravitaillements</p>
              <p className="text-lg font-semibold text-gray-100">{aidStations.length}</p>
            </div>
          </div>
        )}
      </div>

      {/* Profil altimétrique */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H_PROFILE}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        style={{ cursor: profileCursor, userSelect: 'none' }}
      >
        <defs>
          <clipPath id="aid-chart-area">
            <rect x={PAD_LEFT} y={PAD_TOP} width={CHART_W} height={CHART_H} />
          </clipPath>
        </defs>

        {/* Grille */}
        {yTicks.map((ele, i) => (
          <line key={i} x1={PAD_LEFT} y1={toY(ele)} x2={VIEW_W - PAD_RIGHT} y2={toY(ele)}
            stroke="#3D3D37" strokeWidth={1} />
        ))}

        <g clipPath="url(#aid-chart-area)">
          {/* Zones colorées par tronçon (hover) */}
          {legs.map((leg, li) => {
            if (hoveredLegIdx !== li) return null;
            const x1 = toX(leg.fromDist);
            const x2 = toX(leg.toDist);
            return (
              <rect key={li} x={x1} y={PAD_TOP} width={x2 - x1} height={CHART_H}
                fill="#ffffff" fillOpacity={0.06} />
            );
          })}

          {elevationPaths}
          <polyline points={outlinePoints} fill="none" stroke="#B0ADA5" strokeWidth={1.5} strokeLinejoin="round" />

          {/* Lignes verticales ravitaillements */}
          {sortedStations.map(s => (
            <line key={s.id}
              x1={toX(s.distanceFromStart)} y1={PAD_TOP}
              x2={toX(s.distanceFromStart)} y2={PAD_TOP + CHART_H}
              stroke="#E07B4F" strokeWidth={1.5} strokeDasharray="6 3" />
          ))}
        </g>

        {/* Marqueurs ravitaillements (hors clip pour rester visibles) */}
        {sortedStations.map(s => {
          const x = toX(s.distanceFromStart);
          const isDragging = dragId === s.id;
          return (
            <g key={s.id}>
              <circle cx={x} cy={PAD_TOP - 1} r={8}
                fill={isDragging ? '#F0A070' : '#E07B4F'} stroke="#161614" strokeWidth={2}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                onMouseDown={e => handleMarkerMouseDown(e, s.id)}
              />
              <text x={x} y={PAD_TOP - 13} textAnchor="middle" fontSize={10} fill="#E07B4F"
                style={{ pointerEvents: 'none' }}>
                {s.name}
              </text>
            </g>
          );
        })}

        {/* Labels Y */}
        {yTicks.map((ele, i) => (
          <text key={i} x={PAD_LEFT - 6} y={toY(ele) + 4} textAnchor="end" fontSize={11} fill="#6E6C66">
            {Math.round(ele)}
          </text>
        ))}

        {/* Labels X */}
        {xTicks.map((dist, i) => (
          <text key={i} x={toX(dist)} y={VIEW_H_PROFILE - 6} textAnchor="middle" fontSize={11} fill="#6E6C66">
            {dist / 1000 % 1 === 0 ? `${dist / 1000} km` : `${(dist / 1000).toFixed(1)} km`}
          </text>
        ))}

        {/* Hover */}
        {hover && !dragId && (
          <g>
            <line x1={hover.svgX} y1={PAD_TOP} x2={hover.svgX} y2={PAD_TOP + CHART_H}
              stroke="#ffffff" strokeWidth={1} strokeOpacity={0.25} strokeDasharray="4 3" />
            <circle cx={hover.svgX} cy={toY(hover.elevation)} r={3.5}
              fill={slopeHexFn(hover.slope)} stroke="#161614" strokeWidth={1.5} />
            <rect
              x={tooltipOnLeft ? hover.svgX - 8 - 120 : hover.svgX + 8}
              y={PAD_TOP + 4} width={120} height={44}
              rx={5} fill="#161614" stroke="#3D3D37" strokeWidth={1} />
            <text
              x={tooltipOnLeft ? hover.svgX - 8 - 60 : hover.svgX + 8 + 60}
              y={PAD_TOP + 20} textAnchor="middle" fontSize={12} fill="#B0ADA5" fontWeight="600">
              {(hover.distM / 1000).toFixed(2)} km · {Math.round(hover.elevation)} m
            </text>
            <text
              x={tooltipOnLeft ? hover.svgX - 8 - 60 : hover.svgX + 8 + 60}
              y={PAD_TOP + 36} textAnchor="middle" fontSize={12} fill={slopeHexFn(hover.slope)}>
              {hover.slope >= 0 ? '+' : ''}{hover.slope.toFixed(1)}%
            </text>
          </g>
        )}
      </svg>

      {/* Barre horizontale empilée */}
      {legs.length > 0 && totalTime > 0 && (
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H_BAR}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ userSelect: 'none' }}
        >
          <defs>
            <clipPath id="aid-bar-area">
              <rect x={PAD_LEFT} y={0} width={CHART_W} height={VIEW_H_BAR} />
            </clipPath>
          </defs>
          <g clipPath="url(#aid-bar-area)">
            {(() => {
              let xCursor = PAD_LEFT;
              return legs.map((leg, li) => {
                const w = (leg.time / totalTime) * CHART_W;
                const isHovered = hoveredLegIdx === li;
                const color = AID_COLORS[li % AID_COLORS.length];
                const x = xCursor;
                xCursor += w;
                const isFirst = li === 0;
                const isLast = li === legs.length - 1;
                return (
                  <g key={li}
                    onMouseEnter={() => setHoveredLegIdx(li)}
                    onMouseLeave={() => setHoveredLegIdx(null)}
                    style={{ cursor: 'default' }}
                  >
                    {/* Bar segment */}
                    <rect x={x} y={BAR_PAD_TOP} width={w} height={BAR_H}
                      fill={color}
                      fillOpacity={isHovered ? 1 : 0.65}
                      rx={isFirst ? 4 : 0}
                      style={isLast ? { borderRadius: '0 4px 4px 0' } : {}}
                    />
                    {/* Séparateur vertical */}
                    {!isFirst && (
                      <line x1={x} y1={BAR_PAD_TOP} x2={x} y2={BAR_PAD_TOP + BAR_H}
                        stroke="#161614" strokeWidth={1.5} />
                    )}
                    {/* Label dans la barre */}
                    {w > 55 && (
                      <text x={x + w / 2} y={BAR_PAD_TOP + BAR_H / 2 + 4}
                        textAnchor="middle" fontSize={11} fill="#F0EDE5" fontWeight="600"
                        style={{ pointerEvents: 'none' }}>
                        {formatTime(leg.time)}
                      </text>
                    )}
                    {/* Nom du point d'arrivée (au-dessus) */}
                    {w > 40 && (
                      <text x={x + w / 2} y={BAR_PAD_TOP - 6}
                        textAnchor="middle" fontSize={10} fill="#6E6C66"
                        style={{ pointerEvents: 'none' }}>
                        {leg.toName}
                      </text>
                    )}
                    {/* Temps cumulé (en-dessous) */}
                    <text x={x + w} y={BAR_PAD_TOP + BAR_H + 14}
                      textAnchor="middle" fontSize={10} fill="#6E6C66"
                      style={{ pointerEvents: 'none' }}>
                      {formatTime(leg.cumulativeTime)}
                    </text>
                  </g>
                );
              });
            })()}
          </g>
          {/* Tick "Départ" en bas à gauche */}
          <text x={PAD_LEFT} y={BAR_PAD_TOP + BAR_H + 14}
            textAnchor="middle" fontSize={10} fill="#6E6C66">
            0:00
          </text>
        </svg>
      )}

      {/* Tooltip de tronçon survolé */}
      {hoveredLegIdx !== null && legs[hoveredLegIdx] && gapPace && (() => {
        const leg = legs[hoveredLegIdx];
        const avgPace = leg.time > 0 && leg.distance > 0
          ? leg.time / (leg.distance / 1000)
          : null;
        return (
          <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 flex gap-6 text-sm">
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Tronçon</p>
              <p className="font-semibold text-gray-100">{leg.fromName} → {leg.toName}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Distance</p>
              <p className="font-semibold text-gray-100">{(leg.distance / 1000).toFixed(1)} km</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">D+ / D−</p>
              <p className="font-semibold text-gray-100">
                +{Math.round(leg.elevGain)} m / −{Math.round(leg.elevLoss)} m
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Temps</p>
              <p className="font-semibold text-gray-100">{formatTime(leg.time)}</p>
            </div>
            {avgPace !== null && (
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Allure moy.</p>
                <p className="font-semibold text-gray-100">{formatPace(avgPace)}/km</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Liste des ravitaillements */}
      {sortedStations.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-gray-400">Points de ravitaillement</h3>
          <div className="rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800">
                  <th className="text-left px-4 py-2 text-[11px] text-gray-500 uppercase tracking-wide font-medium">Nom</th>
                  <th className="text-right px-4 py-2 text-[11px] text-gray-500 uppercase tracking-wide font-medium">Distance</th>
                  <th className="text-right px-4 py-2 text-[11px] text-gray-500 uppercase tracking-wide font-medium">D+</th>
                  <th className="text-right px-4 py-2 text-[11px] text-gray-500 uppercase tracking-wide font-medium">D−</th>
                  <th className="text-right px-4 py-2 text-[11px] text-gray-500 uppercase tracking-wide font-medium">Arrivée estimée</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sortedStations.map((station, si) => {
                  const leg = legs[si + 1]; // legs[0] = Départ→Ravito1, legs[si+1] = ..→station
                  const arrival = leg ? leg.cumulativeTime : null;
                  // Cumulative D+/D- up to this station
                  const cumGain = legs.slice(0, si + 1).reduce((s, l) => s + l.elevGain, 0);
                  const cumLoss = legs.slice(0, si + 1).reduce((s, l) => s + l.elevLoss, 0);
                  return (
                    <tr key={station.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={station.name}
                          onChange={e => updateStationName(station.id, e.target.value)}
                          className="bg-transparent text-gray-200 outline-none focus:text-white w-full"
                        />
                      </td>
                      <td className="px-4 py-2 text-right text-gray-300">
                        {(station.distanceFromStart / 1000).toFixed(1)} km
                      </td>
                      <td className="px-4 py-2 text-right text-gray-300">
                        +{Math.round(cumGain)} m
                      </td>
                      <td className="px-4 py-2 text-right text-gray-300">
                        −{Math.round(cumLoss)} m
                      </td>
                      <td className="px-4 py-2 text-right text-gray-300">
                        {arrival !== null ? formatTime(arrival) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => deleteStation(station.id)}
                          className="text-gray-600 hover:text-red-400 transition-colors text-base leading-none"
                          title="Supprimer"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aidStations.length === 0 && (
        <p className="text-[11px] text-gray-600 text-center">
          Cliquer sur le profil pour placer un ravitaillement
        </p>
      )}
    </div>
  );
}
