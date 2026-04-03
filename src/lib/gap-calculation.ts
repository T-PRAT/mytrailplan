import type {
  GapSectionResult,
  GapSimulationResult,
  ProfilePoint,
  Section,
  Segment,
} from "../types";

const CR_FLAT = 3.6; // Cr(0) — coût énergétique sur le plat en J/kg/m
const MIN_COST_RATIO = 0.88; // Plafond bas en descente (correction Strava vs Minetti pur)
const MIN_ELEVATION_CHANGE = 100; // Seuil minimum de D+/D- pour détecter un segment (mètres)
const REVERSAL_TOLERANCE = 30; // Tolérance avant de considérer un changement de direction (mètres)

const RE_HMS = /^(\d+):(\d{2})(?::(\d{2}))?$/;
const RE_HM = /^(\d+)h(\d+)m?$|^(\d+)h$/;
const RE_MINS = /^(\d+)$/;
const RE_PACE = /^(\d{1,2}):([0-5]\d)$/;

export function minettiCost(i: number): number {
  return (
    155.4 * i ** 5 -
    30.4 * i ** 4 -
    43.3 * i ** 3 +
    46.3 * i ** 2 +
    19.5 * i +
    CR_FLAT
  );
}

export function costRatio(slopePercent: number): number {
  const i = slopePercent / 100;
  const ratio = minettiCost(i) / CR_FLAT;
  return Math.max(ratio, MIN_COST_RATIO);
}

export function simulateGap(
  sections: Section[],
  gapPaceSecondsPerKm: number
): GapSimulationResult {
  const gapSpeed = 1000 / gapPaceSecondsPerKm; // m/s

  const gapSections: GapSectionResult[] = sections.map((s, i) => {
    const ratio = costRatio(s.slope);
    const actualSpeed = gapSpeed / ratio;
    const actualPace = 1000 / actualSpeed;
    const sectionTime = s.distance / actualSpeed;
    return {
      sectionIndex: i,
      distance: s.distance,
      slope: s.slope,
      costRatio: ratio,
      actualSpeed,
      actualPace,
      sectionTime,
    };
  });

  const totalTime = gapSections.reduce((acc, s) => acc + s.sectionTime, 0);
  const totalDist = gapSections.reduce((acc, s) => acc + s.distance, 0);
  const averageActualPace =
    totalDist > 0 ? totalTime / (totalDist / 1000) : gapPaceSecondsPerKm;

  return {
    sections: gapSections,
    totalTime,
    averageActualPace,
    gapPace: gapPaceSecondsPerKm,
  };
}

