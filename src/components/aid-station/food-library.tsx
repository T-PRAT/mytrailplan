import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Plus,
  Star,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { NumberStepper } from "@/components/ui/number-stepper";
import type { FoodItem, FoodItemType, NutritionPlacements } from "../../types";

interface Props {
  armedFoodId: string | null;
  foodLibrary: FoodItem[];
  nutritionPlacements: NutritionPlacements;
  onArmFood: (id: string) => void;
  setFoodLibrary: (fn: (prev: FoodItem[]) => FoodItem[]) => void;
  setNutritionPlacements: (
    fn: (prev: NutritionPlacements) => NutritionPlacements
  ) => void;
}

const TYPE_CONFIG: { type: FoodItemType; label: string; icon: string }[] = [
  { type: "flask", label: "Flasque 500 mL", icon: "/food/water.png" },
  { type: "gel", label: "Gel", icon: "/food/gel.png" },
  { type: "bar", label: "Barre", icon: "/food/bar.png" },
  { type: "pill", label: "Comprimé", icon: "/food/pill.png" },
];

function foodIcon(item: FoodItem): string {
  if (item.type === "flask") {
    return item.hasPowder ? "/food/iso.png" : "/food/water.png";
  }
  if (item.type === "gel") {
    return "/food/gel.png";
  }
  if (item.type === "bar") {
    return "/food/bar.png";
  }
  return "/food/pill.png";
}

function MacroBadges({ item }: { item: FoodItem }) {
  const parts: { label: string; color: string }[] = [];
  if (item.carbsG > 0) {
    parts.push({ label: `${item.carbsG}g gluc.`, color: "text-amber-400" });
  }
  if (item.sodiumMg > 0) {
    parts.push({ label: `${item.sodiumMg}mg Na`, color: "text-slate-300" });
  }
  if (item.caffeineMg > 0) {
    parts.push({
      label: `${item.caffeineMg}mg caf.`,
      color: "text-violet-400",
    });
  }
  if (item.waterMl > 0) {
    parts.push({ label: `${item.waterMl}mL`, color: "text-sky-400" });
  }

  if (parts.length === 0) {
    return (
      <span className="text-[10px] text-gray-600 italic">aucun macro</span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      {parts.map((p, i) => (
        <span className={`text-[10px] ${p.color}`} key={p.label}>
          {p.label}
          {i < parts.length - 1 && (
            <span className="ml-1 text-gray-600">·</span>
          )}
        </span>
      ))}
    </span>
  );
}

function FavoriteCard({
  item,
  isArmed,
  onArm,
  onRemove,
}: {
  item: FoodItem;
  isArmed: boolean;
  onArm: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group relative flex flex-col items-center gap-1">
      <button
        className={[
          "flex h-[64px] w-[64px] items-center justify-center rounded-xl transition-all duration-150",
          isArmed
            ? "border-2 border-teal-500 bg-teal-900/50 shadow-md"
            : "border-2 border-gray-700 bg-gray-800 hover:scale-105 hover:border-gray-500",
        ].join(" ")}
        onClick={onArm}
        title={`Placer : ${item.name}`}
        type="button"
      >
        <img
          alt=""
          className="h-10 w-10 object-contain drop-shadow-sm"
          height={40}
          src={foodIcon(item)}
          width={40}
        />
      </button>
      <span className="line-clamp-2 w-[68px] break-words text-center text-[10px] text-gray-500 leading-tight">
        {item.name}
      </span>
      <button
        className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-gray-600 bg-gray-900 opacity-0 transition-opacity hover:border-red-500 hover:bg-red-900/50 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Retirer des favoris"
        type="button"
      >
        <X className="text-gray-400" size={10} />
      </button>
    </div>
  );
}

function ItemEditArea({
  item,
  onUpdate,
  onTogglePowder,
}: {
  item: FoodItem;
  onUpdate: (patch: Partial<FoodItem>) => void;
  onTogglePowder: (v: boolean) => void;
}) {
  return (
    <div className="ml-9 flex flex-col gap-2.5 border-gray-700/50 border-l px-2 pt-1 pb-2">
      <Input
        className="h-auto border-0 bg-gray-700 py-1.5 text-gray-200 text-sm focus-visible:ring-1 focus-visible:ring-gray-500"
        onChange={(e) => onUpdate({ name: e.target.value })}
        placeholder="Nom de l'aliment"
        value={item.name}
      />

      {item.type === "flask" && (
        <div className="flex self-start overflow-hidden rounded-lg border border-gray-700 text-xs">
          <button
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 transition-colors",
              item.hasPowder
                ? "text-gray-500 hover:text-gray-300"
                : "bg-sky-900/50 font-medium text-sky-300",
            ].join(" ")}
            onClick={() => !item.hasPowder || onTogglePowder(false)}
            type="button"
          >
            <img
              alt=""
              className="h-4 w-4 object-contain"
              height={16}
              src="/food/water.png"
              width={16}
            />
            Eau pure
          </button>
          <button
            className={[
              "flex items-center gap-1.5 border-gray-700 border-l px-3 py-1.5 transition-colors",
              item.hasPowder
                ? "bg-amber-900/40 font-medium text-amber-300"
                : "text-gray-500 hover:text-gray-300",
            ].join(" ")}
            onClick={() => item.hasPowder || onTogglePowder(true)}
            type="button"
          >
            <img
              alt=""
              className="h-4 w-4 object-contain"
              height={16}
              src="/food/iso.png"
              width={16}
            />
            Poudre
          </button>
        </div>
      )}

      {(item.type !== "flask" || item.hasPowder) && (
        <div className="flex flex-wrap items-center gap-2">
          <NumberStepper
            className="border-gray-600/50 bg-gray-700"
            inputClassName="w-12"
            max={200}
            min={0}
            onChange={(n) => onUpdate({ carbsG: n })}
            step={5}
            unit="g gluc."
            value={item.carbsG}
          />
          <NumberStepper
            className="border-gray-600/50 bg-gray-700"
            inputClassName="w-12"
            max={2000}
            min={0}
            onChange={(n) => onUpdate({ sodiumMg: n })}
            step={50}
            unit="mg Na"
            value={item.sodiumMg}
          />
          <NumberStepper
            className="border-gray-600/50 bg-gray-700"
            inputClassName="w-12"
            max={200}
            min={0}
            onChange={(n) => onUpdate({ caffeineMg: n })}
            step={5}
            unit="mg caféine"
            value={item.caffeineMg}
          />
        </div>
      )}
    </div>
  );
}

