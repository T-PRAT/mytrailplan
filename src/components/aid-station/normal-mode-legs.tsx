import type { FoodItem, LegNutritionPlan } from "../../types";
import { LegNutritionPanel } from "./leg-nutrition-panel";

interface Leg {
  cumulativeTime: number;
  distance: number;
  elevGain: number;
  elevLoss: number;
  fromDist: number;
  fromName: string;
  time: number;
  toDist: number;
  toName: string;
}

interface Props {
  carbsPerHour: number;
  foodLibrary: FoodItem[];
  legKeys: string[];
  legNutritionPlan: LegNutritionPlan;
  legs: Leg[];
  onAddFood: (legIdx: number, foodItemId: string) => void;
  onOpenLibrary?: () => void;
  onRemoveFood: (legIdx: number, foodItemId: string) => void;
  sodiumPerHour: number;
  waterPerHour: number;
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function NormalModeLegs({
  legs,
  legKeys,
  legNutritionPlan,
  foodLibrary,
  carbsPerHour,
  waterPerHour,
  sodiumPerHour,
  onAddFood,
  onRemoveFood,
  onOpenLibrary,
}: Props) {
  if (foodLibrary.length === 0) {
    return (
      <p className="text-center text-gray-600 text-xs italic">
        Ajoutez des aliments dans la bibliothèque pour planifier la nutrition.
      </p>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-gray-800">
      {legs.map((leg, i) => {
        const key = legKeys[i] ?? `leg_${i}`;
        const assignments = legNutritionPlan[key] ?? [];
        const distKm = (leg.distance / 1000).toFixed(1);
        const dPlus = Math.round(leg.elevGain);
        const dMinus = Math.round(leg.elevLoss);
        const duration = leg.time > 0 ? formatDuration(leg.time) : "—";

        return (
          <details key={key} open className="group py-3 first:pt-0 last:pb-0">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-1 select-none">
              <span className="text-[11px] text-gray-600 transition-transform group-open:rotate-90">
                ▶
              </span>
              <span className="font-medium text-gray-300 text-sm">
                {leg.fromName}
                <span className="mx-1.5 text-gray-600">→</span>
                {leg.toName}
              </span>
              <span className="ml-auto flex items-center gap-2 text-[11px] text-gray-500">
                <span>{distKm} km</span>
                {dPlus > 0 && <span className="text-green-600">D+ {dPlus}m</span>}
                {dMinus > 0 && <span className="text-red-700">D- {dMinus}m</span>}
                {leg.time > 0 && <span>~{duration}</span>}
                {assignments.length > 0 && (
                  <span className="rounded-full bg-teal-900/40 px-1.5 py-0.5 text-[10px] text-teal-400">
                    {assignments.reduce((s, a) => s + a.quantity, 0)} aliments
                  </span>
                )}
              </span>
            </summary>
            <div className="mt-3 pl-4">
              <LegNutritionPanel
                assignments={assignments}
                carbsPerHour={carbsPerHour}
                foodLibrary={foodLibrary}
                legTime={leg.time}
                onAddFood={(id) => onAddFood(i, id)}
                onOpenLibrary={onOpenLibrary ?? (() => {})}
                onRemoveFood={(id) => onRemoveFood(i, id)}
                sodiumPerHour={sodiumPerHour}
                waterPerHour={waterPerHour}
              />
            </div>
          </details>
        );
      })}
    </div>
  );
}