/**
 * Détecte les montées et descentes significatives (>100m D+/D-).
 * Utilise les profilePoints pour suivre l'altitude cumulée et détecte les
 * inversions de tendance avec une tolérance de 30m pour éviter le bruit.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex by nature
export function detectSegments(
  sections: Section[],
  profilePoints: ProfilePoint[]
): Segment[] {
  if (profilePoints.length < 2) {
    return [];
  }

  // On travaille sur les profilePoints (1 de plus que sections)
  // profilePoints[i] correspond au début de sections[i]
  const segments: Segment[] = [];

  // Trouver les points de retournement
  let direction: "up" | "down" | null = null;
  let segStartIdx = 0; // index dans profilePoints
  let highPoint = profilePoints[0].elevation;
  let lowPoint = profilePoints[0].elevation;
  let highIdx = 0;
  let lowIdx = 0;

  for (let i = 1; i < profilePoints.length; i++) {
    const ele = profilePoints[i].elevation;

    if (ele > highPoint) {
      highPoint = ele;
      highIdx = i;
    }
    if (ele < lowPoint) {
      lowPoint = ele;
      lowIdx = i;
    }

    if (direction === null) {
      // Déterminer la direction initiale
      if (ele - lowPoint > REVERSAL_TOLERANCE) {
        direction = "up";
        segStartIdx = lowIdx;
        highPoint = ele;
        highIdx = i;
      } else if (highPoint - ele > REVERSAL_TOLERANCE) {
        direction = "down";
        segStartIdx = highIdx;
        lowPoint = ele;
        lowIdx = i;
      }
    } else if (direction === "up") {
      // On monte — détecter si on redescend significativement depuis le sommet
      if (highPoint - ele > REVERSAL_TOLERANCE) {
        // Fin de la montée au highIdx
        const eleChange =
          profilePoints[highIdx].elevation -
          profilePoints[segStartIdx].elevation;
        if (Math.abs(eleChange) >= MIN_ELEVATION_CHANGE) {
          pushSegment(
            segments,
            sections,
            profilePoints,
            "climb",
            segStartIdx,
            highIdx
          );
        }
        // Nouvelle descente commence au highIdx
        direction = "down";
        segStartIdx = highIdx;
        lowPoint = ele;
        lowIdx = i;
        highPoint = profilePoints[highIdx].elevation;
      }
    } else if (direction === "down" && ele - lowPoint > REVERSAL_TOLERANCE) {
      // On descend — détecter si on remonte significativement depuis le creux
      const eleChange =
        profilePoints[lowIdx].elevation - profilePoints[segStartIdx].elevation;
      if (Math.abs(eleChange) >= MIN_ELEVATION_CHANGE) {
        pushSegment(
          segments,
          sections,
          profilePoints,
          "descent",
          segStartIdx,
          lowIdx
        );
      }
      // Nouvelle montée commence au lowIdx
      direction = "up";
      segStartIdx = lowIdx;
      highPoint = ele;
      highIdx = i;
      lowPoint = profilePoints[lowIdx].elevation;
    }
  }

  // Segment final
  if (direction !== null) {
    const endIdx = direction === "up" ? highIdx : lowIdx;
    const eleChange =
      profilePoints[endIdx].elevation - profilePoints[segStartIdx].elevation;
    if (Math.abs(eleChange) >= MIN_ELEVATION_CHANGE) {
      pushSegment(
        segments,
        sections,
        profilePoints,
        direction === "up" ? "climb" : "descent",
        segStartIdx,
        endIdx
      );
    }
  }

  // Combler les trous entre segments significatifs avec des segments 'rolling'
  return fillGaps(segments, sections, profilePoints);
}

function pushSegment(
  segments: Segment[],
  sections: Section[],
  profilePoints: ProfilePoint[],
  type: "climb" | "descent",
  startPtIdx: number,
  endPtIdx: number
): void {
  // profilePoints[i] = début de section[i], donc section indices = startPtIdx..endPtIdx-1
  const startSectionIdx = Math.min(startPtIdx, sections.length - 1);
  const endSectionIdx = Math.min(endPtIdx - 1, sections.length - 1);
  if (endSectionIdx < startSectionIdx) {
    return;
  }

  let distance = 0;
  for (let i = startSectionIdx; i <= endSectionIdx; i++) {
    distance += sections[i].distance;
  }

  segments.push({
    type,
    startIndex: startSectionIdx,
    endIndex: endSectionIdx,
    distance,
    elevationChange:
      profilePoints[endPtIdx].elevation - profilePoints[startPtIdx].elevation,
    startDistance: profilePoints[startPtIdx].cumulativeDistance,
    endDistance: profilePoints[endPtIdx].cumulativeDistance,
    startElevation: profilePoints[startPtIdx].elevation,
    endElevation: profilePoints[endPtIdx].elevation,
  });
}

function fillGaps(
  significantSegments: Segment[],
  sections: Section[],
  profilePoints: ProfilePoint[]
): Segment[] {
  if (sections.length === 0) {
    return significantSegments;
  }

  const lastSectionIdx = sections.length - 1;
  const result: Segment[] = [];

  // Trier les segments significatifs par position
  const sorted = [...significantSegments].sort(
    (a, b) => a.startIndex - b.startIndex
  );

  let cursor = 0; // prochaine section non couverte

  for (const seg of sorted) {
    // Trou avant ce segment ?
    if (seg.startIndex > cursor) {
      result.push(
        makeGapSegment(sections, profilePoints, cursor, seg.startIndex - 1)
      );
    }
    result.push(seg);
    cursor = seg.endIndex + 1;
  }

  // Trou après le dernier segment ?
  if (cursor <= lastSectionIdx) {
    result.push(
      makeGapSegment(sections, profilePoints, cursor, lastSectionIdx)
    );
  }

  return result;
}

function makeGapSegment(
  sections: Section[],
  profilePoints: ProfilePoint[],
  startIdx: number,
  endIdx: number
): Segment {
  let distance = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    distance += sections[i].distance;
  }
  const startPt = profilePoints[startIdx];
  const endPt = profilePoints[endIdx + 1] ?? profilePoints.at(-1);
  const eleChange = endPt.elevation - startPt.elevation;

  // Classer selon la tendance dominante
  let type: "climb" | "descent" | "rolling" = "rolling";
  if (distance > 0) {
    const avgSlope = Math.abs(eleChange / distance) * 100;
    if (avgSlope > 3) {
      type = eleChange > 0 ? "climb" : "descent";
    }
  }

  return {
    type,
    startIndex: startIdx,
    endIndex: endIdx,
    distance,
    elevationChange: eleChange,
    startDistance: startPt.cumulativeDistance,
    endDistance: endPt.cumulativeDistance,
    startElevation: startPt.elevation,
    endElevation: endPt.elevation,
  };
}

export function formatPace(secondsPerKm: number): string {
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function parsePace(input: string): number | null {
  const match = input.trim().match(RE_PACE);
  if (!match) {
    return null;
  }
  const mins = Number.parseInt(match[1], 10);
  const secs = Number.parseInt(match[2], 10);
  if (mins <= 0 && secs <= 0) {
    return null;
  }
  if (mins > 20) {
    return null;
  }
  return mins * 60 + secs;
}

export function formatTime(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) {
    return `${m}min`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Calcule la VAP (s/km) à partir d'une durée totale cible.
 * Inversion directe : gapPace = totalTime × 1000 / Σ(dist_i × costRatio_i)
 */
