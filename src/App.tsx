import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseGpx } from './lib/gpxParser';
import { analyze, classifyIntoBuckets } from './lib/slopeAnalysis';
import { interpolateHexColors, slopeHexDynamic } from './lib/colors';
import type { AnalysisResult, NutritionState } from './types';
import { FileUpload } from './components/FileUpload';
import { SummaryStats } from './components/SummaryStats';
import { DistributionChart } from './components/DistributionChart';
import { ElevationProfile } from './components/ElevationProfile';
import { SlopeThresholdSlider } from './components/SlopeThresholdSlider';
import { RunWalkAnalysis } from './components/RunWalkAnalysis';
import { GapSimulator } from './components/GapSimulator';
import { AidStationPlanner } from './components/AidStationPlanner';
import { ProjectPicker } from './components/ProjectPicker';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useProjectManager } from './hooks/useProjectManager';

type Tab = 'pentes' | 'course-marche' | 'simulateur' | 'ravitaillements';

const TABS: { id: Tab; label: string }[] = [
  { id: 'pentes',           label: 'Pentes' },
  { id: 'course-marche',    label: 'Course / Marche' },
  { id: 'simulateur',       label: 'Simulateur VAP' },
  { id: 'ravitaillements',  label: 'Ravitaillements' },
];

export default function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState<number[]>([5, 10, 20, 30]);
  const [showThresholdConfig, setShowThresholdConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('pentes');
  const [pickerOpen, setPickerOpen] = useState(false);

  const { ready, projects, activeProject, openProject, createProject, save, renameProject, deleteProject } = useProjectManager();

  // Restore analysis when project loads
  useEffect(() => {
    if (!activeProject?.gpxText) { setResult(null); return; }
    try {
      const points = parseGpx(activeProject.gpxText);
      setResult(analyze(points));
    } catch { setResult(null); }
  }, [activeProject?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setActiveTab('pentes');
  }

  function handleNutritionStateChange(state: NutritionState) {
    save(state);
  }

  const uphillColors = useMemo(
    () => interpolateHexColors(thresholds.length + 1, 'uphill'),
    [thresholds],
  );

  const downhillColors = useMemo(
    () => interpolateHexColors(thresholds.length + 1, 'downhill'),
    [thresholds],
  );

  const { uphillBuckets, downhillBuckets } = useMemo(() => {
    if (!result) return { uphillBuckets: [], downhillBuckets: [] };
    return classifyIntoBuckets(result.sections, thresholds, result.totalDistance, uphillColors, downhillColors);
  }, [result, thresholds, uphillColors, downhillColors]);

  const dynamicSlopeHex = useCallback(
    (slope: number) => slopeHexDynamic(slope, thresholds, uphillColors, downhillColors),
    [thresholds, uphillColors, downhillColors],
  );

  const Logo = () => (
    <svg viewBox="0 0 200 56" width="200" height="56" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stop-color="#1B3A4B"/>
          <stop offset="12%"  stop-color="#2E6B8A"/>
          <stop offset="25%"  stop-color="#4AADAD"/>
          <stop offset="37%"  stop-color="#7DCFB6"/>
          <stop offset="50%"  stop-color="#E8E4D9"/>
          <stop offset="62%"  stop-color="#E8C170"/>
          <stop offset="75%"  stop-color="#E07B4F"/>
          <stop offset="87%"  stop-color="#C7453B"/>
          <stop offset="100%" stop-color="#8B1E3F"/>
        </linearGradient>
        <clipPath id="logo-clip">
          <path d="M0,44 C6,43 10,40 15,33 C21,24 25,14 30,8 C32,4 34,3 36,5 C39,8 42,15 45,23 C48,30 50,33 53,32 C55,30 57,24 59,18 C61,14 62,16 63,21 C65,28 66,38 68,44 Z"/>
        </clipPath>
      </defs>
      <rect x="0" y="3" width="68" height="42" clip-path="url(#logo-clip)" fill="url(#logo-grad)"/>
      <path d="M0,44 C6,43 10,40 15,33 C21,24 25,14 30,8 C32,4 34,3 36,5 C39,8 42,15 45,23 C48,30 50,33 53,32 C55,30 57,24 59,18 C61,14 62,16 63,21 C65,28 66,38 68,44"
        fill="none" stroke="#F0EDE5" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.5"/>
      <text x="78" y="30" font-family="system-ui, sans-serif" font-size="22" font-weight="700" fill="#F0EDE5" dominant-baseline="middle">TrailPrep</text>
    </svg>
  );

  if (!ready) {
    return <div className="min-h-screen bg-gray-950" />;
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Home screen — no active project */}
      {!activeProject && (
        <div className="max-w-xl mx-auto px-4 py-10">
          <div className="mb-8">
            <Logo />
            <p className="text-gray-400 mt-1 text-sm">Analyse de la distribution des pentes d'une trace GPX</p>
          </div>

          {projects.length > 0 ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-400">Mes projets</p>
              <ProjectPicker
                projects={projects}
                onOpen={handleOpen}
                onNew={handleFile}
                onRename={renameProject}
                onDelete={deleteProject}
              />
            </div>
          ) : (
            <>
              <FileUpload onFile={handleFile} />
              {error && (
                <div className="mt-4 p-4 bg-red-950 border border-red-800 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Main view — project loaded */}
      {activeProject && result && (
        <div className="flex flex-col min-h-screen">
          {/* Header */}
          <div className="px-10 py-4 flex items-center justify-between gap-6 border-b border-gray-800">
            <Logo />
            <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <p className="text-sm text-gray-300 truncate font-medium">{activeProject.name}</p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{(result.totalDistance / 1000).toFixed(1)} km</span>
                <span className="text-gray-700">·</span>
                <span>+{Math.round(result.totalGain)} m</span>
                <span className="text-gray-700">·</span>
                <span>-{Math.round(result.totalLoss)} m</span>
              </div>
            </div>
            <button
              onClick={() => setPickerOpen(true)}
              className="text-sm text-gray-500 hover:text-gray-200 underline shrink-0"
            >
              Mes projets
            </button>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)} className="flex flex-col flex-1">
            <div className="px-10 border-b border-gray-800">
              <TabsList className="h-auto bg-transparent p-0 gap-1 rounded-none">
                {TABS.map(tab => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="px-4 py-3 text-sm font-medium border-b-2 rounded-none -mb-px transition-colors data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-gray-300 data-[state=active]:text-gray-100 border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="px-10 py-6 pb-10 flex flex-col gap-6">
              <TabsContent value="pentes" className="mt-0 flex flex-col gap-6">
                <SummaryStats result={result} />
                <ElevationProfile
                  sections={result.sections}
                  profilePoints={result.profilePoints}
                  slopeHexFn={dynamicSlopeHex}
                />
                <div>
                  <button
                    onClick={() => setShowThresholdConfig(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    <svg
                      className={`w-3 h-3 transition-transform ${showThresholdConfig ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    Configurer les seuils de pentes
                  </button>
                  {showThresholdConfig && (
                    <div className="mt-3">
                      <SlopeThresholdSlider
                        thresholds={thresholds}
                        onChange={setThresholds}
                        uphillColors={uphillColors}
                        downhillColors={downhillColors}
                      />
                    </div>
                  )}
                </div>
                <DistributionChart
                  uphillBuckets={uphillBuckets}
                  downhillBuckets={downhillBuckets}
                />
              </TabsContent>

              <TabsContent value="course-marche" className="mt-0">
                <RunWalkAnalysis sections={result.sections} profilePoints={result.profilePoints} />
              </TabsContent>

              <TabsContent value="simulateur" className="mt-0">
                <GapSimulator
                  sections={result.sections}
                  profilePoints={result.profilePoints}
                  totalDistance={result.totalDistance}
                  slopeHexFn={dynamicSlopeHex}
                />
              </TabsContent>

              <TabsContent value="ravitaillements" className="mt-0">
                <AidStationPlanner
                  key={activeProject.id}
                  sections={result.sections}
                  profilePoints={result.profilePoints}
                  totalDistance={result.totalDistance}
                  slopeHexFn={dynamicSlopeHex}
                  initialNutritionState={activeProject}
                  onNutritionStateChange={handleNutritionStateChange}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      )}

      {/* Project picker dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 max-w-xl w-full">
          <DialogHeader>
            <DialogTitle className="text-gray-100">Mes projets</DialogTitle>
          </DialogHeader>
          <ProjectPicker
            projects={projects}
            activeProjectId={activeProject?.id}
            onOpen={handleOpen}
            onNew={handleFile}
            onRename={renameProject}
            onDelete={deleteProject}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
