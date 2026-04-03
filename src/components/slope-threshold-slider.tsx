import { useRef, useState } from "react";

interface Props {
  downhillColors: string[]; // utilisé pour info, symétrique aux couleurs montée
  max?: number;
  onChange: (thresholds: number[]) => void;
  thresholds: number[];
  uphillColors: string[];
}

const VIEW_W = 800;
const VIEW_H = 72;
const PAD_LEFT = 44;
const PAD_RIGHT = 16;
const BAR_Y = 18;
const BAR_H = 16;
const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const HANDLE_R = 7;
const MIN_GAP = 1;

export function SlopeThresholdSlider({
  thresholds,
  onChange,
  uphillColors,
  downhillColors: _downhillColors,
  max = 50,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const sorted = [...thresholds].sort((a, b) => a - b);

  function toX(val: number) {
    return PAD_LEFT + (val / max) * CHART_W;
  }

  function xToVal(svgX: number): number {
    const raw = ((svgX - PAD_LEFT) / CHART_W) * max;
    return Math.round(Math.max(0, Math.min(max, raw)));
  }

  function getClientSvgX(clientX: number): number {
    const svg = svgRef.current;
    if (!svg) {
      return PAD_LEFT;
    }
    const rect = svg.getBoundingClientRect();
    const relX = clientX - rect.left;
    return (relX / rect.width) * VIEW_W;
  }

  function hitHandle(svgX: number, svgY: number): number | null {
    for (let i = 0; i < sorted.length; i++) {
      const hx = toX(sorted[i]);
      const hy = BAR_Y + BAR_H / 2;
      if (Math.hypot(svgX - hx, svgY - hy) <= HANDLE_R + 4) {
        return i;
      }
    }
    return null;
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    const svgX = getClientSvgX(e.clientX);
    const svgY = BAR_Y + BAR_H / 2;
    const idx = hitHandle(svgX, svgY);
    if (idx !== null) {
      setDraggingIndex(idx);
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (draggingIndex === null) {
      return;
    }
    const svgX = getClientSvgX(e.clientX);
    const newVal = xToVal(svgX);
    const lo =
      draggingIndex > 0 ? sorted[draggingIndex - 1] + MIN_GAP : MIN_GAP;
    const hi =
      draggingIndex < sorted.length - 1
        ? sorted[draggingIndex + 1] - MIN_GAP
        : max - MIN_GAP;
    const clamped = Math.max(lo, Math.min(hi, newVal));
    if (clamped === sorted[draggingIndex]) {
      return;
    }
    const next = [...sorted];
    next[draggingIndex] = clamped;
    onChange(next);
  }

  function handleMouseUp() {
    setDraggingIndex(null);
  }

  function handleDoubleClick(e: React.MouseEvent) {
    const svgX = getClientSvgX(e.clientX);
    const svgY = BAR_Y + BAR_H / 2;
    if (hitHandle(svgX, svgY) !== null) {
      return;
    }
    const val = xToVal(svgX);
    if (sorted.includes(val)) {
      return;
    }
    onChange([...sorted, val].sort((a, b) => a - b));
  }

  function handleContextMenu(e: React.MouseEvent, idx: number) {
    e.preventDefault();
    if (sorted.length <= 1) {
      return;
    }
    const next = sorted.filter((_, i) => i !== idx);
    onChange(next);
  }

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    const svgX = getClientSvgX(touch.clientX);
    const idx = hitHandle(svgX, BAR_Y + BAR_H / 2);
    if (idx !== null) {
      e.preventDefault();
      setDraggingIndex(idx);
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (draggingIndex === null) {
      return;
    }
    e.preventDefault();
    const touch = e.touches[0];
    const svgX = getClientSvgX(touch.clientX);
    const newVal = xToVal(svgX);
    const lo =
      draggingIndex > 0 ? sorted[draggingIndex - 1] + MIN_GAP : MIN_GAP;
    const hi =
      draggingIndex < sorted.length - 1
        ? sorted[draggingIndex + 1] - MIN_GAP
        : max - MIN_GAP;
    const clamped = Math.max(lo, Math.min(hi, newVal));
    if (clamped === sorted[draggingIndex]) {
      return;
    }
    const next = [...sorted];
    next[draggingIndex] = clamped;
    onChange(next);
  }

  function handleTouchEnd() {
    setDraggingIndex(null);
  }

  // Segments colorés uphill (entre les seuils)
  const segments: { x: number; w: number; color: string }[] = [];
  const bounds = [0, ...sorted, max];
  for (let i = 0; i < bounds.length - 1; i++) {
    segments.push({
      x: toX(bounds[i]),
      w: toX(bounds[i + 1]) - toX(bounds[i]),
      color: uphillColors[i] ?? uphillColors.at(-1),
    });
  }

  // Ticks de l'axe X tous les 5%
  const xTicks: number[] = [];
  for (let v = 0; v <= max; v += 5) {
    xTicks.push(v);
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold text-gray-200 text-sm">Seuils de pente</h2>
        <span className="text-[10px] text-gray-600">
          Double-clic pour ajouter · Clic droit pour supprimer
        </span>
      </div>

      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: interactive SVG slider; no HTML semantic alternative */}
      <svg
        aria-label="Configurateur de seuils de pente"
        onDoubleClick={handleDoubleClick}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraggingIndex(null);
          }
        }}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        preserveAspectRatio="xMidYMid meet"
        ref={svgRef}
        role="application"
        style={{
          cursor: draggingIndex === null ? "default" : "ew-resize",
          userSelect: "none",
          touchAction: "none",
        }}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
      >
        {/* Fond de la barre */}
        <rect
          fill="#1E1E1B"
          height={BAR_H}
          rx={4}
          width={CHART_W}
          x={PAD_LEFT}
          y={BAR_Y}
        />

        {/* Segments colorés */}
        {segments.map((seg, i) => {
          const isFirst = i === 0;
          const isLast = i === segments.length - 1;
          const rx = isFirst || isLast ? 4 : 0;
          return (
            <rect
              fill={seg.color}
              fillOpacity={0.85}
              height={BAR_H}
              key={seg.color}
              rx={rx}
              width={seg.w}
              x={seg.x}
              y={BAR_Y}
            />
          );
        })}

        {/* Contour de la barre */}
        <rect
          fill="none"
          height={BAR_H}
          rx={4}
          stroke="#3D3D37"
          strokeWidth={1}
          width={CHART_W}
          x={PAD_LEFT}
          y={BAR_Y}
        />

        {/* Ticks axe X */}
        {xTicks.map((v) => (
          <g key={v}>
            <line
              stroke="#56554E"
              strokeWidth={1}
              x1={toX(v)}
              x2={toX(v)}
              y1={BAR_Y + BAR_H}
              y2={BAR_Y + BAR_H + 5}
            />
            <text
              fill="#6E6C66"
              fontSize={9}
              textAnchor="middle"
              x={toX(v)}
              y={BAR_Y + BAR_H + 14}
            >
              {v}%
            </text>
          </g>
        ))}

        {/* Poignées */}
        {sorted.map((val, i) => {
          const hx = toX(val);
          const hy = BAR_Y + BAR_H / 2;
          const isDragging = draggingIndex === i;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: SVG <g> handle; no HTML semantic equivalent
            <g
              key={`handle-${val}`}
              onContextMenu={(e) => handleContextMenu(e, i)}
              style={{ cursor: "ew-resize" }}
            >
              {/* Ligne verticale */}
              <line
                stroke="#ffffff"
                strokeOpacity={0.5}
                strokeWidth={1.5}
                x1={hx}
                x2={hx}
                y1={BAR_Y}
                y2={BAR_Y + BAR_H}
              />
              {/* Cercle */}
              <circle
                cx={hx}
                cy={hy}
                fill={isDragging ? "#ffffff" : "#B0ADA5"}
                r={HANDLE_R}
                stroke="var(--chart-surface)"
                strokeWidth={2}
              />
              {/* Label valeur au-dessus */}
              <text
                fill="var(--chart-foreground)"
                fontSize={10}
                fontWeight="600"
                textAnchor="middle"
                x={hx}
                y={BAR_Y - 5}
              >
                {val}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
