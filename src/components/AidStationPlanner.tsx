import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import type { AidStation, FoodItem, LegNutritionPlan, NutritionState, ProfilePoint, Section } from '../types';
import {
  formatPace, formatTime, gapPaceFromTime, parseDuration, simulateGap,
} from '../lib/gapCalculation';
import { computeLegNutrition, getDefaultFoodLibrary } from './aid-station/nutrition-utils';
import { FoodLibrary } from './aid-station/FoodLibrary';
import { LegNutritionPanel } from './aid-station/LegNutritionPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberStepper } from '@/components/ui/number-stepper';
import { Slider } from '@/components/ui/slider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  sections: Section[];
  profilePoints: ProfilePoint[];
  totalDistance: number;
  slopeHexFn: (slope: number) => string;
  initialNutritionState?: NutritionState;
  onNutritionStateChange?: (state: NutritionState) => void;
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

const VIEW_H_BAR = 168;
const BAR_PAD_TOP = 22;
const BAR_H = 114;

const DEFAULT_GAP_PACE = 360;
const SLIDER_MIN = 180;
const SLIDER_MAX = 1200;

const AID_COLORS = ['#2E6B8A', '#4AADAD', '#7DCFB6', '#5B8DB8', '#3D8B9E'];

/** Centre une icône Lucide 24×24 sur (cx, cy) en SVG viewBox units */
function lucideAt(cx: number, cy: number, scale = 0.46): string {
  return `translate(${cx - 12 * scale}, ${cy - 12 * scale}) scale(${scale})`;
}

