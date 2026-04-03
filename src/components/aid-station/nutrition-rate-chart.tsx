import { useState } from "react";

const MACRO_COLORS = {
  carbsG: "#fbbf24",
  waterMl: "#38bdf8",
  sodiumMg: "#94a3b8",
  caffeineMg: "#a78bfa",
} as const;

const VIEW_W = 800;
const PAD_LEFT = 16;
const PAD_RIGHT = 16;
const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const VIEW_H = 110;
const PAD_TOP = 22; // un peu plus de marge pour la compression en haut
const PAD_BOTTOM = 10;
const CHART_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

interface Threshold {
  color: string;
  label: string;
  value: number;
}

interface ZoneHighlight {
  color: string;
  from: number;
  to: number;
}

interface IntakeMarker {
  caffeineMg?: number;
  carbsG?: number;
  foodName?: string;
  label: string;
  placementId?: string;
  sodiumMg?: number;
  timeH: number;
  waterMl?: number;
}

interface TimelinePoint {
  timeH: number;
  value: number;
}

interface NutritionRateChartProps {
  color: string;
  dangerAbove?: number;
  dangerColor?: string;
  footerLabel?: string;
  gradientId: string;
  intakeMarkers: IntakeMarker[];
  legendItems?: { label: string; color: string }[];
  maxValue: number;
  onRemoveMarker?: (placementId: string) => void;
  target?: number;
  thresholds?: Threshold[];
  timelinePoints: TimelinePoint[];
  title: string;
  totalTimeH: number;
  unit: string;
  zoneHighlight?: ZoneHighlight;
}

