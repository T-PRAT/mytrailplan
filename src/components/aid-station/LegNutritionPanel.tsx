import { useState } from 'react';
import type { FoodItem, LegFoodAssignment } from '../../types';
import { computeLegNutrition } from './nutrition-utils';

interface Props {
  legTime: number;
  assignments: LegFoodAssignment[];
  foodLibrary: FoodItem[];
  carbsPerHour: number;
  waterPerHour: number;
  sodiumPerHour: number;
  caffeinePerHour: number;
  onAddFood: (foodItemId: string) => void;
  onRemoveFood: (foodItemId: string) => void;
}

const BILAN_ROWS = [
  { key: 'carbs',  label: 'Gluc.',  unit: 'g',  color: 'text-amber-400',  bg: 'bg-amber-900/30',  border: 'border-amber-700/40'  },
  { key: 'water',  label: 'Eau',    unit: 'mL', color: 'text-sky-400',    bg: 'bg-sky-900/30',    border: 'border-sky-700/40'    },
  { key: 'sodium',   label: 'Na',      unit: 'mg', color: 'text-slate-300',  bg: 'bg-slate-700/30',  border: 'border-slate-500/40'  },
  { key: 'caffeine', label: 'Caféine', unit: 'mg', color: 'text-violet-400', bg: 'bg-violet-900/30', border: 'border-violet-700/40' },
] as const;

function foodIcon(item: FoodItem): string {
  if (item.type === 'flask') return item.hasPowder ? '/food/iso.png' : '/food/water.png';
  if (item.type === 'gel') return '/food/gel.png';
  if (item.type === 'pill') return '/food/pill.png';
  return '/food/bar.png';
}

function FoodCard({ item, qty, onAdd, onRemove }: {
  item: FoodItem;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const icon = foodIcon(item);
  const hasMacros = item.carbsG > 0 || item.sodiumMg > 0 || item.caffeineMg > 0 || item.waterMl > 0;

  return (
    <div
      className="relative flex flex-col items-center gap-1.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Tooltip macros */}
      {hovered && hasMacros && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-gray-900 border border-gray-600 rounded-lg px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-xl flex flex-col gap-0.5">
            <span className="text-gray-300 font-medium text-center">{item.name}</span>
            <div className="flex items-center gap-2 justify-center">
              {item.waterMl > 0 && <span className="text-sky-400">{item.waterMl} mL</span>}
              {item.carbsG > 0 && <span className="text-amber-400">{item.carbsG} g gluc.</span>}
              {item.sodiumMg > 0 && <span className="text-slate-300">{item.sodiumMg} mg Na</span>}
              {item.caffeineMg > 0 && <span className="text-violet-400">{item.caffeineMg} mg caféine</span>}
            </div>
          </div>
          <div className="w-2 h-2 bg-gray-900 border-r border-b border-gray-600 rotate-45 mx-auto -mt-1" />
        </div>
      )}

      {/* Card button */}
      <button
        onClick={onAdd}
        className={[
          'relative w-[68px] h-[68px] rounded-2xl flex items-center justify-center transition-all duration-150',
          qty > 0
            ? 'bg-gray-700 border-2 border-gray-500 shadow-md hover:border-gray-400 hover:scale-105'
            : 'bg-gray-800/80 border-2 border-gray-700 hover:border-gray-500 hover:bg-gray-750 hover:scale-105',
        ].join(' ')}
        title={`Ajouter : ${item.name}`}
      >
        <img src={icon} alt={item.name} className="w-10 h-10 object-contain drop-shadow-sm" />

        {/* Qty badge — cliquable pour retirer */}
        {qty > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="absolute -top-2 -right-2 group min-w-[22px] h-[22px] px-1 bg-teal-500 hover:bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center shadow-lg leading-none transition-colors cursor-pointer"
            title="Retirer un"
          >
            <span className="group-hover:hidden">{qty}</span>
            <span className="hidden group-hover:inline">−</span>
          </button>
        )}
      </button>

      {/* Name */}
      <span className="text-[10px] text-gray-500 text-center w-[72px] leading-tight line-clamp-2 break-words">
        {item.name}
      </span>
    </div>
  );
}

export function LegNutritionPanel({
  legTime, assignments, foodLibrary,
  carbsPerHour, waterPerHour, sodiumPerHour, caffeinePerHour,
  onAddFood, onRemoveFood,
}: Props) {
  const totals = computeLegNutrition(assignments, foodLibrary);
  const hours = legTime / 3600;
  const targets = {
    carbs:    Math.round(hours * carbsPerHour),
    water:    Math.round(hours * waterPerHour),
    sodium:   Math.round(hours * sodiumPerHour),
    caffeine: Math.round(hours * caffeinePerHour),
  };
  const hasAssignments = assignments.length > 0;
  const actual: Record<string, number> = { carbs: totals.carbs, water: totals.water, sodium: totals.sodium, caffeine: totals.caffeine };

  return (
    <div className="flex flex-col gap-3">
      {/* Header + bilan pills */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">Nutrition</span>
        <div className="flex items-center gap-1.5">
          {BILAN_ROWS.map(({ key, label, unit, color, bg, border }) => {
            const val = actual[key];
            const tgt = targets[key as keyof typeof targets];
            const pct = tgt > 0 ? Math.round((val / tgt) * 100) : 0;
            const statusClass = !hasAssignments
              ? `${bg} ${border} ${color}`
              : pct < 75 || pct > 130
                ? 'bg-red-900/30 border-red-700/50 text-red-300'
                : pct < 100 || pct > 115
                  ? 'bg-orange-900/30 border-orange-700/50 text-orange-300'
                  : 'bg-green-900/30 border-green-700/50 text-green-300';
            return (
              <div key={key} className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${statusClass}`}>
                {hasAssignments
                  ? <><span>{pct}%</span><span className="opacity-50">·</span><span className="opacity-75">{val}{unit}</span></>
                  : '—'
                }
                <span className="opacity-60">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {foodLibrary.length === 0 ? (
        <p className="text-xs text-gray-600 italic">
          Ajoutez des aliments dans la bibliothèque ci-dessus pour planifier la nutrition de ce tronçon.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3 pt-1">
          {foodLibrary.map(item => {
            const qty = assignments.find(a => a.foodItemId === item.id)?.quantity ?? 0;
            return (
              <FoodCard
                key={item.id}
                item={item}
                qty={qty}
                onAdd={() => onAddFood(item.id)}
                onRemove={() => onRemoveFood(item.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
