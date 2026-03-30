import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import type { FoodItem, FoodItemType, LegNutritionPlan } from '../../types';
import { Input } from '@/components/ui/input';
import { NumberStepper } from '@/components/ui/number-stepper';

interface Props {
  foodLibrary: FoodItem[];
  setFoodLibrary: (fn: (prev: FoodItem[]) => FoodItem[]) => void;
  legNutritionPlan: LegNutritionPlan;
  setLegNutritionPlan: (fn: (prev: LegNutritionPlan) => LegNutritionPlan) => void;
}

const TYPE_CONFIG: { type: FoodItemType; label: string; icon: string }[] = [
  { type: 'flask', label: 'Flasque 500 mL', icon: '/food/water.png' },
  { type: 'gel',   label: 'Gel',            icon: '/food/gel.png'   },
  { type: 'bar',   label: 'Barre',          icon: '/food/bar.png'   },
  { type: 'pill',  label: 'Comprimé',       icon: '/food/pill.png'  },
];

function foodIcon(item: FoodItem): string {
  if (item.type === 'flask') return item.hasPowder ? '/food/iso.png' : '/food/water.png';
  if (item.type === 'gel') return '/food/gel.png';
  if (item.type === 'bar') return '/food/bar.png';
  return '/food/pill.png';
}

function MacroBadges({ item }: { item: FoodItem }) {
  const parts: { label: string; color: string }[] = [];
  if (item.carbsG > 0) parts.push({ label: `${item.carbsG}g gluc.`, color: 'text-amber-400' });
  if (item.sodiumMg > 0) parts.push({ label: `${item.sodiumMg}mg Na`, color: 'text-slate-300' });
  if (item.caffeineMg > 0) parts.push({ label: `${item.caffeineMg}mg caf.`, color: 'text-violet-400' });
  if (item.waterMl > 0) parts.push({ label: `${item.waterMl}mL`, color: 'text-sky-400' });

  if (parts.length === 0) return <span className="text-[10px] text-gray-600 italic">aucun macro</span>;

  return (
    <span className="flex items-center gap-1 flex-wrap">
      {parts.map((p, i) => (
        <span key={p.label} className={`text-[10px] ${p.color}`}>
          {p.label}{i < parts.length - 1 && <span className="text-gray-600 ml-1">·</span>}
        </span>
      ))}
    </span>
  );
}

function ItemCard({
  item,
  isEditing,
  onToggleEdit,
  onUpdate,
  onTogglePowder,
  onDelete,
}: {
  item: FoodItem;
  isEditing: boolean;
  onToggleEdit: () => void;
  onUpdate: (patch: Partial<FoodItem>) => void;
  onTogglePowder: (v: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col bg-gray-900/60 border border-gray-700/60 rounded-xl overflow-hidden">
      {/* Compact read row */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-800/40 transition-colors"
        onClick={onToggleEdit}
      >
        <img src={foodIcon(item)} alt="" className="w-10 h-10 object-contain shrink-0" />
        <div className="flex flex-col flex-1 min-w-0 gap-0.5">
          <span className="text-sm text-gray-200 truncate leading-tight">{item.name || <span className="italic text-gray-500">Sans nom</span>}</span>
          <MacroBadges item={item} />
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="text-gray-600 hover:text-red-400 transition-colors shrink-0 p-1"
          title="Supprimer"
        >
          <X size={13} />
        </button>
      </div>

      {/* Inline edit area */}
      {isEditing && (
        <div className="flex flex-col gap-2.5 px-3 pb-3 pt-1 border-t border-gray-700/50 bg-gray-900/40">
          <Input
            value={item.name}
            onChange={e => onUpdate({ name: e.target.value })}
            className="bg-gray-700 border-0 h-auto py-1.5 text-sm text-gray-200 focus-visible:ring-1 focus-visible:ring-gray-500"
            placeholder="Nom de l'aliment"
          />

          {item.type === 'flask' && (
            <div className="flex rounded-lg border border-gray-700 overflow-hidden text-xs self-start">
              <button
                onClick={() => !item.hasPowder || onTogglePowder(false)}
                className={[
                  'px-3 py-1.5 transition-colors flex items-center gap-1.5',
                  !item.hasPowder ? 'bg-sky-900/50 text-sky-300 font-medium' : 'text-gray-500 hover:text-gray-300',
                ].join(' ')}
              >
                <img src="/food/water.png" alt="" className="w-4 h-4 object-contain" />
                Eau pure
              </button>
              <button
                onClick={() => item.hasPowder || onTogglePowder(true)}
                className={[
                  'px-3 py-1.5 border-l border-gray-700 transition-colors flex items-center gap-1.5',
                  item.hasPowder ? 'bg-amber-900/40 text-amber-300 font-medium' : 'text-gray-500 hover:text-gray-300',
                ].join(' ')}
              >
                <img src="/food/iso.png" alt="" className="w-4 h-4 object-contain" />
                Poudre
              </button>
            </div>
          )}

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
              <NumberStepper
                value={item.caffeineMg}
                onChange={n => onUpdate({ caffeineMg: n })}
                min={0} max={200} step={5} unit="mg caféine"
                inputClassName="w-12"
                className="bg-gray-700 border-gray-600/50"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FoodLibrary({ foodLibrary, setFoodLibrary, legNutritionPlan: _legNutritionPlan, setLegNutritionPlan }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTypePicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowTypePicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTypePicker]);

  function addItem(type: FoodItemType) {
    const newItem: FoodItem = {
      id: crypto.randomUUID(),
      type,
      name: type === 'flask' ? 'Flasque' : type === 'gel' ? 'Gel' : type === 'bar' ? 'Barre' : 'Comprimé',
      hasPowder: false,
      carbsG: 0,
      sodiumMg: 0,
      caffeineMg: 0,
      waterMl: type === 'flask' ? 500 : 0,
    };
    setFoodLibrary(prev => [...prev, newItem]);
    setEditingId(newItem.id);
    setShowTypePicker(false);
  }

  function deleteItem(id: string) {
    if (editingId === id) setEditingId(null);
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
        ? { ...item, hasPowder, carbsG: hasPowder ? item.carbsG : 0, sodiumMg: hasPowder ? item.sodiumMg : 0, caffeineMg: hasPowder ? item.caffeineMg : 0 }
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
        <div className="flex flex-col gap-2 bg-gray-800/30 px-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            {foodLibrary.map(item => (
              <div key={item.id} className={editingId === item.id ? 'col-span-2' : ''}>
                <ItemCard
                  item={item}
                  isEditing={editingId === item.id}
                  onToggleEdit={() => setEditingId(prev => prev === item.id ? null : item.id)}
                  onUpdate={patch => updateItem(item.id, patch)}
                  onTogglePowder={v => togglePowder(item.id, v)}
                  onDelete={() => deleteItem(item.id)}
                />
              </div>
            ))}
          </div>

          {/* Add button */}
          <div className="relative self-start" ref={pickerRef}>
            <button
              onClick={() => setShowTypePicker(v => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors py-1 px-2 rounded-lg hover:bg-gray-700"
            >
              <Plus size={13} />
              Ajouter un aliment
            </button>

            {showTypePicker && (
              <div className="absolute left-0 top-full mt-1 z-20 bg-gray-800 border border-gray-700 rounded-xl shadow-lg overflow-hidden flex flex-col min-w-44">
                {TYPE_CONFIG.map(({ type, label, icon }) => (
                  <button
                    key={type}
                    onClick={() => addItem(type)}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-gray-100 transition-colors text-left"
                  >
                    <img src={icon} alt="" className="w-5 h-5 object-contain" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
