// Returns bg + text classes and hex color for a slope bucket
export const UPHILL_COLORS: { bg: string; text: string; hex: string }[] = [
  { bg: 'bg-amber-100', text: 'text-amber-900', hex: '#EDD9A8' }, // 0–5%
  { bg: 'bg-yellow-300', text: 'text-yellow-900', hex: '#E8C170' }, // 5–10%
  { bg: 'bg-orange-500', text: 'text-orange-100', hex: '#E07B4F' }, // 10–20%
  { bg: 'bg-red-600', text: 'text-red-100', hex: '#C7453B' },       // 20–30%
  { bg: 'bg-rose-900', text: 'text-rose-100', hex: '#8B1E3F' },     // 30%+
];

export const DOWNHILL_COLORS: { bg: string; text: string; hex: string }[] = [
  { bg: 'bg-teal-100', text: 'text-teal-900', hex: '#B2DDD5' },    // 0–5%
  { bg: 'bg-teal-300', text: 'text-teal-900', hex: '#7DCFB6' },    // 5–10%
  { bg: 'bg-teal-500', text: 'text-teal-100', hex: '#4AADAD' },    // 10–20%
  { bg: 'bg-blue-700', text: 'text-blue-100', hex: '#2E6B8A' },    // 20–30%
  { bg: 'bg-blue-900', text: 'text-blue-100', hex: '#1B3A4B' },    // 30%+
];

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// Genere `count` couleurs hex en interpolant le long du gradient uphill ou downhill.
export function interpolateHexColors(count: number, palette: 'uphill' | 'downhill'): string[] {
  const anchors = (palette === 'uphill' ? UPHILL_COLORS : DOWNHILL_COLORS).map((c) => parseHex(c.hex));
  if (count === 1) return [toHex(...anchors[0])];
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const pos = t * (anchors.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, anchors.length - 1);
    const frac = pos - lo;
    const [r, g, b] = anchors[lo].map((c, j) => c + frac * (anchors[hi][j] - c)) as [number, number, number];
    return toHex(r, g, b);
  });
}

// Version dynamique : classifie slope selon des seuils variables
export function slopeHexDynamic(
  slope: number,
  thresholds: number[],
  uphillColors: string[],
  downhillColors: string[],
): string {
  const absSlope = Math.abs(slope);
  const colors = slope >= 0 ? uphillColors : downhillColors;
  for (let i = 0; i < thresholds.length; i++) {
    if (absSlope < thresholds[i]) return colors[i];
  }
  return colors[colors.length - 1];
}

const DEFAULT_THRESHOLDS = [5, 10, 20, 30];
const DEFAULT_UPHILL = UPHILL_COLORS.map((c) => c.hex);
const DEFAULT_DOWNHILL = DOWNHILL_COLORS.map((c) => c.hex);

export function slopeHex(slope: number): string {
  return slopeHexDynamic(slope, DEFAULT_THRESHOLDS, DEFAULT_UPHILL, DEFAULT_DOWNHILL);
}
