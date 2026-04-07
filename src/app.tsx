import { Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "./components/theme-toggle";
import { useTheme } from "./hooks/use-theme";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AidStationPlanner } from "./components/aid-station-planner";
import { DistributionChart } from "./components/distribution-chart";
import { ElevationProfile } from "./components/elevation-profile";
import { FileUpload } from "./components/file-upload";
import { GapSimulator } from "./components/gap-simulator";
import { ProjectPicker } from "./components/project-picker";
import { RunWalkAnalysis } from "./components/run-walk-analysis";
import { SlopeThresholdSlider } from "./components/slope-threshold-slider";
import { useProjectManager } from "./hooks/use-project-manager";
import { interpolateHexColors, slopeHexDynamic } from "./lib/colors";
import { parseGpx } from "./lib/gpx-parser";
import { analyze, classifyIntoBuckets } from "./lib/slope-analysis";
import type { AnalysisResult, NutritionState } from "./types";

type Tab = "pentes" | "course-marche" | "simulateur" | "ravitaillements";

const TABS: { id: Tab; label: string }[] = [
  { id: "ravitaillements", label: "Plan de course" },
  { id: "pentes", label: "Pentes" },
  { id: "course-marche", label: "Course / Marche" },
  { id: "simulateur", label: "Simulateur VAP" },
];

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState<number[]>([5, 10, 20, 30]);
  const [showThresholdConfig, setShowThresholdConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("ravitaillements");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renamingHeader, setRenamingHeader] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const {
    ready,
    projects,
    activeProject,
    openProject,
    createProject,
    save,
    renameProject,
    deleteProject,
  } = useProjectManager();

  // Restore analysis when project loads
  useEffect(() => {
    if (!activeProject?.gpxText) {
      setResult(null);
      return;
    }
    try {
      const points = parseGpx(activeProject.gpxText);
      setResult(analyze(points));
    } catch {
      setResult(null);
    }
  }, [activeProject?.gpxText]);

  async function handleFile(gpxText: string, filename: string) {
    setError(null);
    try {
      const points = parseGpx(gpxText);
      const analysis = analyze(points);
      setResult(analysis);
      await createProject(gpxText, filename);
      setPickerOpen(false);
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    }
  }

  async function handleOpen(id: string) {
    setPickerOpen(false);
    await openProject(id);
    setActiveTab("ravitaillements");
  }

  function startRenaming() {
    if (!activeProject) return;
    setRenameValue(activeProject.name);
    setRenamingHeader(true);
    setTimeout(() => {
      renameInputRef.current?.select();
    }, 0);
  }

  function confirmRename() {
    const trimmed = renameValue.trim();
    if (trimmed && activeProject && trimmed !== activeProject.name) {
      renameProject(activeProject.id, trimmed);
    }
    setRenamingHeader(false);
  }

  const handleNutritionStateChange = useCallback(
    (state: NutritionState) => {
      save(state);
    },
    [save]
  );

  const uphillColors = useMemo(
    () => interpolateHexColors(thresholds.length + 1, "uphill"),
    [thresholds]
  );

  const downhillColors = useMemo(
    () => interpolateHexColors(thresholds.length + 1, "downhill"),
    [thresholds]
  );

  const { uphillBuckets, downhillBuckets } = useMemo(() => {
    if (!result) {
      return { uphillBuckets: [], downhillBuckets: [] };
    }
    return classifyIntoBuckets(
      result.sections,
      thresholds,
      result.totalDistance,
      uphillColors,
      downhillColors
    );
  }, [result, thresholds, uphillColors, downhillColors]);

  const dynamicSlopeHex = useCallback(
    (slope: number) =>
      slopeHexDynamic(slope, thresholds, uphillColors, downhillColors),
    [thresholds, uphillColors, downhillColors]
  );

  const Logo = () => (
    <svg
      aria-label="TrailPrep"
      height="56"
      role="img"
      viewBox="0 0 200 56"
      width="200"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="logo-clip">
          <path d="M0,44 C6,43 10,40 15,33 C21,24 25,14 30,8 C32,4 34,3 36,5 C39,8 42,15 45,23 C48,30 50,33 53,32 C55,30 57,24 59,18 C61,14 62,16 63,21 C65,28 66,38 68,44 Z" />
        </clipPath>
      </defs>
      {/* Color bands clipped to elevation shape */}
      <g clipPath="url(#logo-clip)">
        <rect x="0"   y="2" width="8.5" height="44" fill="#1B3A4B" />
        <rect x="8.5" y="2" width="8.5" height="44" fill="#2E6B8A" />
        <rect x="17"  y="2" width="8.5" height="44" fill="#4AADAD" />
        <rect x="25.5" y="2" width="8.5" height="44" fill="#7DCFB6" />
        <rect x="34"  y="2" width="8.5" height="44" fill="#E8C170" />
        <rect x="42.5" y="2" width="8.5" height="44" fill="#E07B4F" />
        <rect x="51"  y="2" width="8.5" height="44" fill="#C7453B" />
        <rect x="59.5" y="2" width="8.5" height="44" fill="#8B1E3F" />
        {/* Separators */}
        <line x1="8.5"  y1="2" x2="8.5"  y2="46" stroke="var(--chart-background)" strokeWidth="0.5" opacity="0.4" />
        <line x1="17"   y1="2" x2="17"   y2="46" stroke="var(--chart-background)" strokeWidth="0.5" opacity="0.4" />
        <line x1="25.5" y1="2" x2="25.5" y2="46" stroke="var(--chart-background)" strokeWidth="0.5" opacity="0.4" />
        <line x1="34"   y1="2" x2="34"   y2="46" stroke="var(--chart-background)" strokeWidth="0.5" opacity="0.4" />
        <line x1="42.5" y1="2" x2="42.5" y2="46" stroke="var(--chart-background)" strokeWidth="0.5" opacity="0.4" />
        <line x1="51"   y1="2" x2="51"   y2="46" stroke="var(--chart-background)" strokeWidth="0.5" opacity="0.4" />
        <line x1="59.5" y1="2" x2="59.5" y2="46" stroke="var(--chart-background)" strokeWidth="0.5" opacity="0.4" />
      </g>
      {/* Profile line */}
      <path
        d="M0,44 C6,43 10,40 15,33 C21,24 25,14 30,8 C32,4 34,3 36,5 C39,8 42,15 45,23 C48,30 50,33 53,32 C55,30 57,24 59,18 C61,14 62,16 63,21 C65,28 66,38 68,44"
        fill="none"
        stroke="var(--chart-foreground)"
        strokeLinecap="round"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      {/* Aid station markers — y values matched to bezier curve */}
      <circle cx="3" cy="44" r="2.5" fill="var(--chart-foreground)" stroke="var(--chart-background)" strokeWidth="1.2" />
      <circle cx="18" cy="27" r="2.5" fill="var(--chart-foreground)" stroke="var(--chart-background)" strokeWidth="1.2" />
      <circle cx="50" cy="32" r="2.5" fill="var(--chart-foreground)" stroke="var(--chart-background)" strokeWidth="1.2" />
      <circle cx="68" cy="44" r="2.5" fill="var(--chart-foreground)" stroke="var(--chart-background)" strokeWidth="1.2" />
      <text
        dominantBaseline="middle"
        fill="var(--chart-foreground)"
        fontFamily="system-ui, sans-serif"
        fontSize="22"
        fontWeight="700"
        x="78"
        y="30"
      >
        TrailPrep
      </text>
    </svg>
  );

  if (!ready) {
    return <div className="min-h-screen bg-gray-950" />;
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Home screen — no active project */}
      {!activeProject && (
        <div className="mx-auto max-w-xl px-4 py-10">
          <div className="mb-8">
            <Logo />
            <p className="mt-1 text-gray-400 text-sm">
              Analyse de la distribution des pentes d'une trace GPX
            </p>
          </div>

          {projects.length > 0 ? (
            <div className="flex flex-col gap-4">
              <p className="text-gray-400 text-sm">Mes projets</p>
              <ProjectPicker
                onDelete={deleteProject}
                onNew={handleFile}
                onOpen={handleOpen}
                onRename={renameProject}
                projects={projects}
              />
            </div>
          ) : (
            <>
              <FileUpload onFile={handleFile} />
              {error && (
                <div className="mt-4 rounded-xl border border-red-800 bg-red-950 p-4 text-red-400 text-sm">
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Main view — project loaded */}
      {activeProject && result && (
        <div className="flex min-h-screen flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-6 border-gray-800 border-b px-10 py-4">
            <Logo />
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex items-center gap-1.5">
                {renamingHeader ? (
                  <input
                    ref={renameInputRef}
                    className="rounded-md border border-gray-600 bg-gray-800 px-2 py-0.5 font-medium text-gray-100 text-sm outline-none focus:border-gray-400"
                    onBlur={confirmRename}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmRename();
                      if (e.key === "Escape") setRenamingHeader(false);
                    }}
                    type="text"
                    value={renameValue}
                  />
                ) : (
                  <p className="truncate font-medium text-gray-300 text-sm">
                    {activeProject.name}
                  </p>
                )}
                {!renamingHeader && (
                  <button
                    className="text-gray-600 transition-colors hover:text-gray-300"
                    onClick={startRenaming}
                    title="Renommer le projet"
                    type="button"
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <span>{(result.totalDistance / 1000).toFixed(1)} km</span>
                <span className="text-gray-700">·</span>
                <span>+{Math.round(result.totalGain)} m</span>
                <span className="text-gray-700">·</span>
                <span>-{Math.round(result.totalLoss)} m</span>
              </div>
            </div>
            <button
              className="shrink-0 text-gray-500 text-sm underline hover:text-gray-200"
              onClick={() => setPickerOpen(true)}
              type="button"
            >
              Mes projets
            </button>
          </div>

          {/* Tabs */}
          <Tabs
            className="flex flex-1 flex-col"
            onValueChange={(v) => setActiveTab(v as Tab)}
            value={activeTab}
          >
            <div className="border-gray-800 border-b px-10">
              <TabsList className="h-auto gap-1 rounded-none bg-transparent p-0">
                {TABS.map((tab) => (
                  <TabsTrigger
                    className={`-mb-px rounded-none border-transparent border-b-2 px-4 py-3 text-sm transition-colors data-[state=active]:bg-transparent data-[state=active]:shadow-none ${
                      tab.id === "ravitaillements"
                        ? "tab-main"
                        : "font-medium text-gray-500 hover:border-gray-600 hover:text-gray-300 data-[state=active]:border-gray-300 data-[state=active]:text-gray-100"
                    }`}
                    key={tab.id}
                    value={tab.id}
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="flex flex-col gap-6 px-10 py-6 pb-10">
              <TabsContent className="mt-0 flex flex-col gap-6" value="pentes">
                <ElevationProfile
                  profilePoints={result.profilePoints}
                  sections={result.sections}
                  slopeHexFn={dynamicSlopeHex}
                />
                <div>
                  <button
                    className="flex items-center gap-1.5 text-gray-600 text-xs transition-colors hover:text-gray-400"
                    onClick={() => setShowThresholdConfig((v) => !v)}
                    type="button"
                  >
                    <svg
                      aria-hidden="true"
                      className={`h-3 w-3 transition-transform ${showThresholdConfig ? "rotate-90" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M9 5l7 7-7 7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Configurer les seuils de pentes
                  </button>
                  {showThresholdConfig && (
                    <div className="mt-3">
                      <SlopeThresholdSlider
                        downhillColors={downhillColors}
                        onChange={setThresholds}
                        thresholds={thresholds}
                        uphillColors={uphillColors}
                      />
                    </div>
                  )}
                </div>
                <DistributionChart
                  downhillBuckets={downhillBuckets}
                  uphillBuckets={uphillBuckets}
                />
              </TabsContent>

              <TabsContent className="mt-0" value="course-marche">
                <RunWalkAnalysis
                  profilePoints={result.profilePoints}
                  sections={result.sections}
                />
              </TabsContent>

              <TabsContent className="mt-0" value="simulateur">
                <GapSimulator
                  profilePoints={result.profilePoints}
                  sections={result.sections}
                  slopeHexFn={dynamicSlopeHex}
                  totalDistance={result.totalDistance}
                />
              </TabsContent>

              <TabsContent className="mt-0" value="ravitaillements">
                <AidStationPlanner
                  initialNutritionState={activeProject}
                  key={activeProject.id}
                  onNutritionStateChange={handleNutritionStateChange}
                  profilePoints={result.profilePoints}
                  sections={result.sections}
                  slopeHexFn={dynamicSlopeHex}
                  totalDistance={result.totalDistance}
                />
              </TabsContent>
            </div>
          </Tabs>

          {/* Footer */}
          <footer className="flex items-center justify-between border-gray-800 border-t px-10 py-4">
            <p className="text-gray-600 text-xs">
              Ton plan de course, étape par étape.
            </p>
            <div className="flex items-center gap-4">
              <span className="text-gray-600 text-xs">© {new Date().getFullYear()} T-PRAT</span>
              <ThemeToggle onToggle={toggleTheme} theme={theme} />
            </div>
          </footer>
        </div>
      )}

      {/* Project picker dialog */}
      <Dialog onOpenChange={setPickerOpen} open={pickerOpen}>
        <DialogContent className="w-full max-w-xl overflow-hidden border-gray-700 bg-gray-900">
          <DialogHeader>
            <DialogTitle className="text-gray-100">Mes projets</DialogTitle>
          </DialogHeader>
          <ProjectPicker
            activeProjectId={activeProject?.id}
            onDelete={deleteProject}
            onNew={handleFile}
            onOpen={handleOpen}
            onRename={renameProject}
            projects={projects}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
