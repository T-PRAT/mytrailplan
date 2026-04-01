import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteProject,
  getActiveProjectId,
  listProjects,
  loadProject,
  migrateLocalStorageFoodLibrary,
  createProject as persistCreateProject,
  renameProject as persistRenameProject,
  saveProject,
  setActiveProjectId,
} from "../lib/persistence";
import type { NutritionState, ProjectMeta, StoredProject } from "../types";

export function useProjectManager() {
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeProject, setActiveProject] = useState<StoredProject | null>(
    null
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeProjectRef = useRef<StoredProject | null>(null);

  useEffect(() => {
    Promise.all([listProjects(), getActiveProjectId()]).then(
      async ([list, activeId]) => {
        setProjects(list);
        if (activeId && list.some((p) => p.id === activeId)) {
          const project = await loadProject(activeId);
          setActiveProject(project);
          activeProjectRef.current = project;
        }
        setReady(true);
      }
    );
  }, []);

  const refreshList = useCallback(async () => {
    const list = await listProjects();
    setProjects(list);
    return list;
  }, []);

  const openProject = useCallback(async (id: string) => {
    // Cancel any pending save for the previous project
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const project = await loadProject(id);
    await setActiveProjectId(id);
    setActiveProject(project);
    activeProjectRef.current = project;
  }, []);

  const createProject = useCallback(
    async (gpxText: string, filename: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const migratedLibrary = migrateLocalStorageFoodLibrary();
      const project = await persistCreateProject(
        gpxText,
        filename,
        migratedLibrary ?? undefined
      );
      setActiveProject(project);
      activeProjectRef.current = project;
      await refreshList();
      return project;
    },
    [refreshList]
  );

  const save = useCallback((state: NutritionState) => {
    const current = activeProjectRef.current;
    if (!current) {
      return;
    }
    const updated: StoredProject = { ...current, ...state };
    activeProjectRef.current = updated;
    setActiveProject(updated);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      saveProject(updated);
    }, 500);
  }, []);

  const renameProject = useCallback(
    async (id: string, name: string) => {
      await persistRenameProject(id, name);
      if (activeProjectRef.current?.id === id) {
        const updated = { ...activeProjectRef.current, name };
        activeProjectRef.current = updated;
        setActiveProject(updated);
      }
      await refreshList();
    },
    [refreshList]
  );

  const deleteProjectById = useCallback(
    async (id: string) => {
      await deleteProject(id);
      if (activeProjectRef.current?.id === id) {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        await setActiveProjectId(null);
        setActiveProject(null);
        activeProjectRef.current = null;
      }
      await refreshList();
    },
    [refreshList]
  );

  const closeProject = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await setActiveProjectId(null);
    setActiveProject(null);
    activeProjectRef.current = null;
  }, []);

  return {
    ready,
    projects,
    activeProject,
    openProject,
    createProject,
    save,
    renameProject,
    deleteProject: deleteProjectById,
    closeProject,
  };
}