function LibraryItemRow({
  item,
  isEditing,
  onToggleEdit,
  onArm,
  onToggleFavorite,
  onUpdate,
  onTogglePowder,
  onDelete,
}: {
  item: FoodItem;
  isEditing: boolean;
  onToggleEdit: () => void;
  onArm: () => void;
  onToggleFavorite: () => void;
  onUpdate: (patch: Partial<FoodItem>) => void;
  onTogglePowder: (v: boolean) => void;
  onDelete: () => void;
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveElementInteractions: draggable list item requires onDragStart; no semantic HTML equivalent
    <div
      className="flex flex-col overflow-hidden rounded-lg"
      draggable
      onDragStart={(e) => e.dataTransfer.setData("foodItemId", item.id)}
    >
      <div className="group flex cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-800/50 active:cursor-grabbing">
        <img
          alt=""
          className="h-7 w-7 shrink-0 object-contain"
          height={28}
          src={foodIcon(item)}
          width={28}
        />
        <button
          className="flex min-w-0 flex-1 cursor-pointer flex-col text-left"
          onClick={onArm}
          type="button"
        >
          <span className="truncate text-gray-200 text-sm leading-tight">
            {item.name || (
              <span className="text-gray-500 italic">Sans nom</span>
            )}
          </span>
          <MacroBadges item={item} />
        </button>
        <button
          className={`shrink-0 p-1 transition-colors ${item.favorite ? "text-amber-400" : "text-gray-600 hover:text-amber-400"}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title={item.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          type="button"
        >
          <Star className={item.favorite ? "fill-amber-400" : ""} size={13} />
        </button>
        <button
          className="shrink-0 p-1 text-gray-600 opacity-0 transition-colors hover:text-red-400 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Supprimer"
          type="button"
        >
          <X size={13} />
        </button>
        <button
          className="shrink-0 p-1 text-gray-600 opacity-0 transition-colors hover:text-gray-300 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onToggleEdit();
          }}
          title={isEditing ? "Réduire" : "Modifier"}
          type="button"
        >
          {isEditing ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
      </div>

      {isEditing && (
        <ItemEditArea
          item={item}
          onTogglePowder={onTogglePowder}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}

export function FoodLibrary({
  foodLibrary,
  setFoodLibrary,
  nutritionPlacements: _nutritionPlacements,
  setNutritionPlacements,
  armedFoodId,
  onArmFood,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [dragOverFavorites, setDragOverFavorites] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  useEffect(() => {
    if (!showTypePicker) {
      return;
    }
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowTypePicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTypePicker]);

  function addItem(type: FoodItemType) {
    const newItem: FoodItem = {
      id: crypto.randomUUID(),
      type,
      name:
        (
          {
            flask: "Flasque",
            gel: "Gel",
            bar: "Barre",
            tablet: "Comprimé",
          } as Record<string, string>
        )[type] ?? "Aliment",
      hasPowder: false,
      carbsG: 0,
      sodiumMg: 0,
      caffeineMg: 0,
      waterMl: type === "flask" ? 500 : 0,
      favorite: false,
      isCustom: true,
    };
    setFoodLibrary((prev) => [...prev, newItem]);
    setEditingId(newItem.id);
    setShowTypePicker(false);
  }

  function deleteItem(id: string) {
    if (editingId === id) {
      setEditingId(null);
    }
    setFoodLibrary((prev) => prev.filter((item) => item.id !== id));
    setNutritionPlacements((prev) => prev.filter((p) => p.foodItemId !== id));
  }

  function updateItem(id: string, patch: Partial<FoodItem>) {
    setFoodLibrary((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function togglePowder(id: string, hasPowder: boolean) {
    setFoodLibrary((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              hasPowder,
              carbsG: hasPowder ? item.carbsG : 0,
              sodiumMg: hasPowder ? item.sodiumMg : 0,
              caffeineMg: hasPowder ? item.caffeineMg : 0,
            }
          : item
      )
    );
  }

  function toggleFavorite(id: string) {
    setFoodLibrary((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, favorite: !item.favorite } : item
      )
    );
  }

  function dropOnFavorites(e: React.DragEvent) {
    e.preventDefault();
    setDragOverFavorites(false);
    const id = e.dataTransfer.getData("foodItemId");
    if (id) {
      setFoodLibrary((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, favorite: true } : item
        )
      );
    }
  }

  const favorites = foodLibrary.filter((f) => f.favorite);
  const baseItems = foodLibrary.filter((f) => f.isCustom === false);
  const customItems = foodLibrary.filter((f) => f.isCustom !== false);

  return (
    <>
      {/* Trigger button */}
      <button
        className="flex h-8 items-center gap-1.5 self-start rounded-lg border border-gray-700 bg-gray-800 px-3 font-medium text-gray-300 text-xs transition-colors hover:bg-gray-700"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <BookOpen size={13} />
        Bibliothèque d'aliments
        {foodLibrary.length > 0 && (
          <span className="rounded-full bg-gray-700 px-1.5 py-0.5 font-medium text-[11px] text-gray-500 leading-none">
            {foodLibrary.length}
          </span>
        )}
      </button>

      {/* Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            aria-label="Fermer la bibliothèque"
            className="absolute inset-0 cursor-default bg-black/60"
            onClick={() => setIsOpen(false)}
            type="button"
          />
          <div className="relative flex h-full w-96 max-w-[92vw] flex-col border-gray-700 border-l bg-gray-900 shadow-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-gray-700 border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <BookOpen className="text-gray-400" size={14} />
                <span className="font-medium text-gray-200 text-sm">
                  Bibliothèque d'aliments
                </span>
              </div>
              <button
                className="p-1 text-gray-500 transition-colors hover:text-gray-300"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X size={15} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex flex-1 flex-col overflow-y-auto">
              {/* ── Favoris ── */}
              {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveElementInteractions: drag-drop zone requires drag event handlers; no semantic HTML equivalent */}
              <div
                className={[
                  "border-gray-700/60 border-b px-4 py-3 transition-colors",
                  dragOverFavorites ? "bg-teal-900/20" : "",
                ].join(" ")}
                onDragLeave={() => setDragOverFavorites(false)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverFavorites(true);
                }}
                onDrop={dropOnFavorites}
              >
                <div className="mb-2.5 flex items-center gap-1.5">
                  <Star className="fill-amber-400 text-amber-400" size={11} />
                  <span className="font-medium text-[11px] text-gray-400 uppercase tracking-wide">
                    Favoris
                  </span>
                </div>

                {favorites.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {favorites.map((item) => (
                      <FavoriteCard
                        isArmed={armedFoodId === item.id}
                        item={item}
                        key={item.id}
                        onArm={() => {
                          onArmFood(item.id);
                          setIsOpen(false);
                        }}
                        onRemove={() => toggleFavorite(item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    className={[
                      "rounded-xl border-2 border-dashed py-4 text-center transition-colors",
                      dragOverFavorites
                        ? "border-teal-500 bg-teal-900/10"
                        : "border-gray-700",
                    ].join(" ")}
                  >
                    <p className="text-gray-600 text-xs">
                      Glissez des aliments ici ou cliquez sur ★
                    </p>
                  </div>
                )}
              </div>

              {/* ── Aliments de base ── */}
              {baseItems.length > 0 && (
                <div className="border-gray-700/60 border-b px-4 py-3">
                  <span className="font-medium text-[11px] text-gray-400 uppercase tracking-wide">
                    Aliments de base
                  </span>
                  <div className="mt-2 flex flex-col gap-0.5">
                    {baseItems.map((item) => (
                      <LibraryItemRow
                        isEditing={editingId === item.id}
                        item={item}
                        key={item.id}
                        onArm={() => {
                          onArmFood(item.id);
                          setIsOpen(false);
                        }}
                        onDelete={() => deleteItem(item.id)}
                        onToggleEdit={() =>
                          setEditingId((prev) =>
                            prev === item.id ? null : item.id
                          )
                        }
                        onToggleFavorite={() => toggleFavorite(item.id)}
                        onTogglePowder={(v) => togglePowder(item.id, v)}
                        onUpdate={(patch) => updateItem(item.id, patch)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Mes aliments ── */}
              <div className="px-4 py-3">
                <span className="font-medium text-[11px] text-gray-400 uppercase tracking-wide">
                  Mes aliments
                </span>
                <div className="mt-2 flex flex-col gap-0.5">
                  {customItems.map((item) => (
                    <LibraryItemRow
                      isEditing={editingId === item.id}
                      item={item}
                      key={item.id}
                      onArm={() => {
                        onArmFood(item.id);
                        setIsOpen(false);
                      }}
                      onDelete={() => deleteItem(item.id)}
                      onToggleEdit={() =>
                        setEditingId((prev) =>
                          prev === item.id ? null : item.id
                        )
                      }
                      onToggleFavorite={() => toggleFavorite(item.id)}
                      onTogglePowder={(v) => togglePowder(item.id, v)}
                      onUpdate={(patch) => updateItem(item.id, patch)}
                    />
                  ))}

                  {customItems.length === 0 && (
                    <p className="py-1 text-gray-600 text-xs italic">
                      Aucun aliment personnalisé
                    </p>
                  )}

                  {/* Ajouter un aliment */}
                  <div className="relative mt-2 self-start" ref={pickerRef}>
                    <button
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-gray-500 text-xs transition-colors hover:bg-gray-700 hover:text-gray-200"
                      onClick={() => setShowTypePicker((v) => !v)}
                      type="button"
                    >
                      <Plus size={13} />
                      Ajouter un aliment
                    </button>

                    {showTypePicker && (
                      <div className="absolute top-full left-0 z-20 mt-1 flex min-w-44 flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-800 shadow-lg">
                        {TYPE_CONFIG.map(({ type, label, icon }) => (
                          <button
                            className="flex items-center gap-2.5 px-3 py-2 text-left text-gray-300 text-sm transition-colors hover:bg-gray-700 hover:text-gray-100"
                            key={type}
                            onClick={() => addItem(type)}
                            type="button"
                          >
                            <img
                              alt=""
                              className="h-5 w-5 object-contain"
                              height={20}
                              src={icon}
                              width={20}
                            />
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
