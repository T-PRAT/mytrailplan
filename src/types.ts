export interface TrackPoint {
  ele: number;
  lat: number;
  lon: number;
}

export interface Section {
  distance: number; // meters
  elevationGain: number; // meters
  elevationLoss: number; // meters
  slope: number; // percent, positive = uphill, negative = downhill
}

export interface SlopeBucket {
  color: string; // Tailwind bg class
  distance: number; // meters
  label: string;
  maxSlope: number;
  minSlope: number;
  percentage: number; // % of total trace
  sectionCount: number;
  textColor: string; // Tailwind text class
}

export interface ProfilePoint {
  cumulativeDistance: number; // meters from start
  elevation: number; // meters
}

export interface AnalysisResult {
  downhillBuckets: SlopeBucket[];
  profilePoints: ProfilePoint[];
  sections: Section[];
  totalDistance: number; // meters
  totalGain: number; // meters
  totalLoss: number; // meters
  uphillBuckets: SlopeBucket[];
}

export interface Segment {
  distance: number; // meters
  elevationChange: number; // meters (positive for climbs, negative for descents)
  endDistance: number;
  endElevation: number;
  endIndex: number; // index in sections array (inclusive)
  startDistance: number; // cumulative distance from start (meters)
  startElevation: number;
  startIndex: number; // index in sections array
  type: "climb" | "descent" | "rolling";
}

export interface GapSectionResult {
  actualPace: number; // s/km
  actualSpeed: number; // m/s
  costRatio: number; // Cr(grade) / Cr(0)
  distance: number; // meters
  sectionIndex: number;
  sectionTime: number; // seconds
  slope: number; // percent
}

export interface GapSimulationResult {
  averageActualPace: number; // s/km
  gapPace: number; // s/km (input)
  sections: GapSectionResult[];
  totalTime: number; // seconds
}

export interface AidStation {
  distanceFromStart: number; // meters
  id: string; // crypto.randomUUID()
  name: string; // "Ravito 1", "Ravito 2", ...
}

export type FoodItemType = "flask" | "gel" | "bar" | "pill";

export interface FoodItem {
  caffeineMg: number; // mg per unit (0 if no caffeine)
  carbsG: number; // g per unit (0 if flask without powder)
  favorite?: boolean; // affiché dans la bande favoris
  hasPowder: boolean; // only meaningful for flask
  id: string;
  isCustom?: boolean; // false = aliment de base, true/undefined = créé par l'utilisateur
  name: string;
  sodiumMg: number; // mg per unit (0 if flask without powder)
  type: FoodItemType;
  waterMl: number; // 500 for flask, 0 for gel/bar
}

export interface LegFoodAssignment {
  foodItemId: string;
  quantity: number;
}

export type LegNutritionPlan = Record<string, LegFoodAssignment[]>;

export interface PlacedFoodItem {
  distanceFromStart: number; // mètres — position absolue sur le parcours
  foodItemId: string; // ref vers FoodItem.id
  id: string; // crypto.randomUUID()
}

export type NutritionPlacements = PlacedFoodItem[];

export interface HourlyTargets {
  carbsPerHour: number;
  sodiumPerHour: number;
  waterPerHour: number;
}

export interface PaceSettings {
  durationInput: string;
  mode: "vap" | "duration";
  sliderPace: number;
}

export interface NutritionState {
  aidStations: AidStation[];
  bodyWeightKg: number;
  foodLibrary: FoodItem[];
  hourlyTargets: HourlyTargets;
  /** @deprecated use nutritionPlacements */
  legNutritionPlan?: LegNutritionPlan;
  nutritionPlacements: NutritionPlacements;
  paceSettings: PaceSettings;
  timeOverrides: Record<string, number>;
}

export interface StoredProject extends NutritionState {
  createdAt: number;
  filename: string;
  gpxText: string;
  id: string;
  name: string;
  updatedAt: number;
}

export interface ProjectMeta {
  createdAt: number;
  filename: string;
  id: string;
  name: string;
  updatedAt: number;
}
