import type { TrackPoint, Section, SlopeBucket, AnalysisResult, ProfilePoint } from '../types';
import { haversine } from './haversine';
import { UPHILL_COLORS, DOWNHILL_COLORS } from './colors';

const SECTION_LENGTH = 100; // meters
const MIN_TAIL_LENGTH = 10; // meters — discard shorter trailing sections

// Lissage gaussien des altitudes pour réduire le bruit GPS (±3-5m vertical)
// Rayon de 5 points, sigma=2 — conserve les vraies variations tout en éliminant le bruit
const SMOOTH_RADIUS = 5;
const SMOOTH_SIGMA = 2;

function smoothElevations(points: TrackPoint[]): TrackPoint[] {
  const kernel: number[] = [];
  for (let i = -SMOOTH_RADIUS; i <= SMOOTH_RADIUS; i++) {
    kernel.push(Math.exp(-(i * i) / (2 * SMOOTH_SIGMA * SMOOTH_SIGMA)));
  }
  const kernelSum = kernel.reduce((s, w) => s + w, 0);

  return points.map((pt, idx) => {
    let weightedEle = 0;
    for (let k = 0; k < kernel.length; k++) {
      const j = Math.min(Math.max(idx + k - SMOOTH_RADIUS, 0), points.length - 1);
      weightedEle += kernel[k] * points[j].ele;
    }
    return { ...pt, ele: weightedEle / kernelSum };
  });
}

const BUCKETS = [
  { label: '0–5%',   min: 0,  max: 5 },
  { label: '5–10%',  min: 5,  max: 10 },
  { label: '10–20%', min: 10, max: 20 },
  { label: '20–30%', min: 20, max: 30 },
  { label: '30%+',   min: 30, max: Infinity },
];

function makeBuckets(colors: typeof UPHILL_COLORS): SlopeBucket[] {
  return BUCKETS.map((b, i) => ({
    label: b.label,
    minSlope: b.min,
    maxSlope: b.max,
    distance: 0,
    sectionCount: 0,
    percentage: 0,
    color: colors[i].bg,
    textColor: colors[i].text,
  }));
}

function bucketIndex(absSlope: number): number {
  for (let i = 0; i < BUCKETS.length; i++) {
    if (absSlope < BUCKETS[i].max) return i;
  }
  return BUCKETS.length - 1;
}

export function analyze(rawPoints: TrackPoint[]): AnalysisResult {
  const points = smoothElevations(rawPoints);
  const sections: Section[] = [];
  const profilePoints: ProfilePoint[] = [{ cumulativeDistance: 0, elevation: points[0].ele }];
  let accDist = 0;
  let accGain = 0;
  let accLoss = 0;
  let totalCumulativeDist = 0;
  let sectionStartEle = points[0].ele;

  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    const dEle = points[i].ele - points[i - 1].ele;
    accDist += d;
    if (dEle > 0) accGain += dEle;
    else accLoss += Math.abs(dEle);

    if (accDist >= SECTION_LENGTH || i === points.length - 1) {
      // Finalize section only if long enough (or last section above min)
      if (accDist >= MIN_TAIL_LENGTH || i < points.length - 1) {
        const netEle = points[i].ele - sectionStartEle;
        const slope = (netEle / accDist) * 100;
        sections.push({ distance: accDist, elevationGain: accGain, elevationLoss: accLoss, slope });
        totalCumulativeDist += accDist;
        profilePoints.push({ cumulativeDistance: totalCumulativeDist, elevation: points[i].ele });
      }
      // Reset accumulators
      accDist = 0;
      accGain = 0;
      accLoss = 0;
      sectionStartEle = points[i].ele;
    }
  }

  const totalDistance = sections.reduce((s, sec) => s + sec.distance, 0);
  const totalGain = sections.reduce((s, sec) => s + sec.elevationGain, 0);
  const totalLoss = sections.reduce((s, sec) => s + sec.elevationLoss, 0);

  const uphillBuckets = makeBuckets(UPHILL_COLORS);
  const downhillBuckets = makeBuckets(DOWNHILL_COLORS);

  for (const sec of sections) {
    const idx = bucketIndex(Math.abs(sec.slope));
    if (sec.slope >= 0) {
      uphillBuckets[idx].distance += sec.distance;
      uphillBuckets[idx].sectionCount++;
    } else {
      downhillBuckets[idx].distance += sec.distance;
      downhillBuckets[idx].sectionCount++;
    }
  }

  // Compute percentages
  for (const b of [...uphillBuckets, ...downhillBuckets]) {
    b.percentage = totalDistance > 0 ? (b.distance / totalDistance) * 100 : 0;
  }

  return { sections, profilePoints, uphillBuckets, downhillBuckets, totalDistance, totalGain, totalLoss };
}

export function classifyIntoBuckets(
  sections: ReturnType<typeof analyze>['sections'],
  thresholds: number[],
  totalDistance: number,
  uphillHexColors: string[],
  downhillHexColors: string[],
): { uphillBuckets: import('../types').SlopeBucket[]; downhillBuckets: import('../types').SlopeBucket[] } {
  const sorted = [...thresholds].sort((a, b) => a - b);
  const n = sorted.length + 1;

  function makeLabel(i: number): string {
    if (i === 0) return `0–${sorted[0]}%`;
    if (i === n - 1) return `${sorted[sorted.length - 1]}%+`;
    return `${sorted[i - 1]}–${sorted[i]}%`;
  }

  function makeBucket(i: number, colors: string[]): import('../types').SlopeBucket {
    return {
      label: makeLabel(i),
      minSlope: i === 0 ? 0 : sorted[i - 1],
      maxSlope: i === n - 1 ? Infinity : sorted[i],
      distance: 0,
      sectionCount: 0,
      percentage: 0,
      color: colors[i],
      textColor: '#ffffff',
    };
  }

  const uphillBuckets = Array.from({ length: n }, (_, i) => makeBucket(i, uphillHexColors));
  const downhillBuckets = Array.from({ length: n }, (_, i) => makeBucket(i, downhillHexColors));

  function bucketIdx(absSlope: number): number {
    for (let i = 0; i < sorted.length; i++) {
      if (absSlope < sorted[i]) return i;
    }
    return n - 1;
  }

  for (const sec of sections) {
    const idx = bucketIdx(Math.abs(sec.slope));
    if (sec.slope >= 0) {
      uphillBuckets[idx].distance += sec.distance;
      uphillBuckets[idx].sectionCount++;
    } else {
      downhillBuckets[idx].distance += sec.distance;
      downhillBuckets[idx].sectionCount++;
    }
  }

  for (const b of [...uphillBuckets, ...downhillBuckets]) {
    b.percentage = totalDistance > 0 ? (b.distance / totalDistance) * 100 : 0;
  }

  return { uphillBuckets, downhillBuckets };
}