/** Génère un path SVG lissé via Catmull-Rom → Bézier cubique. */
function smoothLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) {
    return "";
  }
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 2)];
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const p3 = pts[Math.min(pts.length - 1, i + 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function interpolate(points: TimelinePoint[], tH: number): number {
  if (points.length === 0) {
    return 0;
  }
  if (tH <= points[0].timeH) {
    return points[0].value;
  }
  const last = points.at(-1);
  if (last != null && tH >= last.timeH) {
    return last.value;
  }
  const i = points.findIndex((p) => p.timeH > tH);
  const a = points[i - 1];
  const b = points[i];
  const t = (tH - a.timeH) / (b.timeH - a.timeH);
  return a.value + t * (b.value - a.value);
}

function formatTimeH(tH: number): string {
  const h = Math.floor(tH);
  const m = Math.round((tH - h) * 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex by nature
export function NutritionRateChart({
  timelinePoints,
  intakeMarkers,
  totalTimeH,
  maxValue,
  title,
  unit,
  color,
  gradientId,
  target,
  thresholds,
  zoneHighlight,
  dangerAbove,
  dangerColor = "#ef4444",
  footerLabel,
  legendItems,
  onRemoveMarker,
}: NutritionRateChartProps) {
  const [hover, setHover] = useState<{
    svgX: number;
    tH: number;
    value: number;
  } | null>(null);
  const [selectedMarkerIdx, setSelectedMarkerIdx] = useState<number | null>(
    null
  );

  if (timelinePoints.length === 0 || totalTimeH <= 0) {
    return null;
  }

  const timeToX = (tH: number) => PAD_LEFT + (tH / totalTimeH) * CHART_W;
  // Mapping Y avec compression douce (tanh) au-dessus de maxValue.
  // Les valeurs normales (0..maxValue) sont linéaires.
  // Au-delà, la courbe remonte doucement sans jamais dépasser ~15% de CHART_H.
  const valToY = (v: number): number => {
    let norm = v / maxValue;
    if (norm > 1) {
      norm = 1 + Math.tanh((norm - 1) * 2) * 0.15;
    }
    return PAD_TOP + CHART_H - norm * CHART_H;
  };

  const yBaseline = valToY(0);
  const yDanger = dangerAbove == null ? null : valToY(dangerAbove);

  const svgPts = timelinePoints.map((p) => ({
    x: timeToX(p.timeH),
    y: valToY(p.value),
  }));
  const linePath = smoothLinePath(svgPts);
  const lastSvgPt = svgPts.at(-1);
  const areaPath =
    linePath +
    ` L ${lastSvgPt?.x ?? 0},${yBaseline}` +
    ` L ${svgPts[0].x},${yBaseline} Z`;

  const lowTarget = target == null ? null : target * 0.75;
  const highTarget = target == null ? null : target * 1.25;
  const yLow = lowTarget == null ? null : valToY(lowTarget);
  const yHigh = highTarget == null ? null : valToY(highTarget);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const svgX = relX * VIEW_W;
    const tH = ((svgX - PAD_LEFT) / CHART_W) * totalTimeH;
    if (tH < 0 || tH > totalTimeH) {
      setHover(null);
      return;
    }
    setHover({ svgX, tH, value: interpolate(timelinePoints, tH) });
  }

  const hoverOnRight = hover ? hover.svgX < VIEW_W / 2 : false;
  const hoverVal = hover?.value ?? 0;
  const hoverUnit = unit.split("/")[0];

  // Area fills + courbes rendering
  let areaFills: React.ReactNode;
  if (yDanger != null) {
    areaFills = (
      <>
        <path
          clipPath={`url(#${gradientId}-clip-below-danger)`}
          d={areaPath}
          fill={`url(#${gradientId}-ok)`}
        />
        <path
          clipPath={`url(#${gradientId}-clip-above-danger)`}
          d={areaPath}
          fill={`url(#${gradientId}-danger)`}
        />
        <path
          clipPath={`url(#${gradientId}-clip-below-danger)`}
          d={linePath}
          fill="none"
          stroke={color}
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path
          clipPath={`url(#${gradientId}-clip-above-danger)`}
          d={linePath}
          fill="none"
          stroke={dangerColor}
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </>
    );
  } else if (yLow == null) {
    areaFills = (
      <>
        <path d={areaPath} fill={`url(#${gradientId}-ok)`} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </>
    );
  } else {
    areaFills = (
      <>
        <path
          clipPath={`url(#${gradientId}-clip-high)`}
          d={areaPath}
          fill={`url(#${gradientId}-high)`}
        />
        <path
          clipPath={`url(#${gradientId}-clip-ok)`}
          d={areaPath}
          fill={`url(#${gradientId}-ok)`}
        />
        <path
          clipPath={`url(#${gradientId}-clip-low)`}
          d={areaPath}
          fill={`url(#${gradientId}-low)`}
        />
        <path
          clipPath={`url(#${gradientId}-clip-high)`}
          d={linePath}
          fill="none"
          stroke="#f97316"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path
          clipPath={`url(#${gradientId}-clip-ok)`}
          d={linePath}
          fill="none"
          stroke={color}
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path
          clipPath={`url(#${gradientId}-clip-low)`}
          d={linePath}
          fill="none"
          stroke="#f97316"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </>
    );
  }

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: interactive SVG chart; no HTML semantic alternative
    <svg
      aria-label={title}
      onClick={() => setSelectedMarkerIdx(null)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setSelectedMarkerIdx(null);
        }
      }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={handleMouseMove}
      preserveAspectRatio="xMidYMid meet"
      role="application"
      style={{ userSelect: "none", cursor: "crosshair" }}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
    >
      <defs>
        <linearGradient id={`${gradientId}-ok`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={`${gradientId}-danger`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={dangerColor} stopOpacity="0.45" />
          <stop offset="100%" stopColor={dangerColor} stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id={`${gradientId}-low`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={`${gradientId}-high`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.02" />
        </linearGradient>

        {yDanger != null && (
          <>
            <clipPath id={`${gradientId}-clip-above-danger`}>
              <rect height={yDanger} width={CHART_W} x={PAD_LEFT} y={0} />
            </clipPath>
            <clipPath id={`${gradientId}-clip-below-danger`}>
              <rect
                height={yBaseline - yDanger}
                width={CHART_W}
                x={PAD_LEFT}
                y={yDanger}
              />
            </clipPath>
          </>
        )}
        {yLow != null && yHigh != null && (
          <>
            {/* Zone haute : au-dessus de la borne haute (y=0 jusqu'à yHigh) */}
            <clipPath id={`${gradientId}-clip-high`}>
              <rect height={yHigh} width={CHART_W} x={PAD_LEFT} y={0} />
            </clipPath>
            {/* Zone ok : entre borne basse et borne haute */}
            <clipPath id={`${gradientId}-clip-ok`}>
              <rect
                height={yLow - yHigh}
                width={CHART_W}
                x={PAD_LEFT}
                y={yHigh}
              />
            </clipPath>
            {/* Zone basse : en dessous de la borne basse */}
            <clipPath id={`${gradientId}-clip-low`}>
              <rect
                height={yBaseline - yLow}
                width={CHART_W}
                x={PAD_LEFT}
                y={yLow}
              />
            </clipPath>
          </>
        )}
      </defs>

      {/* Titre */}
      <text fill="#6E6C66" fontSize={9} textAnchor="start" x={PAD_LEFT} y={11}>
        {title}
      </text>

      {/* Légende (top-right) */}
      {legendItems && (
        <text fontSize={8} textAnchor="end" x={VIEW_W - PAD_RIGHT} y={11}>
          {legendItems.map((item) => (
            <tspan fill={item.color} key={item.label}>
              {item.label}
            </tspan>
          ))}
        </text>
      )}

      {/* Zone cible surlignée (caféine) */}
      {zoneHighlight && zoneHighlight.from <= maxValue && (
        <rect
          fill={zoneHighlight.color}
          height={
            valToY(zoneHighlight.from) -
            valToY(Math.min(zoneHighlight.to, maxValue))
          }
          opacity="0.08"
          width={CHART_W}
          x={PAD_LEFT}
          y={valToY(Math.min(zoneHighlight.to, maxValue))}
        />
      )}

      {/* Baseline */}
      <line
        stroke="#374151"
        strokeWidth="1"
        x1={PAD_LEFT}
        x2={PAD_LEFT + CHART_W}
        y1={yBaseline}
        y2={yBaseline}
      />

      {/* Area fills + courbes */}
      {areaFills}

      {/* Objectif + bornes (mode rate) */}
      {target != null && (
        <>
          {/* Borne basse (75%) */}
          {lowTarget != null && lowTarget <= maxValue && yLow != null && (
            <g>
              <line
                stroke="#f97316"
                strokeDasharray="3 3"
                strokeOpacity="0.5"
                strokeWidth="1"
                x1={PAD_LEFT}
                x2={PAD_LEFT + CHART_W}
                y1={yLow}
                y2={yLow}
              />
              <text
                fill="#f97316"
                fontSize={8}
                opacity="0.7"
                textAnchor="end"
                x={VIEW_W - PAD_RIGHT}
                y={yLow - 3}
              >
                {lowTarget}
                {hoverUnit} min
              </text>
            </g>
          )}
          {/* Objectif */}
          {target <= maxValue && (
            <g>
              <line
                stroke={color}
                strokeDasharray="4 3"
                strokeOpacity="0.7"
                strokeWidth="1"
                x1={PAD_LEFT}
                x2={PAD_LEFT + CHART_W}
                y1={valToY(target)}
                y2={valToY(target)}
              />
              <text
                fill={color}
                fontSize={8}
                opacity="0.8"
                textAnchor="end"
                x={VIEW_W - PAD_RIGHT}
                y={valToY(target) - 3}
              >
                {target}
                {hoverUnit} objectif
              </text>
            </g>
          )}
          {/* Borne haute (125%) */}
          {highTarget != null && highTarget <= maxValue && yHigh != null && (
            <g>
              <line
                stroke="#f97316"
                strokeDasharray="3 3"
                strokeOpacity="0.5"
                strokeWidth="1"
                x1={PAD_LEFT}
                x2={PAD_LEFT + CHART_W}
                y1={yHigh}
                y2={yHigh}
              />
              <text
                fill="#f97316"
                fontSize={8}
                opacity="0.7"
                textAnchor="end"
                x={VIEW_W - PAD_RIGHT}
                y={yHigh - 3}
              >
                {highTarget}
                {hoverUnit} max
              </text>
            </g>
          )}
        </>
      )}

      {/* Seuils multiples (mode caféine) */}
      {thresholds?.map((t) =>
        t.value <= maxValue ? (
          <g key={t.label}>
            <line
              opacity="0.7"
              stroke={t.color}
              strokeDasharray="3 3"
              strokeWidth="1"
              x1={PAD_LEFT}
              x2={PAD_LEFT + CHART_W}
              y1={valToY(t.value)}
              y2={valToY(t.value)}
            />
            <text
              fill={t.color}
              fontSize={8}
              opacity="0.8"
              textAnchor="end"
              x={VIEW_W - PAD_RIGHT}
              y={valToY(t.value) - 3}
            >
              {t.value}mg
            </text>
          </g>
        ) : null
      )}

      {/* Lignes verticales aux prises */}
      {intakeMarkers.map((marker, i) => {
        const mx = timeToX(marker.timeH);
        const isSelected = selectedMarkerIdx === i;
        const isClickable = !!marker.placementId;
        return (
          <g key={`marker-${marker.timeH}-${marker.label}`}>
            <line
              opacity={isSelected ? 0.7 : 0.35}
              stroke={color}
              strokeDasharray="3 3"
              strokeWidth={isSelected ? 1.5 : 1}
              x1={mx}
              x2={mx}
              y1={PAD_TOP}
              y2={yBaseline}
            />
            <text
              fill={color}
              fontSize={8}
              opacity="0.65"
              x={mx + 3}
              y={PAD_TOP + 9}
            >
              {marker.label}
            </text>
            {isClickable && (
              // biome-ignore lint/a11y/noStaticElementInteractions: SVG rect hit area; no semantic HTML equivalent inside SVG
              <rect
                fill="transparent"
                height={yBaseline - PAD_TOP}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedMarkerIdx(isSelected ? null : i);
                }}
                style={{ cursor: "pointer" }}
                width={12}
                x={mx - 6}
                y={PAD_TOP}
              />
            )}
          </g>
        );
      })}

      {/* Footer label */}
      {footerLabel && (
        <text
          fill="#6E6C66"
          fontSize={8}
          textAnchor="end"
          x={PAD_LEFT + CHART_W}
          y={VIEW_H - 4}
        >
          {footerLabel}
        </text>
      )}

      {/* Popup aliment sélectionné */}
      {selectedMarkerIdx !== null &&
        selectedMarkerIdx < intakeMarkers.length &&
        (() => {
          const m = intakeMarkers[selectedMarkerIdx];
          const mx = timeToX(m.timeH);
          const onRight = mx <= VIEW_W / 2;
          const W = 132;
          const macros = [
            m.carbsG
              ? { text: `${m.carbsG}g glucides`, color: MACRO_COLORS.carbsG }
              : null,
            m.waterMl
              ? { text: `${m.waterMl}mL eau`, color: MACRO_COLORS.waterMl }
              : null,
            m.sodiumMg
              ? { text: `${m.sodiumMg}mg sodium`, color: MACRO_COLORS.sodiumMg }
              : null,
            m.caffeineMg
              ? {
                  text: `${m.caffeineMg}mg caféine`,
                  color: MACRO_COLORS.caffeineMg,
                }
              : null,
          ].filter(Boolean) as { text: string; color: string }[];
          const hasFoodName = !!m.foodName;
          const hasDelete = !!m.placementId && !!onRemoveMarker;
          const nameRowH = hasFoodName ? 13 : 0;
          const bodyH = macros.length * 12;
          const delRowH = hasDelete ? 20 : 0;
          const H = 8 + nameRowH + bodyH + delRowH;
          const rx = onRight
            ? Math.min(mx + 8, VIEW_W - PAD_RIGHT - W)
            : Math.max(PAD_LEFT, mx - 8 - W);
          const ry = PAD_TOP + 2;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: SVG popup container; no HTML semantic equivalent inside SVG
            <g
              onClick={(e) => e.stopPropagation()}
              style={{ pointerEvents: "all" }}
            >
              <rect
                fill="var(--chart-surface)"
                height={H}
                rx={4}
                stroke="#3D3D37"
                strokeWidth={1}
                width={W}
                x={rx}
                y={ry}
              />
              {/* × fermeture */}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG text close button; no HTML semantic equivalent inside SVG */}
              <text
                fill="#6E6C66"
                fontSize={10}
                onClick={() => setSelectedMarkerIdx(null)}
                style={{ cursor: "pointer" }}
                textAnchor="end"
                x={rx + W - 6}
                y={ry + 10}
              >
                ×
              </text>
              {hasFoodName && (
                <text
                  fill="#B0ADA5"
                  fontSize={9}
                  fontWeight="600"
                  x={rx + 7}
                  y={ry + 10}
                >
                  {m.foodName != null && m.foodName.length > 17
                    ? `${m.foodName.slice(0, 16)}…`
                    : m.foodName}
                </text>
              )}
              {macros.map((macro) => (
                <text
                  fill={macro.color}
                  fontSize={8.5}
                  key={macro.text}
                  x={rx + 7}
                  y={ry + 8 + nameRowH + macros.indexOf(macro) * 12 + 9}
                >
                  {macro.text}
                </text>
              ))}
              {hasDelete && (
                // biome-ignore lint/a11y/noStaticElementInteractions: SVG delete button group; no HTML semantic equivalent inside SVG
                <g
                  onClick={() => {
                    if (m.placementId != null) {
                      onRemoveMarker?.(m.placementId);
                    }
                    setSelectedMarkerIdx(null);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    fill="#7f1d1d"
                    height={13}
                    rx={3}
                    width={W - 10}
                    x={rx + 5}
                    y={ry + 8 + nameRowH + bodyH + 4}
                  />
                  <text
                    fill="#fca5a5"
                    fontSize={8}
                    textAnchor="middle"
                    x={rx + W / 2}
                    y={ry + 8 + nameRowH + bodyH + 4 + 9}
                  >
                    Supprimer
                  </text>
                </g>
              )}
            </g>
          );
        })()}

      {/* Crosshair hover */}
      {hover && (
        <g style={{ pointerEvents: "none" }}>
          <line
            stroke="#ffffff"
            strokeDasharray="4 3"
            strokeOpacity="0.2"
            strokeWidth="1"
            x1={hover.svgX}
            x2={hover.svgX}
            y1={PAD_TOP}
            y2={yBaseline}
          />
          <circle
            cx={hover.svgX}
            cy={valToY(hoverVal)}
            fill={color}
            r={3}
            stroke="var(--chart-surface)"
            strokeWidth="1.5"
          />
          <rect
            fill="var(--chart-surface)"
            height={32}
            rx={4}
            stroke="#3D3D37"
            strokeWidth="1"
            width={90}
            x={hoverOnRight ? hover.svgX + 8 : hover.svgX - 8 - 90}
            y={PAD_TOP + 2}
          />
          <text
            fill="#B0ADA5"
            fontSize={10}
            fontWeight="600"
            textAnchor="middle"
            x={hoverOnRight ? hover.svgX + 8 + 45 : hover.svgX - 8 - 45}
            y={PAD_TOP + 14}
          >
            {formatTimeH(hover.tH)}
          </text>
          <text
            fill={color}
            fontSize={10}
            textAnchor="middle"
            x={hoverOnRight ? hover.svgX + 8 + 45 : hover.svgX - 8 - 45}
            y={PAD_TOP + 26}
          >
            {Math.round(hoverVal)} {unit}
          </text>
        </g>
      )}
    </svg>
  );
}