function foodIconSrc(item: FoodItem): string {
  if (item.type === 'flask') return item.hasPowder ? '/food/iso.png' : '/food/water.png';
  if (item.type === 'gel') return '/food/gel.png';
  if (item.type === 'pill') return '/food/pill.png';
  return '/food/bar.png';
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

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

export function AidStationPlanner({ sections, profilePoints, totalDistance, slopeHexFn, initialNutritionState, onNutritionStateChange }: Props) {
  const [aidStations, setAidStations] = useState<AidStation[]>(() => initialNutritionState?.aidStations ?? []);
  const [mode, setMode] = useState<'vap' | 'duration'>(() => initialNutritionState?.paceSettings.mode ?? 'vap');
  const [sliderPace, setSliderPace] = useState(() => initialNutritionState?.paceSettings.sliderPace ?? DEFAULT_GAP_PACE);
  const [durationInput, setDurationInput] = useState(() => initialNutritionState?.paceSettings.durationInput ?? '');
  const [hover, setHover] = useState<HoverState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoveredLegIdx, setHoveredLegIdx] = useState<number | null>(null);
  const [carbsPerHour, setCarbsPerHour] = useState(() => initialNutritionState?.hourlyTargets.carbsPerHour ?? 60);
  const [waterPerHour, setWaterPerHour] = useState(() => initialNutritionState?.hourlyTargets.waterPerHour ?? 500);
  const [sodiumPerHour, setSodiumPerHour] = useState(() => initialNutritionState?.hourlyTargets.sodiumPerHour ?? 500);
  const [caffeinePerHour, setCaffeinePerHour] = useState(() => initialNutritionState?.hourlyTargets.caffeinePerHour ?? 0);
  const [selectedLegIdx, setSelectedLegIdx] = useState<number | null>(null);
  const [foodLibrary, setFoodLibrary] = useState<FoodItem[]>(() => initialNutritionState?.foodLibrary ?? getDefaultFoodLibrary());
  const [legNutritionPlan, setLegNutritionPlan] = useState<LegNutritionPlan>(() => initialNutritionState?.legNutritionPlan ?? {});
  const [timeOverrides, setTimeOverrides] = useState<Record<string, number>>(() => initialNutritionState?.timeOverrides ?? {});

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    onNutritionStateChange?.({
      aidStations, legNutritionPlan, foodLibrary,
      hourlyTargets: { carbsPerHour, waterPerHour, sodiumPerHour, caffeinePerHour },
      timeOverrides,
      paceSettings: { mode, sliderPace, durationInput },
    });
  }, [aidStations, legNutritionPlan, foodLibrary, carbsPerHour, waterPerHour, sodiumPerHour, caffeinePerHour, timeOverrides, mode, sliderPace, durationInput]); // eslint-disable-line react-hooks/exhaustive-deps
  const [confirmDeleteStationId, setConfirmDeleteStationId] = useState<string | null>(null);
  const [editingStationName, setEditingStationName] = useState(false);
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

  const effectiveLegs = useMemo(() => {
    if (legs.length === 0) return legs;
    const sorted = [...aidStations].sort((a, b) => a.distanceFromStart - b.distanceFromStart);
    const withTimes = legs.map((leg, i) => {
      const key = i === 0 ? 'depart' : (sorted[i - 1]?.id ?? `leg_${i}`);
      return { ...leg, time: timeOverrides[key] ?? leg.time };
    });
    let cum = 0;
    return withTimes.map(leg => { cum += leg.time; return { ...leg, cumulativeTime: cum }; });
  }, [legs, timeOverrides, aidStations]);

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

  function setTimeOverride(key: string, raw: string) {
    const secs = parseDuration(raw);
    if (secs !== null && secs > 0) setTimeOverrides(prev => ({ ...prev, [key]: secs }));
  }

  function resetTimeOverride(key: string) {
    setTimeOverrides(prev => { const next = { ...prev }; delete next[key]; return next; });
  }

  function legKey(legIdx: number): string {
    return legIdx === 0 ? 'depart' : (sortedStations[legIdx - 1]?.id ?? `leg_${legIdx}`);
  }

  function addFoodToLeg(key: string, foodItemId: string) {
    setLegNutritionPlan(prev => {
      const list = prev[key] ?? [];
      const idx = list.findIndex(a => a.foodItemId === foodItemId);
      if (idx >= 0) {
        return { ...prev, [key]: list.map((a, i) => i === idx ? { ...a, quantity: a.quantity + 1 } : a) };
      }
      return { ...prev, [key]: [...list, { foodItemId, quantity: 1 }] };
    });
  }

  function removeFoodFromLeg(key: string, foodItemId: string) {
    setLegNutritionPlan(prev => {
      const list = prev[key] ?? [];
      const idx = list.findIndex(a => a.foodItemId === foodItemId);
      if (idx < 0) return prev;
      if (list[idx].quantity <= 1) {
        const next = list.filter((_, i) => i !== idx);
        if (next.length === 0) { const p = { ...prev }; delete p[key]; return p; }
        return { ...prev, [key]: next };
      }
      return { ...prev, [key]: list.map((a, i) => i === idx ? { ...a, quantity: a.quantity - 1 } : a) };
    });
  }

  const profileCursor = dragId ? 'grabbing' : 'crosshair';
  const tooltipOnLeft = hover ? hover.svgX > VIEW_W / 2 : false;

  // --- Bar chart ---
  const totalTime = effectiveLegs.reduce((s, l) => s + l.time, 0);

  // Station pending delete (for AlertDialog)
  const stationToDelete = confirmDeleteStationId
    ? sortedStations.find(s => s.id === confirmDeleteStationId) ?? null
    : null;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-200">Ravitaillements</h2>
        <p className="text-xs text-gray-600">Cliquer sur le profil pour ajouter un ravitaillement</p>
      </div>

      {/* Contrôles VAP/durée */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 w-fit">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode('vap')}
            className={['px-3 py-1 rounded-md text-sm font-medium h-auto transition-colors',
              mode === 'vap' ? 'bg-gray-700 text-gray-100 hover:bg-gray-700 hover:text-gray-100' : 'text-gray-500 hover:text-gray-300 hover:bg-transparent'].join(' ')}
          >
            VAP cible
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode('duration')}
            className={['px-3 py-1 rounded-md text-sm font-medium h-auto transition-colors',
              mode === 'duration' ? 'bg-gray-700 text-gray-100 hover:bg-gray-700 hover:text-gray-100' : 'text-gray-500 hover:text-gray-300 hover:bg-transparent'].join(' ')}
          >
            Durée cible
          </Button>
        </div>

        {mode === 'vap' ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">VAP cible</span>
              <span className="text-sm font-semibold text-gray-100">
                {formatPace(sliderPace)}<span className="text-gray-500 font-normal"> /km</span>
              </span>
            </div>
            <Slider
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              step={5}
              value={[sliderPace]}
              onValueChange={vals => setSliderPace(vals[0])}
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
            <Input
              type="text"
              value={durationInput}
              onChange={e => setDurationInput(e.target.value)}
              placeholder="ex: 4:30 ou 4h30"
              maxLength={10}
              className={['w-36 bg-gray-800 text-gray-100 border h-auto py-1.5 text-sm',
                durationInvalid ? 'border-red-700 focus-visible:ring-red-500' : 'border-gray-700'].join(' ')}
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

      {/* Objectifs nutrition */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-gray-400">Objectifs nutrition</h3>
        <div className="flex items-center flex-wrap gap-0 divide-x divide-gray-700">
          {[
            { label: 'Glucides', value: carbsPerHour, onChange: setCarbsPerHour, unit: 'g/h', min: 30, max: 120, step: 5 },
            { label: 'Eau', value: waterPerHour, onChange: setWaterPerHour, unit: 'mL/h', min: 100, max: 1500, step: 50 },
            { label: 'Sodium', value: sodiumPerHour, onChange: setSodiumPerHour, unit: 'mg/h', min: 100, max: 1500, step: 50 },
            { label: 'Caféine', value: caffeinePerHour, onChange: setCaffeinePerHour, unit: 'mg/h', min: 0, max: 200, step: 5 },
          ].map(({ label, value, onChange, unit, min, max, step }) => (
            <div key={label} className="flex items-center gap-1.5 px-3 first:pl-0 last:pr-0">
              <span className="text-sm text-gray-400">{label}</span>
              <NumberStepper
                value={value}
                onChange={onChange}
                min={min}
                max={max}
                step={step}
                unit={unit}
                inputClassName="w-16"
              />
            </div>
          ))}
        </div>
        <FoodLibrary
          foodLibrary={foodLibrary}
          setFoodLibrary={setFoodLibrary}
          legNutritionPlan={legNutritionPlan}
          setLegNutritionPlan={setLegNutritionPlan}
        />
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
          const label = s.name.length > 10 ? s.name.slice(0, 9) + '…' : s.name;
          return (
            <g key={s.id}>
              <circle cx={x} cy={PAD_TOP - 1} r={8}
                fill={isDragging ? '#F0A070' : '#E07B4F'} stroke="#161614" strokeWidth={2}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                onMouseDown={e => handleMarkerMouseDown(e, s.id)}
              />
              <text x={x} y={PAD_TOP + 12} textAnchor="middle" fontSize={10} fill="#E07B4F"
                style={{ pointerEvents: 'none' }}>
                {label}
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
              return effectiveLegs.map((leg, li) => {
                const legKey = li === 0 ? 'depart' : (sortedStations[li - 1]?.id ?? `leg_${li}`);
                const isTimeOverridden = legKey in timeOverrides;
                const w = (leg.time / totalTime) * CHART_W;
                const isHovered = hoveredLegIdx === li;
                const color = AID_COLORS[li % AID_COLORS.length];
                const x = xCursor;
                xCursor += w;
                const isFirst = li === 0;
                const isLast = li === effectiveLegs.length - 1;
                return (
                  <g key={li}
                    onMouseEnter={() => setHoveredLegIdx(li)}
                    onMouseLeave={() => setHoveredLegIdx(null)}
                    onClick={() => { setSelectedLegIdx(li === selectedLegIdx ? null : li); setConfirmDeleteStationId(null); }}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Bar segment */}
                    <rect x={x} y={BAR_PAD_TOP} width={w} height={BAR_H}
                      fill={color}
                      fillOpacity={isHovered || selectedLegIdx === li ? 1 : 0.65}
                      rx={isFirst ? 4 : 0}
                      style={isLast ? { borderRadius: '0 4px 4px 0' } : {}}
                    />
                    {/* Bordure segment sélectionné */}
                    {selectedLegIdx === li && (
                      <rect x={x + 1} y={BAR_PAD_TOP + 1} width={w - 2} height={BAR_H - 2}
                        fill="none" stroke="#F0EDE5" strokeWidth={1.5} strokeOpacity={0.5}
                        rx={isFirst ? 3 : 0}
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    {/* Séparateur vertical */}
                    {!isFirst && (
                      <line x1={x} y1={BAR_PAD_TOP} x2={x} y2={BAR_PAD_TOP + BAR_H}
                        stroke="#161614" strokeWidth={1.5} />
                    )}
                    {(() => {
                      const assignments = legNutritionPlan[legKey] ?? [];
                      const nutrition = computeLegNutrition(assignments, foodLibrary);
                      const hasNutrition = assignments.length > 0;
                      const distKm = (leg.distance / 1000).toFixed(1);
                      const gain = Math.round(leg.elevGain);
                      const cx = x + w / 2;

                      const assignedItems = assignments
                        .filter(a => a.quantity > 0)
                        .map(a => ({ item: foodLibrary.find(f => f.id === a.foodItemId), qty: a.quantity }))
                        .filter((a): a is { item: FoodItem; qty: number } => a.item !== undefined);

                      const ICON_SIZE = 20;
                      const ICON_GAP = 6;
                      const maxIcons = w > 60 ? Math.floor((w - 12) / (ICON_SIZE + ICON_GAP)) : 0;
                      const visibleItems = assignedItems.slice(0, Math.max(0, maxIcons));
                      const iconsW = visibleItems.length > 0
                        ? visibleItems.length * ICON_SIZE + (visibleItems.length - 1) * ICON_GAP
                        : 0;
                      const iconsStartX = cx - iconsW / 2;
                      const iconsY = BAR_PAD_TOP + 37;

                      return (
                        <>
                          {/* Temps */}
                          {w > 45 && (
                            <text x={cx} y={BAR_PAD_TOP + 17}
                              textAnchor="middle" fontSize={12} fill={isTimeOverridden ? '#FCD34D' : '#F0EDE5'} fontWeight="700"
                              style={{ pointerEvents: 'none' }}>
                              {formatTime(leg.time)}
                            </text>
                          )}
                          {/* Distance + D+ */}
                          {w > 70 && (
                            <text x={cx} y={BAR_PAD_TOP + 29}
                              textAnchor="middle" fontSize={9} fill="rgba(240,237,229,0.55)"
                              style={{ pointerEvents: 'none' }}>
                              {distKm} km · +{gain} m
                            </text>
                          )}
                          {/* Icônes aliments */}
                          {visibleItems.map(({ item, qty }, i) => (
                            <g key={item.id} style={{ pointerEvents: 'none' }}>
                              <image
                                href={foodIconSrc(item)}
                                x={iconsStartX + i * (ICON_SIZE + ICON_GAP)}
                                y={iconsY}
                                width={ICON_SIZE}
                                height={ICON_SIZE}
                              />
                              {qty > 1 && (
                                <text
                                  x={iconsStartX + i * (ICON_SIZE + ICON_GAP) + ICON_SIZE}
                                  y={iconsY + ICON_SIZE}
                                  fontSize={6.5}
                                  fill="rgba(240,237,229,0.9)"
                                  textAnchor="end"
                                  fontWeight="700"
                                  style={{ pointerEvents: 'none' }}>
                                  {qty}
                                </text>
                              )}
                            </g>
                          ))}
                          {/* Glucides + eau */}
                          {w > 70 && (
                            <text x={cx} y={BAR_PAD_TOP + 70}
                              textAnchor="middle" fontSize={9} fill={hasNutrition ? '#FBBF24' : 'rgba(251,191,36,0.35)'}
                              style={{ pointerEvents: 'none' }}>
                              {hasNutrition ? `${nutrition.carbs}g gluc · ${nutrition.water}mL` : '— glucides'}
                            </text>
                          )}
                          {/* Sodium */}
                          {w > 70 && hasNutrition && (
                            <text x={cx} y={BAR_PAD_TOP + 83}
                              textAnchor="middle" fontSize={9} fill="rgba(148,163,184,0.85)"
                              style={{ pointerEvents: 'none' }}>
                              {nutrition.sodium}mg Na{nutrition.caffeine > 0 ? ` · ${nutrition.caffeine}mg caféine` : ''}
                            </text>
                          )}
                        </>
                      );
                    })()}
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
                    {/* Stylo (haut-gauche) — indique l'édition au clic */}
                    {w > 45 && (
                      <g transform={lucideAt(x + 10, BAR_PAD_TOP + 9)}
                        style={{ pointerEvents: 'none' }}>
                        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
                          fill="none" stroke="rgba(240,237,229,0.32)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="m15 5 4 4"
                          fill="none" stroke="rgba(240,237,229,0.32)" strokeWidth="2" strokeLinecap="round" />
                      </g>
                    )}
                    {/* Poubelle (haut-droite) — Lucide Trash2 */}
                    {(() => {
                      const endStation = leg.toName !== 'Arrivée'
                        ? sortedStations.find(s => s.name === leg.toName)
                        : null;
                      if (!endStation || w < 18) return null;
                      const isConfirming = confirmDeleteStationId === endStation.id;
                      const stroke = isConfirming ? '#EF4444' : 'rgba(240,237,229,0.38)';
                      const cx = x + w - 10;
                      const cy = BAR_PAD_TOP + 9;
                      return (
                        <g transform={lucideAt(cx, cy)}
                          onClick={e => { e.stopPropagation(); setConfirmDeleteStationId(isConfirming ? null : endStation.id); }}
                          style={{ cursor: 'pointer' }}>
                          <rect x={-2} y={-2} width={28} height={28} fill="transparent" />
                          <path d="M3 6h18" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <line x1="10" y1="11" x2="10" y2="17" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
                          <line x1="14" y1="11" x2="14" y2="17" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
                        </g>
                      );
                    })()}
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

      {/* Modal d'édition du tronçon */}
      {selectedLegIdx !== null && effectiveLegs[selectedLegIdx] && (() => {
        const leg = effectiveLegs[selectedLegIdx];
        const predictedTime = legs[selectedLegIdx]?.time ?? leg.time;
        const key = legKey(selectedLegIdx);
        const isTimeOvr = key in timeOverrides;
        const avgPace = leg.time > 0 && leg.distance > 0 ? leg.time / (leg.distance / 1000) : null;
        const endStation = leg.toName !== 'Arrivée' ? sortedStations.find(s => s.name === leg.toName) : null;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setSelectedLegIdx(null); setEditingStationName(false); }}>
            <div className="absolute inset-0 bg-black/60" />
            <div
              className="relative bg-gray-900 border border-gray-700 rounded-xl p-6 flex flex-col gap-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm text-gray-400 shrink-0">{leg.fromName}</span>
                  <span className="text-gray-600 shrink-0">→</span>
                  {endStation ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                      {editingStationName ? (
                        <input
                          autoFocus
                          type="text"
                          value={endStation.name}
                          onChange={e => updateStationName(endStation.id, e.target.value)}
                          onBlur={() => setEditingStationName(false)}
                          onKeyDown={e => e.key === 'Enter' && setEditingStationName(false)}
                          className="bg-transparent border-b border-gray-500 focus:border-gray-300 outline-none text-sm font-semibold text-gray-100 py-0.5 w-[140px]"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-gray-100">{endStation.name}</span>
                      )}
                      <button
                        onClick={() => setEditingStationName(v => !v)}
                        className="text-gray-600 hover:text-gray-300 transition-colors shrink-0"
                        title="Renommer"
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm font-semibold text-gray-100">{leg.toName}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {endStation && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmDeleteStationId(endStation.id)}
                      className="h-7 w-7 text-gray-600 hover:text-red-400 hover:bg-red-900/20"
                      title="Supprimer ce ravito"
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setSelectedLegIdx(null); setEditingStationName(false); }}
                    className="h-7 w-7 text-gray-500 hover:text-gray-300"
                  >
                    <X size={14} />
                  </Button>
                </div>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-4 text-sm">
                <span className={isTimeOvr ? 'text-amber-300 font-medium' : 'text-gray-200 font-medium'}>{formatTime(leg.time)}</span>
                <span className="text-gray-500">{(leg.distance / 1000).toFixed(1)} km</span>
                <span className="text-gray-500">+{Math.round(leg.elevGain)} / −{Math.round(leg.elevLoss)} m</span>
                {avgPace !== null && <span className="text-gray-500">{formatPace(avgPace)}/km</span>}
              </div>

              {/* Temps */}
              <div className="flex flex-col gap-2 pb-1 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">Temps du tronçon</span>
                  {isTimeOvr && (
                    <button onClick={() => resetTimeOverride(key)}
                      className="text-[11px] text-gray-600 hover:text-gray-400 flex items-center gap-1.5">
                      <RotateCcw size={10} /> prédit : {formatTime(predictedTime)}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    key={`t-${selectedLegIdx}-${timeOverrides[key] ?? 'auto'}`}
                    type="text"
                    defaultValue={formatDuration(leg.time)}
                    onBlur={e => setTimeOverride(key, e.target.value)}
                    placeholder="ex: 1:30"
                    className={['w-24 bg-gray-700 border-0 h-auto py-1.5 text-sm focus-visible:ring-1 focus-visible:ring-gray-500',
                      isTimeOvr ? 'text-amber-300' : 'text-gray-100'].join(' ')}
                  />
                  {!isTimeOvr
                    ? <span className="text-[11px] text-gray-600">prédit par le modèle GAP</span>
                    : <span className="text-[11px] text-amber-600/80">modifié manuellement</span>
                  }
                </div>
              </div>

              {/* Nutrition */}
              <LegNutritionPanel
                legTime={leg.time}
                assignments={legNutritionPlan[key] ?? []}
                foodLibrary={foodLibrary}
                carbsPerHour={carbsPerHour}
                waterPerHour={waterPerHour}
                sodiumPerHour={sodiumPerHour}
                caffeinePerHour={caffeinePerHour}
                onAddFood={id => addFoodToLeg(key, id)}
                onRemoveFood={id => removeFoodFromLeg(key, id)}
              />
            </div>
          </div>
        );
      })()}

      {/* AlertDialog for delete confirmation */}
      <AlertDialog open={!!confirmDeleteStationId} onOpenChange={(open) => { if (!open) setConfirmDeleteStationId(null); }}>
        <AlertDialogContent className="bg-gray-900 border-gray-700 text-gray-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-100">Supprimer le ravitaillement</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Supprimer <span className="font-semibold text-gray-200">{stationToDelete?.name}</span> ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-gray-100">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteStationId) {
                  deleteStation(confirmDeleteStationId);
                  setConfirmDeleteStationId(null);
                  setSelectedLegIdx(null);
                }
              }}
              className="bg-red-900 text-red-100 hover:bg-red-800 border-0"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {aidStations.length === 0 && (
        <p className="text-[11px] text-gray-600 text-center">
          Cliquer sur le profil pour placer un ravitaillement
        </p>
      )}
    </div>
  );
}
