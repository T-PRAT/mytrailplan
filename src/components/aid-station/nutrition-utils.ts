import type {
  AidStation,
  FoodItem,
  LegFoodAssignment,
  LegNutritionPlan,
  PlacedFoodItem,
} from "../../types";

export function computeLegBoundaries(
  aidStations: AidStation[],
  totalDistance: number
): { boundaries: number[]; sorted: AidStation[] } {
  const sorted = [...aidStations].sort(
    (a, b) => a.distanceFromStart - b.distanceFromStart
  );
  const boundaries = [
    0,
    ...sorted.map((s) => s.distanceFromStart),
    totalDistance,
  ];
  return { boundaries, sorted };
}

export function foodIconSrc(item: FoodItem): string {
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

export function getDefaultFoodLibrary(): FoodItem[] {
  return [
    {
      id: crypto.randomUUID(),
      type: "flask",
      name: "Flasque eau",
      hasPowder: false,
      carbsG: 0,
      sodiumMg: 0,
      caffeineMg: 0,
      waterMl: 500,
      favorite: false,
      isCustom: false,
    },
    {
      id: crypto.randomUUID(),
      type: "flask",
      name: "Flasque isotonique",
      hasPowder: true,
      carbsG: 45,
      sodiumMg: 460,
      caffeineMg: 0,
      waterMl: 500,
      favorite: false,
      isCustom: false,
    },
    {
      id: crypto.randomUUID(),
      type: "gel",
      name: "Gel classique",
      hasPowder: false,
      carbsG: 45,
      sodiumMg: 460,
      caffeineMg: 0,
      waterMl: 0,
      favorite: false,
      isCustom: false,
    },
    {
      id: crypto.randomUUID(),
      type: "bar",
      name: "Barre énergie",
      hasPowder: false,
      carbsG: 28,
      sodiumMg: 200,
      caffeineMg: 0,
      waterMl: 0,
      favorite: false,
      isCustom: false,
    },
    {
      id: crypto.randomUUID(),
      type: "pill",
      name: "Comprimé caféine",
      hasPowder: false,
      carbsG: 0,
      sodiumMg: 0,
      caffeineMg: 50,
      waterMl: 0,
      favorite: false,
      isCustom: false,
    },
  ];
}

export function computeLegNutrition(
  assignments: LegFoodAssignment[],
  foodLibrary: FoodItem[]
): { carbs: number; water: number; sodium: number; caffeine: number } {
  let carbs = 0,
    water = 0,
    sodium = 0,
    caffeine = 0;
  for (const a of assignments) {
    const item = foodLibrary.find((f) => f.id === a.foodItemId);
    if (!item) {
      continue;
    }
    carbs += item.carbsG * a.quantity;
    water += item.waterMl * a.quantity;
    sodium += item.sodiumMg * a.quantity;
    caffeine += item.caffeineMg * a.quantity;
  }
  return {
    carbs: Math.round(carbs),
    water: Math.round(water),
    sodium: Math.round(sodium),
    caffeine: Math.round(caffeine),
  };
}

export function computeNutritionFromPlacements(
  placements: PlacedFoodItem[],
  foodLibrary: FoodItem[]
): { carbs: number; water: number; sodium: number; caffeine: number } {
  let carbs = 0,
    water = 0,
    sodium = 0,
    caffeine = 0;
  for (const p of placements) {
    const item = foodLibrary.find((f) => f.id === p.foodItemId);
    if (!item) {
      continue;
    }
    carbs += item.carbsG;
    water += item.waterMl;
    sodium += item.sodiumMg;
    caffeine += item.caffeineMg;
  }
  return {
    carbs: Math.round(carbs),
    water: Math.round(water),
    sodium: Math.round(sodium),
    caffeine: Math.round(caffeine),
  };
}

export function migrateLegPlanToPlacements(
  legNutritionPlan: LegNutritionPlan,
  aidStations: AidStation[],
  totalDistance: number
): PlacedFoodItem[] {
  const { boundaries, sorted } = computeLegBoundaries(
    aidStations,
    totalDistance
  );

  const placements: PlacedFoodItem[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const fromDist = boundaries[i];
    const toDist = boundaries[i + 1];
    const key = i === 0 ? "depart" : (sorted[i - 1]?.id ?? `leg_${i}`);
    const assignments = legNutritionPlan[key] ?? [];

    for (const a of assignments) {
      const qty = a.quantity;
      for (let q = 0; q < qty; q++) {
        // Répartir uniformément dans le tronçon
        const fraction = qty === 1 ? 0.5 : (q + 1) / (qty + 1);
        placements.push({
          id: crypto.randomUUID(),
          foodItemId: a.foodItemId,
          distanceFromStart: fromDist + fraction * (toDist - fromDist),
        });
      }
    }
  }

  return placements;
}

export function migratePlacementsToLegPlan(
  nutritionPlacements: PlacedFoodItem[],
  aidStations: AidStation[],
  totalDistance: number
): LegNutritionPlan {
  const { boundaries, sorted } = computeLegBoundaries(
    aidStations,
    totalDistance
  );

  const plan: LegNutritionPlan = {};

  for (let i = 0; i < boundaries.length - 1; i++) {
    const fromDist = boundaries[i];
    const toDist = boundaries[i + 1];
    const key = i === 0 ? "depart" : (sorted[i - 1]?.id ?? `leg_${i}`);

    const legPlacements = nutritionPlacements.filter(
      (p) => p.distanceFromStart >= fromDist && p.distanceFromStart < toDist
    );

    const countByFood: Record<string, number> = {};
    for (const p of legPlacements) {
      countByFood[p.foodItemId] = (countByFood[p.foodItemId] ?? 0) + 1;
    }

    const assignments: LegFoodAssignment[] = Object.entries(countByFood).map(
      ([foodItemId, quantity]) => ({ foodItemId, quantity })
    );

    if (assignments.length > 0) {
      plan[key] = assignments;
    }
  }

  return plan;
}

// ── Pharmacocinétique de la caféine ──────────────────────────────────────────

/** Constante d'absorption : pic atteint en ~45 min */
export const CAFFEINE_KA = 4.6; // /h

/** Constante d'élimination : demi-vie de 5h */
export const CAFFEINE_KE = Math.LN2 / 5; // /h

export interface CaffeineIntake {
  /** Dose en mg */
  doseMg: number;
  /** Heures depuis le départ de la course */
  timeH: number;
}

export interface CaffeineTimelinePoint {
  concentrationMg: number;
  timeH: number;
}

/** Équation de Bateman pour une dose unique, dtH heures après la prise. */
function singleDoseConcentration(doseMg: number, dtH: number): number {
  if (dtH <= 0 || doseMg <= 0) {
    return 0;
  }
  return (
    doseMg *
    (CAFFEINE_KA / (CAFFEINE_KA - CAFFEINE_KE)) *
    (Math.exp(-CAFFEINE_KE * dtH) - Math.exp(-CAFFEINE_KA * dtH))
  );
}

/**
 * Calcule la concentration de caféine dans le corps au fil du temps.
 * Applique le principe de superposition pour les doses multiples.
 */
export function computeCaffeineTimeline(
  intakes: CaffeineIntake[],
  totalTimeH: number,
  resolution = 200
): CaffeineTimelinePoint[] {
  const active = intakes.filter((i) => i.doseMg > 0);
  if (active.length === 0 || totalTimeH <= 0) {
    return [];
  }
  const points: CaffeineTimelinePoint[] = [];
  for (let i = 0; i <= resolution; i++) {
    const timeH = (i / resolution) * totalTimeH;
    let concentration = 0;
    for (const intake of active) {
      concentration += singleDoseConcentration(
        intake.doseMg,
        timeH - intake.timeH
      );
    }
    points.push({ timeH, concentrationMg: concentration });
  }
  return points;
}
