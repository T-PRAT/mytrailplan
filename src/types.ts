export interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;
}

export interface Section {
  distance: number; // meters
  elevationGain: number; // meters
  elevationLoss: number; // meters
  slope: number; // percent, positive = uphill, negative = downhill
}

export interface SlopeBucket {
  label: string;
  minSlope: number;
  maxSlope: number;
  distance: number; // meters
  sectionCount: number;
  percentage: number; // % of total trace
  color: string; // Tailwind bg class
  textColor: string; // Tailwind text class
}

export interface ProfilePoint {
  cumulativeDistance: number; // meters from start
  elevation: number; // meters
}

export interface AnalysisResult {
  sections: Section[];
  profilePoints: ProfilePoint[];
  uphillBuckets: SlopeBucket[];
  downhillBuckets: SlopeBucket[];
  totalDistance: number; // meters
  totalGain: number; // meters
  totalLoss: number; // meters
}

export interface Segment {
  type: 'climb' | 'descent' | 'rolling';
  startIndex: number;      // index in sections array
  endIndex: number;        // index in sections array (inclusive)
  distance: number;        // meters
  elevationChange: number; // meters (positive for climbs, negative for descents)
  startDistance: number;    // cumulative distance from start (meters)
  endDistance: number;
  startElevation: number;
  endElevation: number;
}

export interface GapSectionResult {
  sectionIndex: number;
  distance: number;    // meters
  slope: number;       // percent
  costRatio: number;   // Cr(grade) / Cr(0)
  actualSpeed: number; // m/s
  actualPace: number;  // s/km
  sectionTime: number; // seconds
}

export interface GapSimulationResult {
  sections: GapSectionResult[];
  totalTime: number;         // seconds
  averageActualPace: number; // s/km
  gapPace: number;           // s/km (input)
}

export interface AidStation {
  id: string;                 // crypto.randomUUID()
  distanceFromStart: number;  // meters
  name: string;               // "Ravito 1", "Ravito 2", ...
}

export type FoodItemType = 'flask' | 'gel' | 'bar';

export interface FoodItem {
  id: string;
  type: FoodItemType;
  name: string;
  hasPowder: boolean;  // only meaningful for flask
  carbsG: number;      // g per unit (0 if flask without powder)
  sodiumMg: number;    // mg per unit (0 if flask without powder)
  waterMl: number;     // 500 for flask, 0 for gel/bar
}

export interface LegFoodAssignment {
  foodItemId: string;
  quantity: number;
}

export type LegNutritionPlan = Record<string, LegFoodAssignment[]>;
