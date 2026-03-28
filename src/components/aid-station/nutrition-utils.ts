import type { FoodItem, LegFoodAssignment } from '../../types';

export function computeLegNutrition(
  assignments: LegFoodAssignment[],
  foodLibrary: FoodItem[],
): { carbs: number; water: number; sodium: number } {
  let carbs = 0, water = 0, sodium = 0;
  for (const a of assignments) {
    const item = foodLibrary.find(f => f.id === a.foodItemId);
    if (!item) continue;
    carbs  += item.carbsG * a.quantity;
    water  += item.waterMl * a.quantity;
    sodium += item.sodiumMg * a.quantity;
  }
  return { carbs: Math.round(carbs), water: Math.round(water), sodium: Math.round(sodium) };
}

const STORAGE_KEY = 'trailslope_food_library';

export function saveFoodLibrary(items: FoodItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* ignore */ }
}

export function loadFoodLibrary(): FoodItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FoodItem[];
  } catch { return []; }
}
