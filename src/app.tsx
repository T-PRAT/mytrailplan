import { useCallback, useEffect, useMemo, useState } from "react";
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
import { SummaryStats } from "./components/summary-stats";
import { useProjectManager } from "./hooks/use-project-manager";
import { interpolateHexColors, slopeHexDynamic } from "./lib/colors";
import { parseGpx } from "./lib/gpx-parser";
import { analyze, classifyIntoBuckets } from "./lib/slope-analysis";
import type { AnalysisResult, NutritionState } from "./types";

type Tab = "pentes" | "course-marche" | "simulateur" | "ravitaillements";

const TABS: { id: Tab; label: string }[] = [
  { id: "pentes", label: "Pentes" },
  { id: "course-marche", label: "Course / Marche" },
  { id: "simulateur", label: "Simulateur VAP" },
  { id: "ravitaillements", label: "Ravitaillements" },
];

export default function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState<number[]>([5, 10, 20, 30]);
  const [showThresholdConfig, setShowThresholdConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("pentes");
  const [pickerOpen, setPickerOpen] = useState(false);

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
    setActiveTab("pentes");
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
        <linearGradient id="logo-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#1B3A4B" />
          <stop offset="12%" stop-color="#2E6B8A" />
          <stop offset="25%" stop-color="#4AADAD" />
          <stop offset="37%" stop-color="#7DCFB6" />
          <stop offset="50%" stop-color="#E8E4D9" />
          <stop offset="62%" stop-color="#E8C170" />
          <stop offset="75%" stop-color="#E07B4F" />
          <stop offset="87%" stop-color="#C7453B" />
          <stop offset="100%" stop-color="#8B1E3F" />
        </linearGradient>
        <clipPath id="logo-clip">
          <path d="M0,44 C6,43 10,40 15,33 C21,24 25,14 30,8 C32,4 34,3 36,5 C39,8 42,15 45,23 C48,30 50,33 53,32 C55,30 57,24 59,18 C61,14 62,16 63,21 C65,28 66,38 68,44 Z" />
        </clipPath>
      </defs>
      <rect
        clip-path="url(#logo-clip)"
        fill="url(#logo-grad)"
        height="42"
        width="68"
        x="0"
        y="3"
      />
      <path
        d="M0,44 C6,43 10,40 15,33 C21,24 25,14 30,8 C32,4 34,3 36,5 C39,8 42,15 45,23 C48,30 50,33 53,32 C55,30 57,24 59,18 C61,14 62,16 63,21 C65,28 66,38 68,44"
        fill="none"
        stroke="#F0EDE5"
        stroke-linecap="round"
        stroke-opacity="0.5"
        stroke-width="1.5"
      />
      <text
        dominant-baseline="middle"
        fill="#F0EDE5"
        font-family="system-ui, sans-serif"
        font-size="22"
        font-weight="700"
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
              <p className="truncate font-medium text-gray-300 text-sm">
                {activeProject.name}
              </p>
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
                    className="-mb-px rounded-none border-transparent border-b-2 px-4 py-3 font-medium text-gray-500 text-sm transition-colors hover:border-gray-600 hover:text-gray-300 data-[state=active]:border-gray-300 data-[state=active]:bg-transparent data-[state=active]:text-gray-100 data-[state=active]:shadow-none"
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
                <SummaryStats result={result} />
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
        </div>
      )}

      {/* Project picker dialog */}
      <Dialog onOpenChange={setPickerOpen} open={pickerOpen}>
        <DialogContent className="w-full max-w-xl border-gray-700 bg-gray-900">
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
