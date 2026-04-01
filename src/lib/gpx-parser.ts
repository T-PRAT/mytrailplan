import type { TrackPoint } from "../types";

export function parseGpx(text: string): TrackPoint[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Fichier GPX invalide : erreur XML");
  }

  const trkpts = Array.from(doc.querySelectorAll("trkpt"));
  if (trkpts.length === 0) {
    throw new Error("Aucun point de trace trouvé dans le fichier GPX");
  }

  const points: TrackPoint[] = [];
  for (const pt of trkpts) {
    const lat = Number.parseFloat(pt.getAttribute("lat") ?? "");
    const lon = Number.parseFloat(pt.getAttribute("lon") ?? "");
    const eleEl = pt.querySelector("ele");
    const ele = eleEl ? Number.parseFloat(eleEl.textContent ?? "") : Number.NaN;

    if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(ele)) {
      continue;
    }
    points.push({ lat, lon, ele });
  }

  if (points.length < 2) {
    throw new Error("Pas assez de points valides avec élévation (minimum 2)");
  }

  return points;
}
