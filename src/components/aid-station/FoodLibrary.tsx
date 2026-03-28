import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import type { FoodItem, FoodItemType, LegNutritionPlan } from '../../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberStepper } from '@/components/ui/number-stepper';

interface Props {
  foodLibrary: FoodItem[];
  setFoodLibrary: (fn: (prev: FoodItem[]) => FoodItem[]) => void;
  legNutritionPlan: LegNutritionPlan;
  setLegNutritionPlan: (fn: (prev: LegNutritionPlan) => LegNutritionPlan) => void;
}

const TYPE_CONFIG: { type: FoodItemType; label: string; addLabel: string; icon: string }[] = [
  { type: 'flask', label: 'Flasques 500 mL', addLabel: 'Ajouter une flasque', icon: '/food/water.png' },
  { type: 'gel',   label: 'Gels',            addLabel: 'Ajouter un gel',      icon: '/food/gel.png'   },
  { type: 'bar',   label: 'Barres',          addLabel: 'Ajouter une barre',   icon: '/food/bar.png'   },
];

function flaskIcon(hasPowder: boolean) {
  return hasPowder ? '/food/iso.png' : '/food/water.png';
}

function ItemCard({
  item,
  onUpdate,
  onTogglePowder,
  onDelete,
}: {
  item: FoodItem;
  onUpdate: (patch: Partial<FoodItem>) => void;
  onTogglePowder: (v: boolean) => void;
  onDelete: () => void;
}) {
  const icon = item.type === 'flask' ? flaskIcon(item.hasPowder) : (item.type === 'gel' ? '/food/gel.png' : '/food/bar.png');

  return (
    <div className="flex flex-col gap-2 bg-gray-900/60 border border-gray-700/60 rounded-xl p-3">
      {/* Icon + name row */}
      <div className="flex items-center gap-3">
        <img src={icon} alt="" className="w-10 h-10 object-contain shrink-0" />
        <Input
          value={item.name}
          onChange={e => onUpdate({ name: e.target.value })}
          className="flex-1 bg-gray-700 border-0 h-auto py-1.5 text-sm text-gray-200 focus-visible:ring-1 focus-visible:ring-gray-500"
        />
        <button
          onClick={onDelete}
          className="text-gray-600 hover:text-red-400 transition-colors shrink-0"
          title="Supprimer"
        >
          <X size={14} />
        </button>
      </div>

      {/* Powder toggle (flask only) */}
      {item.type === 'flask' && (
        <div className="flex rounded-lg border border-gray-700 overflow-hidden text-xs self-start">
          <button
            onClick={() => !item.hasPowder || onTogglePowder(false)}
            className={[
              'px-3 py-1.5 transition-colors flex items-center gap-1.5',
              !item.hasPowder
                ? 'bg-sky-900/50 text-sky-300 font-medium'
                : 'text-gray-500 hover:text-gray-300',
            ].join(' ')}
          >
            <img src="/food/water.png" alt="" className="w-4 h-4 object-contain" />
            Eau pure
          </button>
          <button
            onClick={() => item.hasPowder || onTogglePowder(true)}
            className={[
              'px-3 py-1.5 border-l border-gray-700 transition-colors flex items-center gap-1.5',
              item.hasPowder
                ? 'bg-amber-900/40 text-amber-300 font-medium'
                : 'text-gray-500 hover:text-gray-300',
            ].join(' ')}
          >
            <img src="/food/iso.png" alt="" className="w-4 h-4 object-contain" />
            Poudre
          </button>
        </div>
      )}

      {/* Macros (flask+powder or gel/bar) */}
      {(item.type !== 'flask' || item.hasPowder) && (
        <div className="flex items-center gap-2 flex-wrap">
          <NumberStepper
            value={item.carbsG}
            onChange={n => onUpdate({ carbsG: n })}
            min={0} max={200} step={5} unit="g gluc."
            inputClassName="w-12"
            className="bg-gray-700 border-gray-600/50"
          />
          <NumberStepper
            value={item.sodiumMg}
            onChange={n => onUpdate({ sodiumMg: n })}
            min={0} max={2000} step={50} unit="mg Na"
            inputClassName="w-12"
            className="bg-gray-700 border-gray-600/50"
          />
        </div>
      )}
    </div>
  );
}

export function FoodLibrary({ foodLibrary, setFoodLibrary, legNutritionPlan: _legNutritionPlan, setLegNutritionPlan }: Props) {
  const [expanded, setExpanded] = useState(false);

  function addItem(type: FoodItemType) {
    const newItem: FoodItem = {
      id: crypto.randomUUID(),
      type,
      name: type === 'flask' ? 'Flasque' : type === 'gel' ? 'Gel' : 'Barre',
      hasPowder: false,
      carbsG: 0,
      sodiumMg: 0,
      waterMl: type === 'flask' ? 500 : 0,
    };
    setFoodLibrary(prev => [...prev, newItem]);
  }

  function deleteItem(id: string) {
    setFoodLibrary(prev => prev.filter(item => item.id !== id));
    setLegNutritionPlan(prev => {
      const next: LegNutritionPlan = {};
      for (const [key, assignments] of Object.entries(prev)) {
        const filtered = assignments.filter(a => a.foodItemId !== id);
        if (filtered.length > 0) next[key] = filtered;
      }
      return next;
    });
  }

  function updateItem(id: string, patch: Partial<FoodItem>) {
    setFoodLibrary(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function togglePowder(id: string, hasPowder: boolean) {
    setFoodLibrary(prev => prev.map(item =>
      item.id === id
        ? { ...item, hasPowder, carbsG: hasPowder ? item.carbsG : 0, sodiumMg: hasPowder ? item.sodiumMg : 0 }
        : item,
    ));
  }

  return (
    <div className="flex flex-col rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-800/80 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 opacity-90">
            {['/food/water.png', '/food/iso.png', '/food/gel.png', '/food/bar.png'].map(src => (
              <img key={src} src={src} alt="" className="w-6 h-6 object-contain" />
            ))}
          </div>
          <span className="text-sm font-medium text-gray-200">Bibliothèque aliments</span>
          {foodLibrary.length > 0 && (
            <span className="text-[11px] text-gray-500 bg-gray-700 rounded-full px-2 py-0.5 font-medium">
              {foodLibrary.length}
            </span>
          )}
        </div>
        {expanded ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
      </button>

      {expanded && (
        <div className="flex flex-col divide-y divide-gray-700/60 bg-gray-800/30">
          {TYPE_CONFIG.map(({ type, label, addLabel, icon }) => {
            const items = foodLibrary.filter(item => item.type === type);
            return (
              <div key={type} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-center gap-2">
                  <img src={icon} alt="" className="w-5 h-5 object-contain opacity-80" />
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">{label}</span>
                </div>

                {items.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {items.map(item => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onUpdate={patch => updateItem(item.id, patch)}
                        onTogglePowder={v => togglePowder(item.id, v)}
                        onDelete={() => deleteItem(item.id)}
                      />
                    ))}
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addItem(type)}
                  className="w-fit h-auto py-1 px-2 text-xs text-gray-500 hover:text-gray-200 hover:bg-gray-700"
                >
                  <Plus size={12} className="mr-1" />
                  {addLabel}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
