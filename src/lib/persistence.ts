import type { DBSchema, IDBPDatabase } from "idb";
import { openDB } from "idb";
import {
  getDefaultFoodLibrary,
  migrateLegPlanToPlacements,
} from "../components/aid-station/nutrition-utils";
import type {
  FoodItem,
  NutritionState,
  ProjectMeta,
  StoredProject,
} from "../types";

const GPX_EXTENSION_RE = /\.gpx$/i;

const DEFAULT_NUTRITION: NutritionState = {
  aidStations: [],
  nutritionPlacements: [],
  foodLibrary: [],
  hourlyTargets: { carbsPerHour: 60, waterPerHour: 500, sodiumPerHour: 500 },
  timeOverrides: {},
  paceSettings: { mode: "vap", sliderPace: 360, durationInput: "" },
  bodyWeightKg: 70,
  nutritionMode: "normal",
  legNutritionPlan: {},
  legNotes: {},
};

interface TrailPrepDB extends DBSchema {
  appState: {
    key: string;
    value: string;
  };
  projects: {
    key: string;
    value: StoredProject;
  };
}

let dbPromise: Promise<IDBPDatabase<TrailPrepDB>> | null = null;

function getDb(): Promise<IDBPDatabase<TrailPrepDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TrailPrepDB>("trailprep", 2, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 2) {
          db.createObjectStore("projects", { keyPath: "id" });
          db.createObjectStore("appState");

          // Migrate v1 single-project record if it exists
          if (db.objectStoreNames.contains("project" as never)) {
            const oldStore = transaction.objectStore("project" as never);
            const old = (await oldStore.get("current")) as
              | (NutritionState & { gpxText?: string; filename?: string })
              | undefined;
            if (old?.gpxText) {
              const id = crypto.randomUUID();
              const name =
                (old.filename ?? "").replace(GPX_EXTENSION_RE, "") ||
                "Mon projet";
              const now = Date.now();
              const project: StoredProject = {
                ...DEFAULT_NUTRITION,
                ...old,
                id,
                name,
                gpxText: old.gpxText,
                filename: old.filename ?? "",
                createdAt: now,
                updatedAt: now,
              };
              await transaction.objectStore("projects").put(project);
              await transaction
                .objectStore("appState")
                .put(id, "activeProjectId");
            }
            db.deleteObjectStore("project" as never);
          }
        }
      },
    });
  }
  return dbPromise;
}

function toMeta(p: StoredProject): ProjectMeta {
  return {
    id: p.id,
    name: p.name,
    filename: p.filename,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function listProjects(): Promise<ProjectMeta[]> {
  try {
    const db = await getDb();
    const all = await db.getAll("projects");
    return all.map(toMeta).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function loadProject(id: string): Promise<StoredProject | null> {
  try {
    const db = await getDb();
    const project = await db.get("projects", id);
    if (!project) {
      return null;
    }
    // Runtime migration: anciens projets avec legNutritionPlan mais sans nutritionPlacements
    if (!project.nutritionPlacements && project.legNutritionPlan) {
      const placements = migrateLegPlanToPlacements(
        project.legNutritionPlan,
        project.aidStations,
        // totalDistance non stocké : on utilise la distance max des ravitos + 1km comme fallback
        // (sera recalculé au chargement du GPX de toute façon)
        Math.max(0, ...project.aidStations.map((s) => s.distanceFromStart)) +
          1000
      );
      return { ...project, nutritionPlacements: placements };
    }
    return {
      ...project,
      nutritionPlacements: project.nutritionPlacements ?? [],
      legNutritionPlan: project.legNutritionPlan ?? {},
      legNotes: project.legNotes ?? {},
      // Projets existants sans nutritionMode → mode avancé (ils utilisaient les placements)
      nutritionMode: project.nutritionMode ?? "advanced",
    };
  } catch {
    return null;
  }
}

export async function saveProject(data: StoredProject): Promise<void> {
  try {
    const db = await getDb();
    await db.put("projects", { ...data, updatedAt: Date.now() });
  } catch {
    /* ignore */
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete("projects", id);
  } catch {
    /* ignore */
  }
}

export async function renameProject(id: string, name: string): Promise<void> {
  try {
    const db = await getDb();
    const project = await db.get("projects", id);
    if (project) {
      await db.put("projects", { ...project, name, updatedAt: Date.now() });
    }
  } catch {
    /* ignore */
  }
}

export async function createProject(
  gpxText: string,
  filename: string,
  foodLibrary?: FoodItem[]
): Promise<StoredProject> {
  const id = crypto.randomUUID();
  const name = filename.replace(GPX_EXTENSION_RE, "") || "Mon projet";
  const now = Date.now();
  const project: StoredProject = {
    ...DEFAULT_NUTRITION,
    foodLibrary: foodLibrary ?? getDefaultFoodLibrary(),
    nutritionPlacements: [],
    id,
    name,
    gpxText,
    filename,
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.put("projects", project);
  await setActiveProjectId(id);
  return project;
}

export async function getActiveProjectId(): Promise<string | null> {
  try {
    const db = await getDb();
    return (await db.get("appState", "activeProjectId")) ?? null;
  } catch {
    return null;
  }
}

export async function setActiveProjectId(id: string | null): Promise<void> {
  try {
    const db = await getDb();
    if (id === null) {
      await db.delete("appState", "activeProjectId");
    } else {
      await db.put("appState", id, "activeProjectId");
    }
  } catch {
    /* ignore */
  }
}

export function migrateLocalStorageFoodLibrary(): FoodItem[] | null {
  try {
    const raw = localStorage.getItem("trailprep_food_library");
    if (!raw) {
      return null;
    }
    const items = JSON.parse(raw) as FoodItem[];
    localStorage.removeItem("trailprep_food_library");
    return items;
  } catch {
    return null;
  }
}
