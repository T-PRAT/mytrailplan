import type { FoodItem, LegFoodAssignment } from '../../types';

export function getDefaultFoodLibrary(): FoodItem[] {
  return [
    { id: crypto.randomUUID(), type: 'flask', name: 'Flasque eau', hasPowder: false, carbsG: 0, sodiumMg: 0, caffeineMg: 0, waterMl: 500 },
    { id: crypto.randomUUID(), type: 'flask', name: 'Flasque isotonique', hasPowder: true, carbsG: 45, sodiumMg: 460, caffeineMg: 0, waterMl: 500 },
    { id: crypto.randomUUID(), type: 'gel', name: 'Gel classique', hasPowder: false, carbsG: 45, sodiumMg: 460, caffeineMg: 0, waterMl: 0 },
    { id: crypto.randomUUID(), type: 'bar', name: 'Barre énergie', hasPowder: false, carbsG: 28, sodiumMg: 200, caffeineMg: 0, waterMl: 0 },
    { id: crypto.randomUUID(), type: 'pill', name: 'Comprimé caféine', hasPowder: false, carbsG: 0, sodiumMg: 0, caffeineMg: 50, waterMl: 0 },
  ];
}

export function computeLegNutrition(
  assignments: LegFoodAssignment[],
  foodLibrary: FoodItem[],
): { carbs: number; water: number; sodium: number; caffeine: number } {
  let carbs = 0, water = 0, sodium = 0, caffeine = 0;
  for (const a of assignments) {
    const item = foodLibrary.find(f => f.id === a.foodItemId);
    if (!item) continue;
    carbs    += item.carbsG * a.quantity;
    water    += item.waterMl * a.quantity;
    sodium   += item.sodiumMg * a.quantity;
    caffeine += item.caffeineMg * a.quantity;
  }
  return { carbs: Math.round(carbs), water: Math.round(water), sodium: Math.round(sodium), caffeine: Math.round(caffeine) };
}

