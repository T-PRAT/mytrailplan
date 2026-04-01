export interface NutrientIntake {
  amount: number;
  timeH: number;
}

export interface RateTimelinePoint {
  rate: number;
  timeH: number;
}

/**
 * Calcule le débit horaire glissant (fenêtre centrée de windowH heures)
 * à partir de doses ponctuelles sur le parcours.
 */
export function computeRollingRate(
  intakes: NutrientIntake[],
  totalTimeH: number,
  windowH = 1.0,
  resolution = 200
): RateTimelinePoint[] {
  const active = intakes.filter((i) => i.amount > 0);
  if (active.length === 0 || totalTimeH <= 0) {
    return [];
  }
  const points: RateTimelinePoint[] = [];
  for (let i = 0; i <= resolution; i++) {
    const timeH = (i / resolution) * totalTimeH;
    const windowStart = Math.max(0, timeH - windowH / 2);
    const windowEnd = Math.min(totalTimeH, timeH + windowH / 2);
    const windowWidth = windowEnd - windowStart;
    let total = 0;
    for (const intake of active) {
      if (intake.timeH >= windowStart && intake.timeH <= windowEnd) {
        total += intake.amount;
      }
    }
    points.push({ timeH, rate: windowWidth > 0 ? total / windowWidth : 0 });
  }
  return points;
}
