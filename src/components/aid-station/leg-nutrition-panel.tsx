import { useState } from "react";
import type { FoodItem, LegFoodAssignment } from "../../types";
import { computeLegNutrition } from "./nutrition-utils";

interface Props {
  assignments: LegFoodAssignment[];
  carbsPerHour: number;
  foodLibrary: FoodItem[];
  legTime: number;
  onAddFood: (foodItemId: string) => void;
  onRemoveFood: (foodItemId: string) => void;
  sodiumPerHour: number;
  waterPerHour: number;
}

const BILAN_ROWS = [
  {
    key: "carbs",
    label: "Gluc.",
    unit: "g",
    color: "text-amber-400",
    bg: "bg-amber-900/30",
    border: "border-amber-700/40",
  },
  {
    key: "water",
    label: "Eau",
    unit: "mL",
    color: "text-sky-400",
    bg: "bg-sky-900/30",
    border: "border-sky-700/40",
  },
  {
    key: "sodium",
    label: "Na",
    unit: "mg",
    color: "text-slate-300",
    bg: "bg-slate-700/30",
    border: "border-slate-500/40",
  },
] as const;

function foodIcon(item: FoodItem): string {
  if (item.type === "flask") {
    return item.hasPowder ? "/food/iso.png" : "/food/water.png";
  }
  if (item.type === "gel") {
    return "/food/gel.png";
  }
  if (item.type === "pill") {
    return "/food/pill.png";
  }
  return "/food/bar.png";
}

function FoodCard({
  item,
  qty,
  onAdd,
  onRemove,
}: {
  item: FoodItem;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const icon = foodIcon(item);
  const hasMacros =
    item.carbsG > 0 ||
    item.sodiumMg > 0 ||
    item.caffeineMg > 0 ||
    item.waterMl > 0;

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: tooltip wrapper with mouse enter/leave; no interactive equivalent needed
    <div
      className="relative flex flex-col items-center gap-1.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Tooltip macros */}
      {hovered && hasMacros && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2">
          <div className="flex flex-col gap-0.5 whitespace-nowrap rounded-lg border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-[11px] shadow-xl">
            <span className="text-center font-medium text-gray-300">
              {item.name}
            </span>
            <div className="flex items-center justify-center gap-2">
              {item.waterMl > 0 && (
                <span className="text-sky-400">{item.waterMl} mL</span>
              )}
              {item.carbsG > 0 && (
                <span className="text-amber-400">{item.carbsG} g gluc.</span>
              )}
              {item.sodiumMg > 0 && (
                <span className="text-slate-300">{item.sodiumMg} mg Na</span>
              )}
              {item.caffeineMg > 0 && (
                <span className="text-violet-400">
                  {item.caffeineMg} mg caféine
                </span>
              )}
            </div>
          </div>
          <div className="mx-auto -mt-1 h-2 w-2 rotate-45 border-gray-600 border-r border-b bg-gray-900" />
        </div>
      )}

      {/* Card button */}
      <button
        className={[
          "relative flex h-[68px] w-[68px] items-center justify-center rounded-2xl transition-all duration-150",
          qty > 0
            ? "border-2 border-gray-500 bg-gray-700 shadow-md hover:scale-105 hover:border-gray-400"
            : "border-2 border-gray-700 bg-gray-800/80 hover:scale-105 hover:border-gray-500 hover:bg-gray-750",
        ].join(" ")}
        onClick={onAdd}
        title={`Ajouter : ${item.name}`}
        type="button"
      >
        <img
          alt={item.name}
          className="h-10 w-10 object-contain drop-shadow-sm"
          height={40}
          src={icon}
          width={40}
        />

        {/* Qty badge — cliquable pour retirer */}
        {qty > 0 && (
          <button
            className="group absolute -top-2 -right-2 flex h-[22px] min-w-[22px] cursor-pointer items-center justify-center rounded-full bg-teal-500 px-1 font-bold text-[11px] text-white leading-none shadow-lg transition-colors hover:bg-red-500"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Retirer un"
            type="button"
          >
            <span className="group-hover:hidden">{qty}</span>
            <span className="hidden group-hover:inline">−</span>
          </button>
        )}
      </button>

      {/* Name */}
      <span className="line-clamp-2 w-[72px] break-words text-center text-[10px] text-gray-500 leading-tight">
        {item.name}
      </span>
    </div>
  );
}

export function LegNutritionPanel({
  legTime,
  assignments,
  foodLibrary,
  carbsPerHour,
  waterPerHour,
  sodiumPerHour,
  onAddFood,
  onRemoveFood,
}: Props) {
  const totals = computeLegNutrition(assignments, foodLibrary);
  const hours = legTime / 3600;
  const targets = {
    carbs: Math.round(hours * carbsPerHour),
    water: Math.round(hours * waterPerHour),
    sodium: Math.round(hours * sodiumPerHour),
  };
  const hasAssignments = assignments.length > 0;
  const actual: Record<string, number> = {
    carbs: totals.carbs,
    water: totals.water,
    sodium: totals.sodium,
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header + bilan pills */}
      <div className="flex items-center justify-between">
        <span className="font-medium text-[11px] text-gray-500 uppercase tracking-wide">
          Nutrition
        </span>
        <div className="flex items-center gap-1.5">
          {BILAN_ROWS.map(({ key, label, unit, color, bg, border }) => {
            const val = actual[key];
            const tgt = targets[key as keyof typeof targets];
            const pct = tgt > 0 ? Math.round((val / tgt) * 100) : 0;
            let statusClass: string;
            if (!hasAssignments) {
              statusClass = `${bg} ${border} ${color}`;
            } else if (pct < 75 || pct > 130) {
              statusClass = "bg-red-900/30 border-red-700/50 text-red-300";
            } else if (pct < 100 || pct > 115) {
              statusClass =
                "bg-orange-900/30 border-orange-700/50 text-orange-300";
            } else {
              statusClass =
                "bg-green-900/30 border-green-700/50 text-green-300";
            }
            return (
              <div
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[10px] ${statusClass}`}
                key={key}
              >
                {hasAssignments ? (
                  <>
                    <span>{pct}%</span>
                    <span className="opacity-50">·</span>
                    <span className="opacity-75">
                      {val}
                      {unit}
                    </span>
                  </>
                ) : (
                  "—"
                )}
                <span className="opacity-60">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {foodLibrary.length === 0 ? (
        <p className="text-gray-600 text-xs italic">
          Ajoutez des aliments dans la bibliothèque ci-dessus pour planifier la
          nutrition de ce tronçon.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3 pt-1">
          {foodLibrary.map((item) => {
            const qty =
              assignments.find((a) => a.foodItemId === item.id)?.quantity ?? 0;
            return (
              <FoodCard
                item={item}
                key={item.id}
                onAdd={() => onAddFood(item.id)}
                onRemove={() => onRemoveFood(item.id)}
                qty={qty}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
