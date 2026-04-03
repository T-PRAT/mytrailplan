import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  detectSegments,
  formatPace,
  formatTime,
  gapPaceFromTime,
  parseDuration,
  simulateGap,
} from "../lib/gap-calculation";
import type { ProfilePoint, Section } from "../types";

interface Props {
  profilePoints: ProfilePoint[];
  sections: Section[];
  slopeHexFn: (slope: number) => string;
  totalDistance: number;
}

interface HoverState {
  sectionIdx: number;
  svgX: number;
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

const PACE_LINE_COLOR = "var(--chart-foreground)";
const DEFAULT_GAP_PACE = 360; // 6:00/km
const SLIDER_MIN = 180; // 3:00/km
const SLIDER_MAX = 1200; // 20:00/km

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex by nature
export function GapSimulator({
  sections,
  profilePoints,
  totalDistance,
  slopeHexFn,
}: Props) {
  const [mode, setMode] = useState<"vap" | "duration">("vap");
  const [sliderPace, setSliderPace] = useState(DEFAULT_GAP_PACE);
  const [durationInput, setDurationInput] = useState("");
  const [hover, setHover] = useState<HoverState | null>(null);
  const [hoveredSegIdx, setHoveredSegIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState<ZoomRange | null>(null);
  const [showPaceLine, setShowPaceLine] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const segments = useMemo(
    () => detectSegments(sections, profilePoints),
    [sections, profilePoints]
  );

  const parsedDuration = useMemo(
    () => parseDuration(durationInput),
    [durationInput]
  );
  const durationInvalid = durationInput.length > 0 && parsedDuration === null;

  const gapPace = useMemo(() => {
    if (mode === "vap") {
      return sliderPace;
    }
    if (parsedDuration) {
      return gapPaceFromTime(sections, parsedDuration);
    }
    return null;
  }, [mode, sliderPace, parsedDuration, sections]);

  const simulation = useMemo(
    () => (gapPace ? simulateGap(sections, gapPace) : null),
    [sections, gapPace]
  );

  if (profilePoints.length < 2) {
    return null;
  }

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

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svgX = getClientSvgX(e);
    const distM = svgXToDist(svgX);

    let idx = sections.length - 1;
    for (let i = 0; i < profilePoints.length - 1; i++) {
      if (distM <= profilePoints[i + 1].cumulativeDistance) {
        idx = i;
        break;
      }
    }
    setHover({ svgX, sectionIdx: idx });

    // Trouver quel segment est survolé
    const segIdx = segments.findIndex(
      (seg) => distM >= seg.startDistance && distM <= seg.endDistance
    );
    setHoveredSegIdx(segIdx >= 0 ? segIdx : null);
  }

  function handleMouseLeave() {
    setHover(null);
    setHoveredSegIdx(null);
  }

  function handleClick(_e: React.MouseEvent<SVGSVGElement>) {
    if (hoveredSegIdx === null) {
      return;
    }
    const seg = segments[hoveredSegIdx];
    // Si déjà zoomé sur ce segment, dézoomer
    if (
      zoom &&
      zoom.from === seg.startDistance &&
      zoom.to === seg.endDistance
    ) {
      setZoom(null);
    } else {
      setZoom({ from: seg.startDistance, to: seg.endDistance });
    }
  }

  // --- Profil altimétrique ---
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

  const yBase = toYEle(eleMin);

  const elevationPaths = colorGroups.map((g) => {
    const pts = profilePoints.slice(g.start, g.end + 2);
    if (pts.length < 2) {
      return null;
    }
    const top = pts
      .map((p) => `${toX(p.cumulativeDistance)},${toYEle(p.elevation)}`)
      .join(" L");
    const x1 = toX(pts[0].cumulativeDistance);
    const x2 = toX(pts.at(-1)?.cumulativeDistance ?? pts[0].cumulativeDistance);
    return (
      <path
        d={`M ${top} L${x2},${yBase} L${x1},${yBase} Z`}
        fill={g.color}
        fillOpacity={0.85}
        key={`elevseg-${g.start}-${g.color}`}
      />
    );
  });

  const outlinePoints = profilePoints
    .map((p) => `${toX(p.cumulativeDistance)},${toYEle(p.elevation)}`)
    .join(" ");

  // --- Courbe d'allure ---
  let paceLine: string | null = null;
  if (simulation) {
    const points: string[] = [];
    for (let i = 0; i < simulation.sections.length; i++) {
      const startDist = profilePoints[i]?.cumulativeDistance ?? 0;
      const endDist = profilePoints[i + 1]?.cumulativeDistance ?? totalDistance;
      const y = toYPace(simulation.sections[i].actualPace);
      if (i === 0) {
        points.push(`${toX(startDist)},${y}`);
      }
      points.push(`${toX(endDist)},${y}`);
    }
    paceLine = points.join(" ");
  }

  const refY = gapPace ? toYPace(gapPace) : null;

  // --- Ticks ---
  const eleTicks: number[] = [];
  for (let i = 0; i <= 4; i++) {
    eleTicks.push(eleMin + (eleYRange * i) / 4);
  }

  const paceTicks: number[] = [];
  if (simulation) {
    for (let i = 0; i <= 4; i++) {
      paceTicks.push(paceMin + (paceRange * i) / 4);
    }
  }

  const visibleKm = visibleRange / 1000;
  let kmStep: number;
  if (visibleKm <= 2) {
    kmStep = 0.5;
  } else if (visibleKm <= 6) {
    kmStep = 1;
  } else if (visibleKm <= 15) {
    kmStep = 2;
  } else if (visibleKm <= 30) {
    kmStep = 5;
  } else {
    kmStep = 10;
  }
  const xTicks: number[] = [];
  const startKm = Math.ceil(visibleFrom / 1000 / kmStep) * kmStep;
  for (let km = startKm; km <= visibleTo / 1000 + 0.001; km += kmStep) {
    xTicks.push(km * 1000);
  }

  // --- Hover ---
  const hoverSim =
    hover && simulation ? simulation.sections[hover.sectionIdx] : null;
  const hoverSlope = hover ? (sections[hover.sectionIdx]?.slope ?? 0) : 0;
  const hoverEle = hover
    ? (() => {
        const idx = hover.sectionIdx;
        const p1 = profilePoints[idx];
        const p2 = profilePoints[idx + 1] ?? p1;
        const distM = svgXToDist(hover.svgX);
        const span = p2.cumulativeDistance - p1.cumulativeDistance;
        const t = span > 0 ? (distM - p1.cumulativeDistance) / span : 0;
        return p1.elevation + t * (p2.elevation - p1.elevation);
      })()
    : 0;

  // --- Tooltip de segment ---
  // Segment affiché : survolé en priorité, sinon segment zoomé
  const zoomedSegIdx = zoom
    ? segments.findIndex(
        (s) => s.startDistance === zoom.from && s.endDistance === zoom.to
      )
    : -1;
  let activeSeg: (typeof segments)[0] | null;
  let activeSegIdx: number | null;
  if (hoveredSegIdx !== null) {
    activeSeg = segments[hoveredSegIdx];
    activeSegIdx = hoveredSegIdx;
  } else if (zoomedSegIdx >= 0) {
    activeSeg = segments[zoomedSegIdx];
    activeSegIdx = zoomedSegIdx;
  } else {
    activeSeg = null;
    activeSegIdx = null;
  }

  const activeSegSim =
    activeSeg && simulation
      ? simulation.sections.slice(activeSeg.startIndex, activeSeg.endIndex + 1)
      : null;
  const activeSegTime =
    activeSegSim?.reduce((acc, s) => acc + s.sectionTime, 0) ?? null;
  const activeSegAvgPace =
    activeSegTime != null && activeSeg && activeSeg.distance > 0
      ? activeSegTime / (activeSeg.distance / 1000)
      : null;

  const activeSegVerticalSpeed =
    activeSeg && activeSegTime != null && activeSegTime > 0
      ? Math.round((activeSeg.elevationChange * 3600) / activeSegTime)
      : null;

  const segTooltipW = 130;
  const segTooltipH = activeSegAvgPace == null ? 58 : 86;
  const segTooltipX = activeSeg
    ? (() => {
        const cx =
          (toX(activeSeg.startDistance) + toX(activeSeg.endDistance)) / 2;
        if (cx + segTooltipW / 2 + 4 > VIEW_W - PAD_RIGHT) {
          return VIEW_W - PAD_RIGHT - segTooltipW - 4;
        }
        if (cx - segTooltipW / 2 - 4 < PAD_LEFT) {
          return PAD_LEFT + 4;
        }
        return cx - segTooltipW / 2;
      })()
    : 0;
  const segTooltipY = PAD_TOP + 6;

  // --- Zones de segments : remplissage du vide au-dessus du profil ---
  const segmentZones = segments.map((seg, si) => {
    const isClimbOrDescent = seg.type !== "rolling";
    let color: string;
    if (seg.type === "climb") {
      color = "#E8C170";
    } else if (seg.type === "descent") {
      color = "#4AADAD";
    } else {
      color = "#E0DDD6";
    }
    const isActive =
      hoveredSegIdx === si || (hoveredSegIdx === null && zoomedSegIdx === si);

    const pts = profilePoints.slice(seg.startIndex, seg.endIndex + 2);
    if (pts.length < 2) {
      return null;
    }
    const x1 = toX(pts[0].cumulativeDistance);
    const x2 = toX(pts.at(-1)?.cumulativeDistance ?? pts[0].cumulativeDistance);
    const profileEdge = [...pts]
      .reverse()
      .map((p) => `${toX(p.cumulativeDistance)},${toYEle(p.elevation)}`)
      .join(" L");
    const d = `M ${x1},${PAD_TOP} L ${x2},${PAD_TOP} L ${profileEdge} Z`;

    const baseOpacity = isClimbOrDescent ? 0.25 : 0.1;
    const activeOpacity = isClimbOrDescent ? 0.5 : 0.2;

    return (
      <g key={`seg-${seg.startIndex}-${seg.endIndex}`}>
        <path
          d={d}
          fill={color}
          fillOpacity={isActive ? activeOpacity : baseOpacity}
        />
      </g>
    );
  });

  const hoverVerticalSpeed = hoverSim
    ? Math.round(hoverSim.actualSpeed * 3600 * (hoverSlope / 100))
    : 0;

  const hoverTooltipOnLeft = hover ? hover.svgX > VIEW_W / 2 : false;
  const hoverTooltipW = 155;
  const hoverTooltipH = hoverSim ? 76 : 46;
  const hoverTooltipY = PAD_TOP + 4;

  // Curseur : pointeur si on est sur un segment, sinon crosshair
  const cursor = hoveredSegIdx === null ? "crosshair" : "pointer";

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-gray-700 bg-gray-900 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-base text-gray-200">
          Simulateur VAP
        </h2>
        <div className="flex items-center gap-4">
          {zoom && (
            <Button
              className="h-auto px-2 py-1 text-gray-500 text-xs hover:text-gray-300"
              onClick={() => setZoom(null)}
              size="sm"
              variant="ghost"
            >
              Réinitialiser le zoom
            </Button>
          )}
          <div className="flex cursor-pointer select-none items-center gap-1.5">
            <span className="text-gray-500 text-xs">Courbe d'allure</span>
            <Switch
              aria-label="Afficher la courbe d'allure"
              checked={showPaceLine}
              className="data-[state=checked]:bg-gray-400 data-[state=unchecked]:bg-gray-700"
              onCheckedChange={setShowPaceLine}
            />
          </div>
        </div>
      </div>

      {/* Toggle mode */}
      <div className="flex w-fit items-center gap-1 rounded-lg bg-gray-800 p-1">
        <Button
          className={[
            "h-auto rounded-md px-3 py-1 font-medium text-sm transition-colors",
            mode === "vap"
              ? "bg-gray-700 text-gray-100 hover:bg-gray-700 hover:text-gray-100"
              : "text-gray-500 hover:bg-transparent hover:text-gray-300",
          ].join(" ")}
          onClick={() => setMode("vap")}
          size="sm"
          variant="ghost"
        >
          VAP cible
        </Button>
        <Button
          className={[
            "h-auto rounded-md px-3 py-1 font-medium text-sm transition-colors",
            mode === "duration"
              ? "bg-gray-700 text-gray-100 hover:bg-gray-700 hover:text-gray-100"
              : "text-gray-500 hover:bg-transparent hover:text-gray-300",
          ].join(" ")}
          onClick={() => setMode("duration")}
          size="sm"
          variant="ghost"
        >
          Durée cible
        </Button>
      </div>

      {/* Contrôles */}
      {mode === "vap" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">VAP cible</span>
            <span className="font-semibold text-gray-100 text-sm">
              {formatPace(sliderPace)}
              <span className="font-normal text-gray-500"> /km</span>
            </span>
          </div>
          <Slider
            className="w-full"
            max={SLIDER_MAX}
            min={SLIDER_MIN}
            onValueChange={(vals) => setSliderPace(vals[0])}
            step={5}
            value={[sliderPace]}
          />
          <div className="flex justify-between text-[11px] text-gray-600">
            <span>{formatPace(SLIDER_MIN)}/km</span>
            <span>{formatPace(SLIDER_MAX)}/km</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <label
            className="shrink-0 text-gray-400 text-sm"
            htmlFor="gap-duration-input"
          >
            Durée estimée
          </label>
          <Input
            className={[
              "h-auto w-36 border bg-gray-800 py-1.5 text-gray-100 text-sm",
              durationInvalid
                ? "border-red-700 focus-visible:ring-red-500"
                : "border-gray-700",
            ].join(" ")}
            id="gap-duration-input"
            maxLength={10}
            onChange={(e) => setDurationInput(e.target.value)}
            placeholder="ex: 4:30 ou 4h30"
            type="text"
            value={durationInput}
          />
          {parsedDuration && gapPace && (
            <span className="text-gray-500 text-sm">
              → VAP{" "}
              <span className="font-medium text-gray-300">
                {formatPace(gapPace)}/km
              </span>
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      {simulation && gapPace && (
        <div className="flex gap-6" data-testid="gap-stats">
          <div>
            <p className="mb-0.5 text-[11px] text-gray-500 uppercase tracking-wide">
              {mode === "duration" ? "Durée cible" : "VAP cible"}
            </p>
            <p className="font-semibold text-gray-100 text-lg">
              {mode === "duration" && parsedDuration ? (
                formatTime(parsedDuration)
              ) : (
                <>
                  {formatPace(gapPace)}
                  <span className="ml-1 font-normal text-gray-500 text-sm">
                    /km
                  </span>
                </>
              )}
            </p>
          </div>
          <div>
            <p className="mb-0.5 text-[11px] text-gray-500 uppercase tracking-wide">
              {mode === "duration" ? "VAP correspondante" : "Temps estimé"}
            </p>
            <p className="font-semibold text-gray-100 text-lg">
              {mode === "duration" ? (
                <>
                  {formatPace(gapPace)}
                  <span className="ml-1 font-normal text-gray-500 text-sm">
                    /km
                  </span>
                </>
              ) : (
                formatTime(simulation.totalTime)
              )}
            </p>
          </div>
          <div>
            <p className="mb-0.5 text-[11px] text-gray-500 uppercase tracking-wide">
              Allure moyenne réelle
            </p>
            <p className="font-semibold text-gray-100 text-lg">
              {formatPace(simulation.averageActualPace)}
              <span className="ml-1 font-normal text-gray-500 text-sm">
                /km
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: interactive SVG chart; no HTML semantic alternative */}
      <svg
        aria-label="Simulateur VAP — profil altimétrique"
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setZoom(null);
          }
        }}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        preserveAspectRatio="xMidYMid meet"
        ref={svgRef}
        role="application"
        style={{ cursor, userSelect: "none" }}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
      >
        <defs>
          <clipPath id="gap-chart-area">
            <rect height={CHART_H} width={CHART_W} x={PAD_LEFT} y={PAD_TOP} />
          </clipPath>
        </defs>

        {/* Grille */}
        {eleTicks.map((ele) => (
          <line
            key={`grid-${ele}`}
            stroke="#3D3D37"
            strokeWidth={1}
            x1={PAD_LEFT}
            x2={VIEW_W - PAD_RIGHT}
            y1={toYEle(ele)}
            y2={toYEle(ele)}
          />
        ))}

        <g clipPath="url(#gap-chart-area)">
          {segmentZones}
          {elevationPaths}
          <polyline
            fill="none"
            points={outlinePoints}
            stroke="#B0ADA5"
            strokeLinejoin="round"
            strokeWidth={1.2}
          />

          {showPaceLine && refY !== null && (
            <line
              stroke={PACE_LINE_COLOR}
              strokeDasharray="6 4"
              strokeOpacity={0.3}
              strokeWidth={1}
              x1={PAD_LEFT}
              x2={VIEW_W - PAD_RIGHT}
              y1={refY}
              y2={refY}
            />
          )}
          {showPaceLine && paceLine && (
            <polyline
              fill="none"
              points={paceLine}
              stroke={PACE_LINE_COLOR}
              strokeLinejoin="round"
              strokeOpacity={0.9}
              strokeWidth={2}
            />
          )}
        </g>

        {/* Labels Y gauche */}
        {eleTicks.map((ele) => (
          <text
            fill="#6E6C66"
            fontSize={11}
            key={`ylabel-${ele}`}
            textAnchor="end"
            x={PAD_LEFT - 6}
            y={toYEle(ele) + 4}
          >
            {Math.round(ele)}
          </text>
        ))}

        {/* Labels Y droit (allure) */}
        {showPaceLine &&
          paceTicks.map((pace) => (
            <text
              fill="#8A8880"
              fontSize={11}
              key={`pacelabel-${pace}`}
              textAnchor="start"
              x={VIEW_W - PAD_RIGHT + 6}
              y={toYPace(pace) + 4}
            >
              {formatPace(pace)}
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

        {/* Hover cursor */}
        {hover && (
          <g>
            <line
              stroke="#ffffff"
              strokeDasharray="4 3"
              strokeOpacity={0.25}
              strokeWidth={1}
              x1={hover.svgX}
              x2={hover.svgX}
              y1={PAD_TOP}
              y2={PAD_TOP + CHART_H}
            />
            <circle
              cx={hover.svgX}
              cy={toYEle(hoverEle)}
              fill={slopeHexFn(hoverSlope)}
              r={3.5}
              stroke="var(--chart-surface)"
              strokeWidth={1.5}
            />
            {/* Tooltip curseur (seulement si pas de segment survolé) */}
            {hoveredSegIdx === null && (
              <g>
                <rect
                  fill="var(--chart-surface)"
                  height={hoverTooltipH}
                  rx={5}
                  stroke="#3D3D37"
                  strokeWidth={1}
                  width={hoverTooltipW}
                  x={
                    hoverTooltipOnLeft
                      ? hover.svgX - 8 - hoverTooltipW
                      : hover.svgX + 8
                  }
                  y={hoverTooltipY}
                />
                <text
                  fill="#B0ADA5"
                  fontSize={12}
                  fontWeight="600"
                  textAnchor="middle"
                  x={
                    hoverTooltipOnLeft
                      ? hover.svgX - 8 - hoverTooltipW / 2
                      : hover.svgX + 8 + hoverTooltipW / 2
                  }
                  y={hoverTooltipY + 17}
                >
                  {svgXToDist(hover.svgX) / 1000 >= 0
                    ? `${(svgXToDist(hover.svgX) / 1000).toFixed(2)} km · ${Math.round(hoverEle)} m`
                    : ""}
                </text>
                <text
                  fill={slopeHexFn(hoverSlope)}
                  fontSize={12}
                  textAnchor="middle"
                  x={
                    hoverTooltipOnLeft
                      ? hover.svgX - 8 - hoverTooltipW / 2
                      : hover.svgX + 8 + hoverTooltipW / 2
                  }
                  y={hoverTooltipY + 34}
                >
                  {hoverSlope >= 0 ? "+" : ""}
                  {hoverSlope.toFixed(1)}%
                </text>
                {hoverSim && (
                  <>
                    <text
                      fill={PACE_LINE_COLOR}
                      fontSize={13}
                      fontWeight="600"
                      textAnchor="middle"
                      x={
                        hoverTooltipOnLeft
                          ? hover.svgX - 8 - hoverTooltipW / 2
                          : hover.svgX + 8 + hoverTooltipW / 2
                      }
                      y={hoverTooltipY + 52}
                    >
                      {formatPace(hoverSim.actualPace)}/km
                    </text>
                    <text
                      fill="#8A8880"
                      fontSize={11}
                      textAnchor="middle"
                      x={
                        hoverTooltipOnLeft
                          ? hover.svgX - 8 - hoverTooltipW / 2
                          : hover.svgX + 8 + hoverTooltipW / 2
                      }
                      y={hoverTooltipY + 68}
                    >
                      {hoverVerticalSpeed >= 0 ? "+" : ""}
                      {hoverVerticalSpeed} m/h
                    </text>
                  </>
                )}
              </g>
            )}
          </g>
        )}

        {/* Tooltip de segment — en dernier pour être au premier plan */}
        {activeSeg &&
          activeSegIdx !== null &&
          (() => {
            let color: string;
            let icon: string;
            if (activeSeg.type === "climb") {
              color = "#E8C170";
              icon = "↑";
            } else if (activeSeg.type === "descent") {
              color = "#4AADAD";
              icon = "↓";
            } else {
              color = "#B0ADA5";
              icon = "~";
            }
            const avgSlope =
              activeSeg.distance > 0
                ? Math.abs(activeSeg.elevationChange / activeSeg.distance) * 100
                : 0;
            return (
              <g>
                <rect
                  fill="var(--chart-surface)"
                  height={segTooltipH}
                  rx={6}
                  stroke={color}
                  strokeOpacity={0.7}
                  strokeWidth={1}
                  width={segTooltipW}
                  x={segTooltipX}
                  y={segTooltipY}
                />
                <text
                  fill={color}
                  fontSize={13}
                  fontWeight="700"
                  textAnchor="middle"
                  x={segTooltipX + segTooltipW / 2}
                  y={segTooltipY + 16}
                >
                  {icon} {activeSeg.elevationChange >= 0 ? "+" : ""}
                  {Math.round(activeSeg.elevationChange)} m
                </text>
                <text
                  fill="#8A8880"
                  fontSize={11}
                  textAnchor="middle"
                  x={segTooltipX + segTooltipW / 2}
                  y={segTooltipY + 31}
                >
                  {(activeSeg.distance / 1000).toFixed(2)} km ·{" "}
                  {avgSlope.toFixed(1)}% moy
                </text>
                <text
                  fill="#6E6C66"
                  fontSize={11}
                  textAnchor="middle"
                  x={segTooltipX + segTooltipW / 2}
                  y={segTooltipY + 45}
                >
                  km {(activeSeg.startDistance / 1000).toFixed(1)} →{" "}
                  {(activeSeg.endDistance / 1000).toFixed(1)}
                </text>
                {activeSegAvgPace != null && (
                  <>
                    <text
                      fill={PACE_LINE_COLOR}
                      fontSize={12}
                      fontWeight="600"
                      textAnchor="middle"
                      x={segTooltipX + segTooltipW / 2}
                      y={segTooltipY + 61}
                    >
                      {formatPace(activeSegAvgPace)}/km ·{" "}
                      {activeSegTime == null ? "" : formatTime(activeSegTime)}
                    </text>
                    {activeSegVerticalSpeed != null && (
                      <text
                        fill="#8A8880"
                        fontSize={11}
                        textAnchor="middle"
                        x={segTooltipX + segTooltipW / 2}
                        y={segTooltipY + 76}
                      >
                        {activeSegVerticalSpeed >= 0 ? "+" : ""}
                        {activeSegVerticalSpeed} m/h
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })()}
      </svg>
      <p className="text-center text-[11px] text-gray-600">
        Survoler un segment pour les détails · Cliquer pour zoomer
      </p>
    </div>
  );
}
