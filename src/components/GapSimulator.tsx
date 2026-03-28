import { useRef, useState, useMemo } from 'react';
import type { Section, ProfilePoint } from '../types';
import {
  simulateGap, detectSegments, gapPaceFromTime,
  parseDuration, formatPace, formatTime,
} from '../lib/gapCalculation';

interface Props {
  sections: Section[];
  profilePoints: ProfilePoint[];
  totalDistance: number;
  slopeHexFn: (slope: number) => string;
}

interface HoverState {
  svgX: number;
  sectionIdx: number;
}

interface ZoomRange {
  from: number;
  to: number;
}

const PAD_LEFT = 52;
const PAD_RIGHT = 52;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const VIEW_W = 800;
const VIEW_H = 300;
const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

const PACE_LINE_COLOR = '#F0EDE5';
const DEFAULT_GAP_PACE = 360; // 6:00/km
const SLIDER_MIN = 180;       // 3:00/km
const SLIDER_MAX = 1200;      // 20:00/km

export function GapSimulator({ sections, profilePoints, totalDistance, slopeHexFn }: Props) {
  const [mode, setMode] = useState<'vap' | 'duration'>('vap');
  const [sliderPace, setSliderPace] = useState(DEFAULT_GAP_PACE);
  const [durationInput, setDurationInput] = useState('');
  const [hover, setHover] = useState<HoverState | null>(null);
  const [hoveredSegIdx, setHoveredSegIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState<ZoomRange | null>(null);
  const [showPaceLine, setShowPaceLine] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const segments = useMemo(
    () => detectSegments(sections, profilePoints),
    [sections, profilePoints],
  );

  const parsedDuration = useMemo(() => parseDuration(durationInput), [durationInput]);
  const durationInvalid = durationInput.length > 0 && parsedDuration === null;

  const gapPace = useMemo(() => {
    if (mode === 'vap') return sliderPace;
    if (parsedDuration) return gapPaceFromTime(sections, parsedDuration);
    return null;
  }, [mode, sliderPace, parsedDuration, sections]);

  const simulation = useMemo(
    () => (gapPace ? simulateGap(sections, gapPace) : null),
    [sections, gapPace],
  );

  if (profilePoints.length < 2) return null;

  const visibleFrom = zoom?.from ?? 0;
  const visibleTo = zoom?.to ?? totalDistance;
  const visibleRange = visibleTo - visibleFrom;

  // --- Axes ---
  const elevations = profilePoints.map((p) => p.elevation);
  const rawEleMin = Math.min(...elevations);
  const rawEleMax = Math.max(...elevations);
  const eleRange = Math.max(rawEleMax - rawEleMin, 50);
  const eleMargin = eleRange * 0.1;
  const eleMin = rawEleMin - eleMargin;
  const eleMax = rawEleMax + eleMargin;
  const eleYRange = eleMax - eleMin;

  let paceMin = 0;
  let paceMax = 600;
  if (simulation) {
    const paces = simulation.sections.map((s) => s.actualPace);
    const rawMin = Math.min(...paces);
    const rawMax = Math.max(...paces);
    const margin = (rawMax - rawMin) * 0.15;
    paceMin = Math.max(60, rawMin - margin);
    paceMax = rawMax + margin;
  }
  const paceRange = Math.max(paceMax - paceMin, 60);

  function toX(distM: number) {
    return PAD_LEFT + ((distM - visibleFrom) / visibleRange) * CHART_W;
  }
  function toYEle(ele: number) {
    return PAD_TOP + CHART_H - ((ele - eleMin) / eleYRange) * CHART_H;
  }
  function toYPace(pace: number) {
    return PAD_TOP + ((pace - paceMin) / paceRange) * CHART_H;
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

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svgX = getClientSvgX(e);
    const distM = svgXToDist(svgX);

    let idx = sections.length - 1;
    for (let i = 0; i < profilePoints.length - 1; i++) {
      if (distM <= profilePoints[i + 1].cumulativeDistance) { idx = i; break; }
    }
    setHover({ svgX, sectionIdx: idx });

    // Trouver quel segment est survolé
    const segIdx = segments.findIndex(
      (seg) => distM >= seg.startDistance && distM <= seg.endDistance,
    );
    setHoveredSegIdx(segIdx >= 0 ? segIdx : null);
  }

  function handleMouseLeave() {
    setHover(null);
    setHoveredSegIdx(null);
  }

  function handleClick(_e: React.MouseEvent<SVGSVGElement>) {
    if (hoveredSegIdx === null) return;
    const seg = segments[hoveredSegIdx];
    // Si déjà zoomé sur ce segment, dézoomer
    if (zoom && zoom.from === seg.startDistance && zoom.to === seg.endDistance) {
      setZoom(null);
    } else {
      setZoom({ from: seg.startDistance, to: seg.endDistance });
    }
  }

  // --- Profil altimétrique ---
  const colorGroups: { color: string; start: number; end: number }[] = [];
  for (let i = 0; i < sections.length; i++) {
    const color = slopeHexFn(sections[i].slope);
    const last = colorGroups[colorGroups.length - 1];
    if (last && last.color === color) last.end = i;
    else colorGroups.push({ color, start: i, end: i });
  }

  const yBase = toYEle(eleMin);

  const elevationPaths = colorGroups.map((g, gi) => {
    const pts = profilePoints.slice(g.start, g.end + 2);
    if (pts.length < 2) return null;
    const top = pts.map((p) => `${toX(p.cumulativeDistance)},${toYEle(p.elevation)}`).join(' L');
    const x1 = toX(pts[0].cumulativeDistance);
    const x2 = toX(pts[pts.length - 1].cumulativeDistance);
    return (
      <path key={gi} d={`M ${top} L${x2},${yBase} L${x1},${yBase} Z`}
        fill={g.color} fillOpacity={0.85} />
    );
  });

  const outlinePoints = profilePoints
    .map((p) => `${toX(p.cumulativeDistance)},${toYEle(p.elevation)}`)
    .join(' ');

  // --- Courbe d'allure ---
  let paceLine: string | null = null;
  if (simulation) {
    const points: string[] = [];
    for (let i = 0; i < simulation.sections.length; i++) {
      const startDist = profilePoints[i]?.cumulativeDistance ?? 0;
      const endDist = profilePoints[i + 1]?.cumulativeDistance ?? totalDistance;
      const y = toYPace(simulation.sections[i].actualPace);
      if (i === 0) points.push(`${toX(startDist)},${y}`);
      points.push(`${toX(endDist)},${y}`);
    }
    paceLine = points.join(' ');
  }

  const refY = gapPace ? toYPace(gapPace) : null;

  // --- Ticks ---
  const eleTicks: number[] = [];
  for (let i = 0; i <= 4; i++) eleTicks.push(eleMin + (eleYRange * i) / 4);

  const paceTicks: number[] = [];
  if (simulation) {
    for (let i = 0; i <= 4; i++) paceTicks.push(paceMin + (paceRange * i) / 4);
  }

  const visibleKm = visibleRange / 1000;
  const kmStep = visibleKm <= 2 ? 0.5 : visibleKm <= 6 ? 1 : visibleKm <= 15 ? 2 : visibleKm <= 30 ? 5 : 10;
  const xTicks: number[] = [];
  const startKm = Math.ceil(visibleFrom / 1000 / kmStep) * kmStep;
  for (let km = startKm; km <= visibleTo / 1000 + 0.001; km += kmStep) xTicks.push(km * 1000);

  // --- Hover ---
  const hoverSim = hover && simulation ? simulation.sections[hover.sectionIdx] : null;
  const hoverSlope = hover ? sections[hover.sectionIdx]?.slope ?? 0 : 0;
  const hoverEle = hover ? (() => {
    const idx = hover.sectionIdx;
    const p1 = profilePoints[idx];
    const p2 = profilePoints[idx + 1] ?? p1;
    const distM = svgXToDist(hover.svgX);
    const span = p2.cumulativeDistance - p1.cumulativeDistance;
    const t = span > 0 ? (distM - p1.cumulativeDistance) / span : 0;
    return p1.elevation + t * (p2.elevation - p1.elevation);
  })() : 0;

  // --- Tooltip de segment ---
  // Segment affiché : survolé en priorité, sinon segment zoomé
  const zoomedSegIdx = zoom
    ? segments.findIndex(s => s.startDistance === zoom.from && s.endDistance === zoom.to)
    : -1;
  const activeSeg = hoveredSegIdx !== null
    ? segments[hoveredSegIdx]
    : zoomedSegIdx >= 0 ? segments[zoomedSegIdx] : null;
  const activeSegIdx = hoveredSegIdx !== null ? hoveredSegIdx : zoomedSegIdx >= 0 ? zoomedSegIdx : null;

  const activeSegSim = activeSeg && simulation
    ? simulation.sections.slice(activeSeg.startIndex, activeSeg.endIndex + 1)
    : null;
  const activeSegTime = activeSegSim?.reduce((acc, s) => acc + s.sectionTime, 0) ?? null;
  const activeSegAvgPace = activeSegTime != null && activeSeg && activeSeg.distance > 0
    ? activeSegTime / (activeSeg.distance / 1000)
    : null;

  const segTooltipW = 130;
  const segTooltipH = activeSegAvgPace != null ? 72 : 58;
  const segTooltipX = activeSeg
    ? (() => {
        const cx = (toX(activeSeg.startDistance) + toX(activeSeg.endDistance)) / 2;
        if (cx + segTooltipW / 2 + 4 > VIEW_W - PAD_RIGHT) return VIEW_W - PAD_RIGHT - segTooltipW - 4;
        if (cx - segTooltipW / 2 - 4 < PAD_LEFT) return PAD_LEFT + 4;
        return cx - segTooltipW / 2;
      })()
    : 0;
  const segTooltipY = PAD_TOP + 6;

  // --- Zones de segments : remplissage du vide au-dessus du profil ---
  const segmentZones = segments.map((seg, si) => {
    const isClimbOrDescent = seg.type !== 'rolling';
    const color = seg.type === 'climb' ? '#E8C170' : seg.type === 'descent' ? '#4AADAD' : '#E0DDD6';
    const isActive = hoveredSegIdx === si || (hoveredSegIdx === null && zoomedSegIdx === si);

    const pts = profilePoints.slice(seg.startIndex, seg.endIndex + 2);
    if (pts.length < 2) return null;
    const x1 = toX(pts[0].cumulativeDistance);
    const x2 = toX(pts[pts.length - 1].cumulativeDistance);
    const profileEdge = [...pts].reverse()
      .map(p => `${toX(p.cumulativeDistance)},${toYEle(p.elevation)}`).join(' L');
    const d = `M ${x1},${PAD_TOP} L ${x2},${PAD_TOP} L ${profileEdge} Z`;

    const baseOpacity = isClimbOrDescent ? 0.25 : 0.10;
    const activeOpacity = isClimbOrDescent ? 0.50 : 0.20;

    return (
      <g key={si}>
        <path d={d} fill={color} fillOpacity={isActive ? activeOpacity : baseOpacity} />
      </g>
    );
  });

  const hoverTooltipOnLeft = hover ? hover.svgX > VIEW_W / 2 : false;
  const hoverTooltipW = 155;
  const hoverTooltipH = hoverSim ? 60 : 46;
  const hoverTooltipY = PAD_TOP + 4;

  // Curseur : pointeur si on est sur un segment, sinon crosshair
  const cursor = hoveredSegIdx !== null ? 'pointer' : 'crosshair';

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-200">Simulateur VAP</h2>
        <div className="flex items-center gap-4">
          {zoom && (
            <button onClick={() => setZoom(null)} className="text-xs text-gray-500 hover:text-gray-300 underline">
              Réinitialiser le zoom
            </button>
          )}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <span className="text-xs text-gray-500">Courbe d'allure</span>
            <div
              onClick={() => setShowPaceLine(v => !v)}
              className={[
                'w-7 h-4 rounded-full transition-colors relative',
                showPaceLine ? 'bg-gray-400' : 'bg-gray-700',
              ].join(' ')}
            >
              <div className={[
                'absolute top-0.5 w-3 h-3 rounded-full bg-gray-100 transition-transform',
                showPaceLine ? 'translate-x-3.5' : 'translate-x-0.5',
              ].join(' ')} />
            </div>
          </label>
        </div>
      </div>

      {/* Toggle mode */}
      <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setMode('vap')}
          className={[
            'px-3 py-1 rounded-md text-sm font-medium transition-colors',
            mode === 'vap' ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300',
          ].join(' ')}
        >
          VAP cible
        </button>
        <button
          onClick={() => setMode('duration')}
          className={[
            'px-3 py-1 rounded-md text-sm font-medium transition-colors',
            mode === 'duration' ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300',
          ].join(' ')}
        >
          Durée cible
        </button>
      </div>

      {/* Contrôles */}
      {mode === 'vap' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">VAP cible</span>
            <span className="text-sm font-semibold text-gray-100">
              {formatPace(sliderPace)}<span className="text-gray-500 font-normal"> /km</span>
            </span>
          </div>
          <input
            type="range" min={SLIDER_MIN} max={SLIDER_MAX} step={5}
            value={sliderPace}
            onChange={(e) => setSliderPace(Number(e.target.value))}
            style={{ accentColor: PACE_LINE_COLOR }}
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
            onChange={(e) => setDurationInput(e.target.value)}
            placeholder="ex: 4:30 ou 4h30"
            maxLength={10}
            className={[
              'w-36 bg-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-100 outline-none border',
              durationInvalid ? 'border-red-700 focus:border-red-500' : 'border-gray-700 focus:border-gray-500',
            ].join(' ')}
          />
          {parsedDuration && gapPace && (
            <span className="text-sm text-gray-500">
              → VAP <span className="text-gray-300 font-medium">{formatPace(gapPace)}/km</span>
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      {simulation && gapPace && (
        <div className="flex gap-6">
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">
              {mode === 'duration' ? 'Durée cible' : 'VAP cible'}
            </p>
            <p className="text-lg font-semibold text-gray-100">
              {mode === 'duration' && parsedDuration
                ? formatTime(parsedDuration)
                : <>{formatPace(gapPace)}<span className="text-sm font-normal text-gray-500 ml-1">/km</span></>
              }
            </p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">
              {mode === 'duration' ? 'VAP correspondante' : 'Temps estimé'}
            </p>
            <p className="text-lg font-semibold text-gray-100">
              {mode === 'duration'
                ? <>{formatPace(gapPace)}<span className="text-sm font-normal text-gray-500 ml-1">/km</span></>
                : formatTime(simulation.totalTime)
              }
            </p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Allure moyenne réelle</p>
            <p className="text-lg font-semibold text-gray-100">
              {formatPace(simulation.averageActualPace)}
              <span className="text-sm font-normal text-gray-500 ml-1">/km</span>
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{ cursor, userSelect: 'none' }}
      >
        <defs>
          <clipPath id="gap-chart-area">
            <rect x={PAD_LEFT} y={PAD_TOP} width={CHART_W} height={CHART_H} />
          </clipPath>
        </defs>

        {/* Grille */}
        {eleTicks.map((ele, i) => (
          <line key={i} x1={PAD_LEFT} y1={toYEle(ele)} x2={VIEW_W - PAD_RIGHT} y2={toYEle(ele)}
            stroke="#3D3D37" strokeWidth={1} />
        ))}

        <g clipPath="url(#gap-chart-area)">
          {segmentZones}
          {elevationPaths}
          <polyline points={outlinePoints} fill="none" stroke="#B0ADA5" strokeWidth={1.2} strokeLinejoin="round" />

          {showPaceLine && refY !== null && (
            <line x1={PAD_LEFT} y1={refY} x2={VIEW_W - PAD_RIGHT} y2={refY}
              stroke={PACE_LINE_COLOR} strokeWidth={1} strokeDasharray="6 4" strokeOpacity={0.3} />
          )}
          {showPaceLine && paceLine && (
            <polyline points={paceLine} fill="none"
              stroke={PACE_LINE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeOpacity={0.9} />
          )}
        </g>

        {/* Labels Y gauche */}
        {eleTicks.map((ele, i) => (
          <text key={i} x={PAD_LEFT - 6} y={toYEle(ele) + 4} textAnchor="end" fontSize={11} fill="#6E6C66">
            {Math.round(ele)}
          </text>
        ))}

        {/* Labels Y droit (allure) */}
        {showPaceLine && paceTicks.map((pace, i) => (
          <text key={i} x={VIEW_W - PAD_RIGHT + 6} y={toYPace(pace) + 4} textAnchor="start" fontSize={11} fill="#8A8880">
            {formatPace(pace)}
          </text>
        ))}

        {/* Labels X */}
        {xTicks.map((dist, i) => (
          <text key={i} x={toX(dist)} y={VIEW_H - 6} textAnchor="middle" fontSize={11} fill="#6E6C66">
            {dist / 1000 % 1 === 0 ? `${dist / 1000} km` : `${(dist / 1000).toFixed(1)} km`}
          </text>
        ))}

        {/* Hover cursor */}
        {hover && (
          <g>
            <line x1={hover.svgX} y1={PAD_TOP} x2={hover.svgX} y2={PAD_TOP + CHART_H}
              stroke="#ffffff" strokeWidth={1} strokeOpacity={0.25} strokeDasharray="4 3" />
            <circle cx={hover.svgX} cy={toYEle(hoverEle)} r={3.5}
              fill={slopeHexFn(hoverSlope)} stroke="#161614" strokeWidth={1.5} />
            {/* Tooltip curseur (seulement si pas de segment survolé) */}
            {hoveredSegIdx === null && (
              <g>
                <rect
                  x={hoverTooltipOnLeft ? hover.svgX - 8 - hoverTooltipW : hover.svgX + 8}
                  y={hoverTooltipY} width={hoverTooltipW} height={hoverTooltipH}
                  rx={5} fill="#161614" stroke="#3D3D37" strokeWidth={1} />
                <text
                  x={hoverTooltipOnLeft ? hover.svgX - 8 - hoverTooltipW / 2 : hover.svgX + 8 + hoverTooltipW / 2}
                  y={hoverTooltipY + 17} textAnchor="middle" fontSize={12} fill="#B0ADA5" fontWeight="600">
                  {svgXToDist(hover.svgX) / 1000 >= 0
                    ? `${(svgXToDist(hover.svgX) / 1000).toFixed(2)} km · ${Math.round(hoverEle)} m`
                    : ''}
                </text>
                <text
                  x={hoverTooltipOnLeft ? hover.svgX - 8 - hoverTooltipW / 2 : hover.svgX + 8 + hoverTooltipW / 2}
                  y={hoverTooltipY + 34} textAnchor="middle" fontSize={12} fill={slopeHexFn(hoverSlope)}>
                  {hoverSlope >= 0 ? '+' : ''}{hoverSlope.toFixed(1)}%
                </text>
                {hoverSim && (
                  <text
                    x={hoverTooltipOnLeft ? hover.svgX - 8 - hoverTooltipW / 2 : hover.svgX + 8 + hoverTooltipW / 2}
                    y={hoverTooltipY + 52} textAnchor="middle" fontSize={13} fill={PACE_LINE_COLOR} fontWeight="600">
                    {formatPace(hoverSim.actualPace)}/km
                  </text>
                )}
              </g>
            )}
          </g>
        )}

        {/* Tooltip de segment — en dernier pour être au premier plan */}
        {activeSeg && activeSegIdx !== null && (() => {
          const color = activeSeg.type === 'climb' ? '#E8C170' : activeSeg.type === 'descent' ? '#4AADAD' : '#B0ADA5';
          const icon = activeSeg.type === 'climb' ? '↑' : activeSeg.type === 'descent' ? '↓' : '~';
          const avgSlope = activeSeg.distance > 0 ? Math.abs(activeSeg.elevationChange / activeSeg.distance) * 100 : 0;
          return (
            <g>
              <rect x={segTooltipX} y={segTooltipY}
                width={segTooltipW} height={segTooltipH}
                rx={6} fill="#161614" stroke={color} strokeWidth={1} strokeOpacity={0.7} />
              <text x={segTooltipX + segTooltipW / 2} y={segTooltipY + 16}
                textAnchor="middle" fontSize={13} fill={color} fontWeight="700">
                {icon} {activeSeg.elevationChange >= 0 ? '+' : ''}{Math.round(activeSeg.elevationChange)} m
              </text>
              <text x={segTooltipX + segTooltipW / 2} y={segTooltipY + 31}
                textAnchor="middle" fontSize={11} fill="#8A8880">
                {(activeSeg.distance / 1000).toFixed(2)} km · {avgSlope.toFixed(1)}% moy
              </text>
              <text x={segTooltipX + segTooltipW / 2} y={segTooltipY + 45}
                textAnchor="middle" fontSize={11} fill="#6E6C66">
                km {(activeSeg.startDistance / 1000).toFixed(1)} → {(activeSeg.endDistance / 1000).toFixed(1)}
              </text>
              {activeSegAvgPace != null && (
                <text x={segTooltipX + segTooltipW / 2} y={segTooltipY + 61}
                  textAnchor="middle" fontSize={12} fill={PACE_LINE_COLOR} fontWeight="600">
                  {formatPace(activeSegAvgPace)}/km · {activeSegTime != null ? formatTime(activeSegTime) : ''}
                </text>
              )}
            </g>
          );
        })()}
      </svg>
      <p className="text-[11px] text-gray-600 text-center">
        Survoler un segment pour les détails · Cliquer pour zoomer
      </p>
    </div>
  );
}