export function gapPaceFromTime(
  sections: Section[],
  totalSeconds: number
): number {
  const weightedDist = sections.reduce(
    (acc, s) => acc + s.distance * costRatio(s.slope),
    0
  );
  if (weightedDist === 0) {
    return 360;
  }
  return (totalSeconds * 1000) / weightedDist;
}

/**
 * Parse une durée saisie par l'utilisateur.
 * Accepte : "4:30:00", "4h30", "4h30m", "4h", "270" (minutes), "2:30" (h:mm)
 * Retourne le nombre de secondes, ou null si invalide.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) {
    return null;
  }

  // "4:30:00" ou "4:30" (h:mm ou h:mm:ss)
  const hms = s.match(RE_HMS);
  if (hms) {
    const h = Number.parseInt(hms[1], 10);
    const m = Number.parseInt(hms[2], 10);
    const sec = hms[3] ? Number.parseInt(hms[3], 10) : 0;
    if (m >= 60 || sec >= 60) {
      return null;
    }
    return h * 3600 + m * 60 + sec;
  }

  // "4h30m", "4h30", "4h"
  const hm = s.match(RE_HM);
  if (hm) {
    const h = Number.parseInt(hm[1] ?? hm[3], 10);
    const m = hm[2] ? Number.parseInt(hm[2], 10) : 0;
    if (m >= 60) {
      return null;
    }
    return h * 3600 + m * 60;
  }

  // Nombre seul = minutes
  const mins = s.match(RE_MINS);
  if (mins) {
    const m = Number.parseInt(mins[1], 10);
    if (m <= 0 || m > 5000) {
      return null;
    }
    return m * 60;
  }

  return null;
}
