import {
	MousePointerClick,
	Pencil,
	Printer,
	RotateCcw,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Slider } from "@/components/ui/slider";
import {
	DEFAULT_GAP_PACE,
	PACE_SLIDER_MAX,
	PACE_SLIDER_MIN,
	formatPace,
	formatTime,
	gapPaceFromTime,
	parseDuration,
	simulateGap,
} from "../lib/gap-calculation";
import type {
	AidStation,
	FoodItem,
	LegNutritionPlan,
	NutritionMode,
	NutritionPlacements,
	NutritionState,
	PlacedFoodItem,
	ProfilePoint,
	Section,
} from "../types";
import { FoodLibrary } from "./aid-station/food-library";
import { LegNutritionPanel } from "./aid-station/leg-nutrition-panel";
import { NutritionRateChart } from "./aid-station/nutrition-rate-chart";
import type { CaffeineIntake } from "./aid-station/nutrition-utils";
import {
	computeCaffeineTimeline,
	computeLegBoundaries,
	computeLegNutrition,
	computeNutritionFromPlacements,
	foodIconSrc,
	getDefaultFoodLibrary,
	migrateLegPlanToPlacements,
	migratePlacementsToLegPlan,
} from "./aid-station/nutrition-utils";
import { computeRollingRate } from "./aid-station/rate-utils";

interface Props {
	initialNutritionState?: NutritionState;
	onNutritionStateChange?: (state: NutritionState) => void;
	profilePoints: ProfilePoint[];
	sections: Section[];
	slopeHexFn: (slope: number) => string;
	totalDistance: number;
}

interface HoverState {
	distM: number;
	elevation: number;
	slope: number;
	svgX: number;
}

interface Leg {
	cumulativeTime: number;
	distance: number;
	elevGain: number;
	elevLoss: number;
	fromDist: number;
	fromName: string;
	time: number;
	toDist: number;
	toName: string;
}

const PAD_LEFT = 16;
const PAD_RIGHT = 24;
const PAD_TOP = 30;
const VIEW_W = 800;
const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = 72;
const FOOD_LANE_H = 44;
const FOOD_ICON_SIZE = 22;
const FOOD_LANE_Y = PAD_TOP + CHART_H + 4;
const STATS_LANE_H = 80;
const STATS_LANE_Y_ADVANCED = FOOD_LANE_Y + FOOD_LANE_H + 4;
const STATS_LANE_Y_NORMAL = PAD_TOP + CHART_H + 4;
const X_LABEL_Y_ADVANCED = STATS_LANE_Y_ADVANCED + STATS_LANE_H + 2;
const X_LABEL_Y_NORMAL = STATS_LANE_Y_NORMAL + STATS_LANE_H + 2;
const VIEW_H_PROFILE_ADVANCED = X_LABEL_Y_ADVANCED + 14 + 16;
const VIEW_H_PROFILE_NORMAL = X_LABEL_Y_NORMAL + 14 + 16;


function formatDuration(secs: number): string {
	const h = Math.floor(secs / 3600);
	const m = Math.floor((secs % 3600) / 60);
	return `${h}:${String(m).padStart(2, "0")}`;
}

function computeLegs(
	sections: Section[],
	profilePoints: ProfilePoint[],
	aidStations: AidStation[],
	totalDistance: number,
	gapPace: number,
): Leg[] {
	const { boundaries, sorted } = computeLegBoundaries(aidStations, totalDistance);
	const names = ["Départ", ...sorted.map((s) => s.name), "Arrivée"];

	const legs: Leg[] = [];
	let cumulativeTime = 0;

	for (let i = 0; i < boundaries.length - 1; i++) {
		const from = boundaries[i];
		const to = boundaries[i + 1];

		const legSections: Section[] = [];
		let elevGain = 0;
		let elevLoss = 0;

		for (let j = 0; j < sections.length; j++) {
			const secStart = profilePoints[j].cumulativeDistance;
			const secEnd = (profilePoints[j + 1] ?? profilePoints[j])
				.cumulativeDistance;
			const mid = (secStart + secEnd) / 2;
			if (mid >= from && mid < to) {
				legSections.push(sections[j]);
				elevGain += sections[j].elevationGain;
				elevLoss += sections[j].elevationLoss;
			}
		}

		const sim = simulateGap(legSections, gapPace);
		cumulativeTime += sim.totalTime;

		legs.push({
			fromName: names[i],
			toName: names[i + 1],
			fromDist: from,
			toDist: to,
			distance: to - from,
			elevGain,
			elevLoss,
			time: sim.totalTime,
			cumulativeTime,
		});
	}

	return legs;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex by nature
export function AidStationPlanner({
	sections,
	profilePoints,
	totalDistance,
	slopeHexFn,
	initialNutritionState,
	onNutritionStateChange,
}: Props) {
	const [aidStations, setAidStations] = useState<AidStation[]>(
		() => initialNutritionState?.aidStations ?? [],
	);
	const mode = initialNutritionState?.paceSettings.mode ?? "vap";
	const [sliderPace, setSliderPace] = useState(
		() => initialNutritionState?.paceSettings.sliderPace ?? DEFAULT_GAP_PACE,
	);
	const [durationInput, setDurationInput] = useState(
		() => initialNutritionState?.paceSettings.durationInput ?? "",
	);
	const [hover, setHover] = useState<HoverState | null>(null);
	const [dragId, setDragId] = useState<string | null>(null);
	const [hoveredWarningLegIdx, setHoveredWarningLegIdx] = useState<
		number | null
	>(null);
	const [foodLibraryTrigger, setFoodLibraryTrigger] = useState(0);
	const [carbsPerHour, setCarbsPerHour] = useState(
		() => initialNutritionState?.hourlyTargets.carbsPerHour ?? 60,
	);
	const [waterPerHour, setWaterPerHour] = useState(
		() => initialNutritionState?.hourlyTargets.waterPerHour ?? 500,
	);
	const [sodiumPerHour, setSodiumPerHour] = useState(
		() => initialNutritionState?.hourlyTargets.sodiumPerHour ?? 500,
	);
	const [bodyWeightKg, setBodyWeightKg] = useState(
		() => initialNutritionState?.bodyWeightKg ?? 70,
	);
	const [selectedLegIdx, setSelectedLegIdx] = useState<number | null>(null);
	const [hoveredLegIdx, setHoveredLegIdx] = useState<number | null>(null);
	const [hasClickedLeg, setHasClickedLeg] = useState(false);
	const [foodLibrary, setFoodLibrary] = useState<FoodItem[]>(
		() => initialNutritionState?.foodLibrary ?? getDefaultFoodLibrary(),
	);
	const [nutritionPlacements, setNutritionPlacements] =
		useState<NutritionPlacements>(
			() => initialNutritionState?.nutritionPlacements ?? [],
		);
	const [timeOverrides, setTimeOverrides] = useState<Record<string, number>>(
		() => initialNutritionState?.timeOverrides ?? {},
	);
	const [armedFoodId, setArmedFoodId] = useState<string | null>(null);
	const [showAddStation, setShowAddStation] = useState(false);
	const [addStationKm, setAddStationKm] = useState("");
	const [addStationName, setAddStationName] = useState("");
	const [editingStationId, setEditingStationId] = useState<string | null>(null);
	const [inlineEditingStationId, setInlineEditingStationId] = useState<
		string | null
	>(null);
	const [dragFoodId, setDragFoodId] = useState<string | null>(null);
	const [hoveredFoodId, setHoveredFoodId] = useState<string | null>(null);
	const [dragOverChart, setDragOverChart] = useState<{
		svgX: number;
		distM: number;
	} | null>(null);
	const [selectedFoodPlacementId, setSelectedFoodPlacementId] = useState<
		string | null
	>(null);
	const [nutritionMode, setNutritionMode] = useState<NutritionMode>(
		() => initialNutritionState?.nutritionMode ?? "normal",
	);
	const [legNutritionPlan, setLegNutritionPlan] = useState<LegNutritionPlan>(
		() => initialNutritionState?.legNutritionPlan ?? {},
	);
	const [legNotes, setLegNotes] = useState<Record<string, string>>(
		() => initialNutritionState?.legNotes ?? {},
	);
	const [pendingMode, setPendingMode] = useState<NutritionMode | null>(null);

	const isFirstRender = useRef(true);
	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false;
			return;
		}
		onNutritionStateChange?.({
			aidStations,
			nutritionPlacements,
			foodLibrary,
			hourlyTargets: { carbsPerHour, waterPerHour, sodiumPerHour },
			timeOverrides,
			paceSettings: { mode, sliderPace, durationInput },
			bodyWeightKg,
			nutritionMode,
			legNutritionPlan,
			legNotes,
		});
	}, [
		aidStations,
		nutritionPlacements,
		foodLibrary,
		carbsPerHour,
		waterPerHour,
		sodiumPerHour,
		timeOverrides,
		sliderPace,
		durationInput,
		bodyWeightKg,
		nutritionMode,
		legNutritionPlan,
		legNotes,
		onNutritionStateChange,
	]);
	const [confirmDeleteStationId, setConfirmDeleteStationId] = useState<
		string | null
	>(null);
	const [activeNutritionChart, setActiveNutritionChart] = useState<
		"carbs" | "water" | "sodium" | "caffeine"
	>("carbs");
	const [editingStationName, setEditingStationName] = useState(false);
	const svgRef = useRef<SVGSVGElement>(null);
	const svgContainerRef = useRef<HTMLDivElement>(null);
	const didDragRef = useRef(false);
	const markerDragStartXRef = useRef(0);
	const foodDragMovedRef = useRef(false);
	const durationFocused = useRef(false);
	const printRef = useRef<HTMLDivElement>(null);
	const handlePrint = useReactToPrint({ contentRef: printRef });
	const [printOptions, setPrintOptions] = useState({
		chart: true,
		summary: true,
	});

	// Constantes SVG dépendantes du mode
	const STATS_LANE_Y =
		nutritionMode === "advanced" ? STATS_LANE_Y_ADVANCED : STATS_LANE_Y_NORMAL;
	const X_LABEL_Y =
		nutritionMode === "advanced" ? X_LABEL_Y_ADVANCED : X_LABEL_Y_NORMAL;
	const VIEW_H_PROFILE =
		nutritionMode === "advanced"
			? VIEW_H_PROFILE_ADVANCED
			: VIEW_H_PROFILE_NORMAL;

	function handleLegAddFood(legIdx: number, foodItemId: string) {
		const key = legKey(legIdx);
		setLegNutritionPlan((prev) => {
			const assignments = [...(prev[key] ?? [])];
			const existing = assignments.find((a) => a.foodItemId === foodItemId);
			if (existing) {
				return {
					...prev,
					[key]: assignments.map((a) =>
						a.foodItemId === foodItemId
							? { ...a, quantity: a.quantity + 1 }
							: a,
					),
				};
			}
			return { ...prev, [key]: [...assignments, { foodItemId, quantity: 1 }] };
		});
	}

	function handleLegRemoveFood(legIdx: number, foodItemId: string) {
		const key = legKey(legIdx);
		setLegNutritionPlan((prev) => {
			const assignments = (prev[key] ?? [])
				.map((a) =>
					a.foodItemId === foodItemId ? { ...a, quantity: a.quantity - 1 } : a,
				)
				.filter((a) => a.quantity > 0);
			return { ...prev, [key]: assignments };
		});
	}

	function confirmModeSwitch() {
		if (!pendingMode) return;
		if (pendingMode === "advanced") {
			setNutritionPlacements(
				migrateLegPlanToPlacements(
					legNutritionPlan,
					aidStations,
					totalDistance,
				),
			);
		} else {
			setLegNutritionPlan(
				migratePlacementsToLegPlan(
					nutritionPlacements,
					aidStations,
					totalDistance,
				),
			);
		}
		setNutritionMode(pendingMode);
		setPendingMode(null);
	}

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setArmedFoodId(null);
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const durationInvalid =
		durationInput.length > 0 && parseDuration(durationInput) === null;

	const gapPace = sliderPace;

	const legs = useMemo(() => {
		if (!gapPace) {
			return [];
		}
		return computeLegs(
			sections,
			profilePoints,
			aidStations,
			totalDistance,
			gapPace,
		);
	}, [sections, profilePoints, aidStations, totalDistance, gapPace]);

	const effectiveLegs = useMemo(() => {
		if (legs.length === 0) {
			return legs;
		}
		const sorted = [...aidStations].sort(
			(a, b) => a.distanceFromStart - b.distanceFromStart,
		);
		const withTimes = legs.map((leg, i) => {
			const key = i === 0 ? "depart" : (sorted[i - 1]?.id ?? `leg_${i}`);
			return { ...leg, time: timeOverrides[key] ?? leg.time };
		});
		let cum = 0;
		return withTimes.map((leg) => {
			cum += leg.time;
			return { ...leg, cumulativeTime: cum };
		});
	}, [legs, timeOverrides, aidStations]);

	// --- Coordinate helpers ---
	const elevations = profilePoints.map((p) => p.elevation);
	const rawMin = Math.min(...elevations);
	const rawMax = Math.max(...elevations);
	const eleRange = Math.max(rawMax - rawMin, 50);
	const eleMargin = eleRange * 0.1;
	const yMin = rawMin - eleMargin;
	const yMax = rawMax + eleMargin;
	const yRange = yMax - yMin;

	function toX(distM: number) {
		return PAD_LEFT + (distM / totalDistance) * CHART_W;
	}
	function toY(ele: number) {
		return PAD_TOP + CHART_H - ((ele - yMin) / yRange) * CHART_H;
	}
	function svgXToDist(svgX: number): number {
		return ((svgX - PAD_LEFT) / CHART_W) * totalDistance;
	}
	function getClientSvgX(e: React.MouseEvent): number {
		const svg = svgRef.current;
		if (!svg) {
			return PAD_LEFT;
		}
		const rect = svg.getBoundingClientRect();
		const relX = e.clientX - rect.left;
		return Math.max(
			PAD_LEFT,
			Math.min(VIEW_W - PAD_RIGHT, (relX / rect.width) * VIEW_W),
		);
	}

	function clientXToSvgX(clientX: number): number {
		const svg = svgRef.current;
		if (!svg) {
			return PAD_LEFT;
		}
		const rect = svg.getBoundingClientRect();
		const relX = clientX - rect.left;
		return Math.max(
			PAD_LEFT,
			Math.min(VIEW_W - PAD_RIGHT, (relX / rect.width) * VIEW_W),
		);
	}

	// --- Elevation profile rendering ---
	const colorGroups: { color: string; start: number; end: number }[] = [];
	for (let i = 0; i < sections.length; i++) {
		const color = slopeHexFn(sections[i].slope);
		const last = colorGroups.at(-1);
		if (last && last.color === color) {
			last.end = i;
		} else {
			colorGroups.push({ color, start: i, end: i });
		}
	}

	// Segments de ligne colorés par pente (remplace l'ancien outline uniforme)
	const coloredLines = colorGroups.map((g, _gi) => {
		const pts = profilePoints.slice(g.start, g.end + 2);
		if (pts.length < 2) {
			return null;
		}
		const points = pts
			.map((p) => `${toX(p.cumulativeDistance)},${toY(p.elevation)}`)
			.join(" ");
		return (
			<polyline
				fill="none"
				key={`${g.color}-${g.start}`}
				points={points}
				stroke={g.color}
				strokeLinejoin="round"
				strokeWidth={3}
			/>
		);
	});

	const totalKm = totalDistance / 1000;
	let kmStep: number;
	if (totalKm <= 2) {
		kmStep = 0.5;
	} else if (totalKm <= 6) {
		kmStep = 1;
	} else if (totalKm <= 15) {
		kmStep = 2;
	} else if (totalKm <= 30) {
		kmStep = 5;
	} else {
		kmStep = 10;
	}
	const xTicks: number[] = [];
	for (let km = 0; km <= totalKm + 0.001; km += kmStep) {
		xTicks.push(km * 1000);
	}

	// --- Hover logic ---
	function getSectionAtDist(distM: number): number {
		let idx = sections.length - 1;
		for (let i = 0; i < profilePoints.length - 1; i++) {
			if (distM <= profilePoints[i + 1].cumulativeDistance) {
				idx = i;
				break;
			}
		}
		return idx;
	}

	function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
		const svgX = getClientSvgX(e);
		const distM = Math.max(0, Math.min(totalDistance, svgXToDist(svgX)));

		if (dragFoodId) {
			foodDragMovedRef.current = true;
			didDragRef.current = true;
			setNutritionPlacements((prev) =>
				prev.map((p) =>
					p.id === dragFoodId ? { ...p, distanceFromStart: distM } : p,
				),
			);
			return;
		}

		if (dragId) {
			didDragRef.current = true;
			const sorted = [...aidStations].sort(
				(a, b) => a.distanceFromStart - b.distanceFromStart,
			);
			const idx = sorted.findIndex((s) => s.id === dragId);
			const prevDist = idx > 0 ? sorted[idx - 1].distanceFromStart : 0;
			const nextDist =
				idx < sorted.length - 1
					? sorted[idx + 1].distanceFromStart
					: totalDistance;
			const MIN_GAP = 200;
			const clamped = Math.max(
				prevDist + MIN_GAP,
				Math.min(nextDist - MIN_GAP, distM),
			);
			setAidStations((prev) =>
				prev.map((s) =>
					s.id === dragId ? { ...s, distanceFromStart: clamped } : s,
				),
			);
			return;
		}

		// N'afficher la bulle que si la souris est sur la zone du profil altimétrique
		const svgRect = svgRef.current?.getBoundingClientRect();
		if (svgRect) {
			const relY = e.clientY - svgRect.top;
			const svgY = (relY / svgRect.height) * VIEW_H_PROFILE;
			if (svgY < PAD_TOP || svgY > PAD_TOP + CHART_H) {
				setHover(null);
				return;
			}
		}

		const idx = getSectionAtDist(distM);
		const p1 = profilePoints[idx];
		const p2 = profilePoints[idx + 1] ?? p1;
		const span = p2.cumulativeDistance - p1.cumulativeDistance;
		const t = span > 0 ? (distM - p1.cumulativeDistance) / span : 0;
		const elevation = p1.elevation + t * (p2.elevation - p1.elevation);
		setHover({ svgX, distM, elevation, slope: sections[idx]?.slope ?? 0 });
	}

	function handleMouseLeave() {
		if (!(dragId || dragFoodId)) {
			setHover(null);
		}
		setDragId(null);
		setDragFoodId(null);
	}

	function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
		if (e.button !== 0) {
			return;
		}
		// Drag is initiated from marker circles via their onMouseDown
		// Here we just reset the didDrag flag
		didDragRef.current = false;
	}

	function handleMouseUp(e: React.MouseEvent<SVGSVGElement>) {
		if (dragFoodId) {
			setDragFoodId(null);
			didDragRef.current = false;
			return;
		}
		if (dragId) {
			const clickedId = dragId;
			const svgX = getClientSvgX(e);
			const moved = Math.abs(svgX - markerDragStartXRef.current);
			setDragId(null);
			didDragRef.current = false;
			if (moved < 5) {
				setEditingStationId((prev) => (prev === clickedId ? null : clickedId));
			}
			return;
		}
		if (didDragRef.current) {
			didDragRef.current = false;
			return;
		}

		const svgX = getClientSvgX(e);
		const distM = Math.max(0, Math.min(totalDistance, svgXToDist(svgX)));

		// Place un aliment armé
		if (armedFoodId) {
			const newPlacement: PlacedFoodItem = {
				id: crypto.randomUUID(),
				foodItemId: armedFoodId,
				distanceFromStart: distM,
			};
			setNutritionPlacements((prev) => [...prev, newPlacement]);
			return;
		}

		// Place un ravito en cliquant sur le graphique
		if (showAddStation && distM > 0 && distM < totalDistance) {
			const autoName = `Ravito ${aidStations.length + 1}`;
			const newStation: AidStation = {
				id: crypto.randomUUID(),
				distanceFromStart: distM,
				name: addStationName.trim() || autoName,
			};
			setAidStations((prev) =>
				[...prev, newStation].sort(
					(a, b) => a.distanceFromStart - b.distanceFromStart,
				),
			);
			setAddStationKm("");
			setAddStationName("");
			setShowAddStation(false);
			return;
		}
	}

	function handleMarkerMouseDown(e: React.MouseEvent, id: string) {
		e.stopPropagation();
		markerDragStartXRef.current = getClientSvgX(
			e as unknown as React.MouseEvent<SVGSVGElement>,
		);
		didDragRef.current = false;
		setDragId(id);
	}

	function confirmAddStation() {
		const km = Number.parseFloat(addStationKm.replace(",", "."));
		if (Number.isNaN(km)) {
			return;
		}
		const distM = km * 1000;
		if (distM <= 0 || distM >= totalDistance) {
			return;
		}
		const autoName = `Ravito ${aidStations.length + 1}`;
		const newStation: AidStation = {
			id: crypto.randomUUID(),
			distanceFromStart: distM,
			name: addStationName.trim() || autoName,
		};
		setAidStations((prev) =>
			[...prev, newStation].sort(
				(a, b) => a.distanceFromStart - b.distanceFromStart,
			),
		);
		setAddStationKm("");
		setAddStationName("");
		setShowAddStation(false);
	}

	function updateStationDistance(id: string, km: string) {
		const dist = Number.parseFloat(km.replace(",", ".")) * 1000;
		if (Number.isNaN(dist) || dist <= 0 || dist >= totalDistance) {
			return;
		}
		setAidStations((prev) =>
			prev
				.map((s) => (s.id === id ? { ...s, distanceFromStart: dist } : s))
				.sort((a, b) => a.distanceFromStart - b.distanceFromStart),
		);
	}

	function handleFoodIconMouseDown(e: React.MouseEvent, placementId: string) {
		e.stopPropagation();
		foodDragMovedRef.current = false;
		didDragRef.current = true;
		setDragFoodId(placementId);
	}

	function deleteStation(id: string) {
		setAidStations((prev) => {
			const filtered = prev.filter((s) => s.id !== id);
			// Renumber names of remaining stations
			return filtered
				.sort((a, b) => a.distanceFromStart - b.distanceFromStart)
				.map((s, i) => ({
					...s,
					name: s.name.startsWith("Ravito ") ? `Ravito ${i + 1}` : s.name,
				}));
		});
	}

	function updateStationName(id: string, name: string) {
		setAidStations((prev) =>
			prev.map((s) => (s.id === id ? { ...s, name } : s)),
		);
	}

	const sortedStations = [...aidStations].sort(
		(a, b) => a.distanceFromStart - b.distanceFromStart,
	);

	function setTimeOverride(key: string, raw: string) {
		const secs = parseDuration(raw);
		if (secs !== null && secs > 0) {
			setTimeOverrides((prev) => ({ ...prev, [key]: secs }));
		}
	}

	function resetTimeOverride(key: string) {
		setTimeOverrides((prev) => {
			const next = { ...prev };
			delete next[key];
			return next;
		});
	}

	function legKey(legIdx: number): string {
		return legIdx === 0
			? "depart"
			: (sortedStations[legIdx - 1]?.id ?? `leg_${legIdx}`);
	}

	function placementsForLeg(legIdx: number): PlacedFoodItem[] {
		const leg = effectiveLegs[legIdx];
		if (!leg) {
			return [];
		}
		return nutritionPlacements.filter(
			(p) =>
				p.distanceFromStart >= leg.fromDist && p.distanceFromStart < leg.toDist,
		);
	}

	function removePlacement(placementId: string) {
		setNutritionPlacements((prev) => prev.filter((p) => p.id !== placementId));
	}

	/** Convertit une distance en temps (secondes) par interpolation linéaire dans les tronçons */
	const distanceToTime = useCallback(
		(dist: number): number => {
			for (const leg of effectiveLegs) {
				if (dist >= leg.fromDist && dist <= leg.toDist) {
					const legProgress =
						leg.distance > 0 ? (dist - leg.fromDist) / leg.distance : 0;
					return leg.cumulativeTime - leg.time + legProgress * leg.time;
				}
			}
			return effectiveLegs.at(-1)?.cumulativeTime ?? 0;
		},
		[effectiveLegs],
	);

	let profileCursor: string;
	if (dragId || dragFoodId) {
		profileCursor = "grabbing";
	} else if (armedFoodId) {
		profileCursor = "cell";
	} else if (showAddStation) {
		profileCursor = "copy";
	} else {
		profileCursor = "crosshair";
	}
	const tooltipOnLeft = hover ? hover.svgX > VIEW_W / 2 : false;

	const totalTime = effectiveLegs.reduce((s, l) => s + l.time, 0);

	// Sync duration input from slider when user isn't typing in the field
	useEffect(() => {
		if (!durationFocused.current && totalTime > 0) {
			setDurationInput(formatTime(totalTime));
		}
	}, [totalTime]);

	// --- Caffeine timeline ---
	const { caffeineTimeline, caffeineIntakes, maxCaffeineConc } = useMemo(() => {
		// Chaque aliment avec caféine contribue au moment de sa position sur le parcours
		const richIntakes = nutritionPlacements
			.map((p) => {
				const item = foodLibrary.find((f) => f.id === p.foodItemId);
				if (!item || item.caffeineMg <= 0) {
					return null;
				}
				return {
					timeH: distanceToTime(p.distanceFromStart) / 3600,
					doseMg: item.caffeineMg,
					placementId: p.id,
					item,
				};
			})
			.filter(
				(
					x,
				): x is {
					timeH: number;
					doseMg: number;
					placementId: string;
					item: FoodItem;
				} => x !== null,
			);
		const intakesForModel: CaffeineIntake[] = richIntakes.map((i) => ({
			timeH: i.timeH,
			doseMg: i.doseMg,
		}));
		const totalTimeH = totalTime / 3600;
		const timeline = computeCaffeineTimeline(intakesForModel, totalTimeH);
		const maxConc =
			timeline.length > 0
				? Math.max(...timeline.map((p) => p.concentrationMg))
				: 0;
		// Y axis must show at least up to 6 mg/kg threshold
		const t6 = 6 * bodyWeightKg;
		const dataMax = Math.max(maxConc, t6 * 1.15);
		let step: number;
		if (dataMax <= 50) {
			step = 10;
		} else if (dataMax <= 200) {
			step = 50;
		} else {
			step = 100;
		}
		const niceMax = Math.ceil(dataMax / step) * step || step;
		return {
			caffeineTimeline: timeline,
			caffeineIntakes: richIntakes,
			maxCaffeineConc: niceMax,
		};
	}, [
		nutritionPlacements,
		foodLibrary,
		totalTime,
		bodyWeightKg,
		distanceToTime,
	]);

	// --- Rate timelines (glucides, eau, sodium) ---
	const {
		carbsTimeline,
		carbsMarkers,
		maxCarbsRate,
		waterTimeline,
		waterMarkers,
		maxWaterRate,
		sodiumTimeline,
		sodiumMarkers,
		maxSodiumRate,
	} = useMemo(() => {
		const totalTimeH = totalTime / 3600;
		interface RichIntake {
			amount: number;
			item: FoodItem;
			placementId: string;
			timeH: number;
		}
		const carbsIntakes: RichIntake[] = [];
		const waterIntakes: RichIntake[] = [];
		const sodiumIntakes: RichIntake[] = [];
		for (const p of nutritionPlacements) {
			const item = foodLibrary.find((f) => f.id === p.foodItemId);
			if (!item) {
				continue;
			}
			const tH = distanceToTime(p.distanceFromStart) / 3600;
			if (item.carbsG > 0) {
				carbsIntakes.push({
					timeH: tH,
					amount: item.carbsG,
					placementId: p.id,
					item,
				});
			}
			if (item.waterMl > 0) {
				waterIntakes.push({
					timeH: tH,
					amount: item.waterMl,
					placementId: p.id,
					item,
				});
			}
			if (item.sodiumMg > 0) {
				sodiumIntakes.push({
					timeH: tH,
					amount: item.sodiumMg,
					placementId: p.id,
					item,
				});
			}
		}
		function fixedMax(target: number): number {
			const base = target * 2;
			let step: number;
			if (base <= 100) {
				step = 20;
			} else if (base <= 500) {
				step = 50;
			} else if (base <= 2000) {
				step = 100;
			} else {
				step = 500;
			}
			return Math.ceil(base / step) * step || step;
		}
		function toMarker(i: RichIntake, label: string) {
			return {
				timeH: i.timeH,
				label,
				placementId: i.placementId,
				foodName: i.item.name,
				carbsG: i.item.carbsG || undefined,
				waterMl: i.item.waterMl || undefined,
				sodiumMg: i.item.sodiumMg || undefined,
				caffeineMg: i.item.caffeineMg || undefined,
			};
		}
		const carbsRate = computeRollingRate(carbsIntakes, totalTimeH);
		const waterRate = computeRollingRate(waterIntakes, totalTimeH);
		const sodiumRate = computeRollingRate(sodiumIntakes, totalTimeH);
		return {
			carbsTimeline: carbsRate.map((p) => ({ timeH: p.timeH, value: p.rate })),
			carbsMarkers: carbsIntakes.map((i) =>
				toMarker(i, `${Math.round(i.amount)}g`),
			),
			maxCarbsRate: fixedMax(carbsPerHour),
			waterTimeline: waterRate.map((p) => ({ timeH: p.timeH, value: p.rate })),
			waterMarkers: waterIntakes.map((i) =>
				toMarker(i, `${Math.round(i.amount)}mL`),
			),
			maxWaterRate: fixedMax(waterPerHour),
			sodiumTimeline: sodiumRate.map((p) => ({
				timeH: p.timeH,
				value: p.rate,
			})),
			sodiumMarkers: sodiumIntakes.map((i) =>
				toMarker(i, `${Math.round(i.amount)}mg`),
			),
			maxSodiumRate: fixedMax(sodiumPerHour),
		};
	}, [
		nutritionPlacements,
		foodLibrary,
		totalTime,
		carbsPerHour,
		waterPerHour,
		sodiumPerHour,
		distanceToTime,
	]);

	// Station pending delete (for AlertDialog)
	const stationToDelete = confirmDeleteStationId
		? (sortedStations.find((s) => s.id === confirmDeleteStationId) ?? null)
		: null;

	if (profilePoints.length < 2) {
		return null;
	}

	return (
		<div className="flex flex-col gap-5 rounded-xl border border-gray-700 bg-gray-900 p-6">
			<h2 className="font-semibold text-base text-gray-200">Plan de course</h2>

			{/* Contrôles — ligne unique */}
			<p className="font-medium text-[10px] text-gray-600 uppercase tracking-widest">
				Paramètres
			</p>
			<div className="flex flex-wrap items-start gap-6">
				{/* VAP / Durée */}
				<div className="flex flex-col gap-2">
					<div className="flex w-72 flex-col gap-2">
						{/* VAP */}
						<div className="flex flex-col gap-1.5">
							<div className="flex items-center justify-between">
								<span className="text-gray-500 text-xs">VAP cible</span>
								<span className="font-semibold text-gray-100 text-sm">
									{formatPace(sliderPace)}
									<span className="font-normal text-gray-500 text-xs">
										{" "}
										/km
									</span>
								</span>
							</div>
							<Slider
								className="w-full"
								max={PACE_SLIDER_MAX}
								min={PACE_SLIDER_MIN}
								onValueChange={(vals) => setSliderPace(vals[0])}
								step={5}
								value={[sliderPace]}
							/>
							<div className="flex justify-between text-[10px] text-gray-700">
								<span>{formatPace(PACE_SLIDER_MIN)}/km</span>
								<span>{formatPace(PACE_SLIDER_MAX)}/km</span>
							</div>
						</div>

						{/* Durée liée */}
						<div className="flex items-center justify-between">
							<span className="text-gray-500 text-xs">Durée totale</span>
							<Input
								className={[
									"h-auto w-24 border bg-gray-800 py-1 text-right font-bold text-gray-100 text-lg",
									durationInvalid
										? "border-red-700 focus-visible:ring-red-500"
										: "border-gray-700",
								].join(" ")}
								id="duration-input"
								maxLength={10}
								onBlur={() => {
									durationFocused.current = false;
								}}
								onChange={(e) => {
									setDurationInput(e.target.value);
									const parsed = parseDuration(e.target.value);
									if (parsed) {
										setSliderPace(
											Math.round(
												Math.max(
													PACE_SLIDER_MIN,
													Math.min(
														PACE_SLIDER_MAX,
														gapPaceFromTime(sections, parsed),
													),
												),
											),
										);
									}
								}}
								onFocus={() => {
									durationFocused.current = true;
								}}
								placeholder="—"
								type="text"
								value={durationInput}
							/>
						</div>
					</div>
				</div>

				{/* Séparateur */}
				<div className="self-stretch w-px bg-gray-800" />

				{/* Objectifs nutrition */}
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-3">
						<span className="text-gray-600 text-xs uppercase tracking-wide">
							Nutrition
						</span>
	{/* Mode switcher masqué — mode avancé en cours de développement */}
					</div>
					<div className="flex flex-wrap items-center gap-0 divide-x divide-gray-800">
						{[
							{
								label: "Glucides",
								value: carbsPerHour,
								onChange: setCarbsPerHour,
								unit: "g/h",
								min: 30,
								max: 120,
								step: 5,
							},
							{
								label: "Eau",
								value: waterPerHour,
								onChange: setWaterPerHour,
								unit: "mL/h",
								min: 100,
								max: 1500,
								step: 50,
							},
							{
								label: "Sodium",
								value: sodiumPerHour,
								onChange: setSodiumPerHour,
								unit: "mg/h",
								min: 100,
								max: 1500,
								step: 50,
							},
						].map(({ label, value, onChange, unit, min, max, step }) => (
							<div
								className="flex items-center gap-1.5 px-3 first:pl-0 last:pr-0"
								key={label}
							>
								<span className="text-gray-400 text-sm">{label}</span>
								<NumberStepper
									inputClassName="w-16"
									max={max}
									min={min}
									onChange={onChange}
									step={step}
									unit={unit}
									value={value}
								/>
							</div>
						))}
						{nutritionMode === "advanced" && (
							<div className="flex items-center gap-1.5 px-3">
								<span className="text-gray-400 text-sm">Poids</span>
								<NumberStepper
									inputClassName="w-14"
									max={150}
									min={30}
									onChange={setBodyWeightKg}
									step={1}
									unit="kg"
									value={bodyWeightKg}
								/>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Séparateur haut */}
			<div className="border-t border-gray-800" />
			<p className="font-medium text-[10px] text-gray-600 uppercase tracking-widest">
				Planification
			</p>

			{/* Zone imprimable : graphique + bilan */}
			<div ref={printRef}>
				{/* Bouton ajout ravito — au-dessus de l'encadré, aligné à droite */}
				<div className="mb-1 flex justify-end" data-print-hide="">
					{showAddStation ? (
						<div className="flex items-center gap-2">
							<span className="flex items-center gap-1 text-gray-500 text-xs">
								<MousePointerClick size={11} />
								Cliquez sur le graphique
							</span>
							<span className="text-gray-600 text-xs">ou</span>
							<form
								className="flex items-center gap-1.5"
								onSubmit={(e) => {
									e.preventDefault();
									confirmAddStation();
								}}
							>
								<div className="flex h-7 items-center overflow-hidden rounded-lg border border-gray-600 bg-gray-800">
									<input
										autoFocus
										className="w-28 border-gray-700 border-r bg-transparent px-2.5 text-gray-100 text-xs placeholder-gray-600 outline-none"
										onChange={(e) => setAddStationName(e.target.value)}
										placeholder="Nom (optionnel)"
										type="text"
										value={addStationName}
									/>
									<input
										className="w-14 bg-transparent px-2.5 text-gray-100 text-xs placeholder-gray-600 outline-none"
										onChange={(e) => setAddStationKm(e.target.value)}
										placeholder="km"
										type="text"
										value={addStationKm}
									/>
									<span className="pr-2 text-gray-500 text-[11px]">
										/ {(totalDistance / 1000).toFixed(1)} km
									</span>
								</div>
								<button
									className="h-7 rounded-lg bg-teal-700 px-2.5 font-medium text-white text-xs transition-colors hover:bg-teal-600"
									type="submit"
								>
									Ajouter
								</button>
								<button
									className="h-7 px-1.5 text-gray-500 transition-colors hover:text-gray-300"
									onClick={() => {
										setShowAddStation(false);
										setAddStationKm("");
										setAddStationName("");
									}}
									type="button"
								>
									<X size={13} />
								</button>
							</form>
						</div>
					) : (
						<button
							className="flex h-7 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800/80 px-2.5 font-medium text-gray-400 text-xs transition-colors hover:bg-gray-700 hover:text-gray-200"
							onClick={() => setShowAddStation(true)}
							type="button"
						>
							<span className="text-sm leading-none">+</span> Ravito
						</button>
					)}
				</div>

				{/* Profil altimétrique */}
				{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: drop-zone requires drag event handlers; no semantic HTML equivalent */}
				<div
					aria-label="Zone de profil altimétrique"
					className="relative"
					data-print-section="chart"
					{...(!printOptions.chart ? { "data-print-hide": "" } : {})}
					onDragLeave={
						nutritionMode === "advanced"
							? (e) => {
									if (!e.currentTarget.contains(e.relatedTarget as Node)) {
										setDragOverChart(null);
									}
								}
							: undefined
					}
					onDragOver={
						nutritionMode === "advanced"
							? (e) => {
									e.preventDefault();
									e.dataTransfer.dropEffect = "copy";
									const svgX = clientXToSvgX(e.clientX);
									const distM = Math.max(
										0,
										Math.min(totalDistance, svgXToDist(svgX)),
									);
									setDragOverChart({ svgX, distM });
								}
							: undefined
					}
					onDrop={
						nutritionMode === "advanced"
							? (e) => {
									e.preventDefault();
									const foodItemId = e.dataTransfer.getData("foodItemId");
									setDragOverChart(null);
									if (foodItemId) {
										const svgX = clientXToSvgX(e.clientX);
										const distM = Math.max(
											0,
											Math.min(totalDistance, svgXToDist(svgX)),
										);
										setNutritionPlacements((prev) => [
											...prev,
											{
												id: crypto.randomUUID(),
												foodItemId,
												distanceFromStart: distM,
											},
										]);
									}
								}
							: undefined
					}
					ref={svgContainerRef}
					role="application"
				>
					{/* Popover d'édition d'un ravito */}
					{editingStationId &&
						(() => {
							const s = sortedStations.find((st) => st.id === editingStationId);
							if (!s) {
								return null;
							}
							const leftPct = (toX(s.distanceFromStart) / VIEW_W) * 100;
							return (
								<dialog
									className="absolute top-0 z-30 -translate-y-full border-0 bg-transparent p-0 pb-1"
									open
									style={{
										left: `clamp(8px, ${leftPct}%, calc(100% - 200px))`,
									}}
								>
									<div className="flex w-52 flex-col gap-2 rounded-xl border border-gray-600 bg-gray-800 p-3 shadow-xl">
										<input
											autoFocus
											className="w-full rounded-lg border border-gray-600 bg-gray-700 px-2.5 py-1.5 text-gray-100 text-sm outline-none focus:border-gray-400"
											onChange={(e) => updateStationName(s.id, e.target.value)}
											placeholder="Nom du ravito"
											type="text"
											value={s.name}
										/>
										<div className="flex items-center gap-2">
											<input
												className="w-24 rounded-lg border border-gray-600 bg-gray-700 px-2.5 py-1.5 text-gray-100 text-sm outline-none focus:border-gray-400"
												defaultValue={(s.distanceFromStart / 1000).toFixed(1)}
												onBlur={(e) =>
													updateStationDistance(s.id, e.target.value)
												}
												onKeyDown={(e) =>
													e.key === "Enter" &&
													updateStationDistance(
														s.id,
														(e.target as HTMLInputElement).value,
													)
												}
												placeholder="km"
												type="text"
											/>
											<span className="text-gray-500 text-xs">
												/ {(totalDistance / 1000).toFixed(1)} km
											</span>
										</div>
										<div className="flex items-center justify-between pt-0.5">
											<button
												className="text-red-500 text-xs transition-colors hover:text-red-400"
												onClick={() => {
													setConfirmDeleteStationId(s.id);
													setEditingStationId(null);
												}}
												type="button"
											>
												Supprimer
											</button>
											<button
												className="text-gray-500 text-xs transition-colors hover:text-gray-300"
												onClick={() => setEditingStationId(null)}
												type="button"
											>
												Fermer
											</button>
										</div>
									</div>
									<div className="mx-auto -mt-1 h-2.5 w-2.5 rotate-45 border-gray-600 border-r border-b bg-gray-800" />
								</dialog>
							);
						})()}
					{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: interactive SVG chart; no HTML semantic alternative */}
					<svg
						aria-label="Profil altimétrique et placement des aliments"
						onClick={() => {
							if (!dragId) {
								setEditingStationId(null);
							}
							setSelectedFoodPlacementId(null);
						}}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								setEditingStationId(null);
								setSelectedFoodPlacementId(null);
							}
						}}
						onMouseDown={handleMouseDown}
						onMouseLeave={handleMouseLeave}
						onMouseMove={handleMouseMove}
						onMouseUp={handleMouseUp}
						preserveAspectRatio="xMidYMid meet"
						ref={svgRef}
						role="application"
						style={{ cursor: profileCursor, userSelect: "none" }}
						// biome-ignore lint/a11y/noNoninteractiveTabindex: SVG chart needs keyboard focus
						tabIndex={0}
						viewBox={`0 0 ${VIEW_W} ${VIEW_H_PROFILE}`}
						width="100%"
					>
						<defs>
							<clipPath id="aid-chart-area">
								<rect
									height={CHART_H}
									width={CHART_W}
									x={PAD_LEFT}
									y={PAD_TOP}
								/>
							</clipPath>
							<clipPath id="aid-food-lane">
								<rect
									height={FOOD_LANE_H}
									width={CHART_W}
									x={PAD_LEFT}
									y={FOOD_LANE_Y}
								/>
							</clipPath>
						</defs>

						{/* Zones de tronçon cliquables (sous le clip pour couvrir toute la hauteur) */}
						{effectiveLegs.map((leg, li) => {
							const x1 = toX(leg.fromDist);
							const x2 = toX(leg.toDist);
							const w = x2 - x1;
							return (
								// biome-ignore lint/a11y/noStaticElementInteractions: SVG <g> has no semantic interactive equivalent
								<g key={`leg-${leg.fromDist}-${leg.toDist}`}>
									{/* Zone de clic pleine hauteur — highlight au hover + sélection */}
									{/* biome-ignore lint/a11y/noStaticElementInteractions: clic sur zone SVG */}
									<rect
										fill={hoveredLegIdx === li ? "#ffffff" : "#ffffff"}
										fillOpacity={hoveredLegIdx === li ? 0.06 : 0}
										height={VIEW_H_PROFILE - 3}
										onClick={() => {
											setSelectedLegIdx(li === selectedLegIdx ? null : li);
											setConfirmDeleteStationId(null);
											if (!hasClickedLeg) setHasClickedLeg(true);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												setSelectedLegIdx(li === selectedLegIdx ? null : li);
												setConfirmDeleteStationId(null);
												if (!hasClickedLeg) setHasClickedLeg(true);
											}
										}}
										onMouseEnter={() => setHoveredLegIdx(li)}
										onMouseLeave={() => setHoveredLegIdx(null)}
										style={{ cursor: "pointer", transition: "fill-opacity 0.15s" }}
										tabIndex={0}
										width={w}
										x={x1}
										y={1}
									/>
									{/* Stats du tronçon dans la stats lane */}
									{w > 40 && (
										<g style={{ pointerEvents: "none" }}>
											{/* Durée (toujours si assez de place) */}
											{w > 40 && (
												<text
													fill={
														legKey(li) in timeOverrides ? "#FCD34D" : "#D0CEC8"
													}
													fontSize={11}
													fontWeight="700"
													style={{ pointerEvents: "none" }}
													textAnchor="middle"
													x={x1 + w / 2}
													y={STATS_LANE_Y + 12}
												>
													{formatTime(leg.time)}
												</text>
											)}
											{/* Distance + D+/D- */}
											{w > 72 && (
												<text
													fill="#5a5a56"
													fontSize={8.5}
													style={{ pointerEvents: "none" }}
													textAnchor="middle"
													x={x1 + w / 2}
													y={STATS_LANE_Y + 23}
												>
													{(leg.distance / 1000).toFixed(1)} km · +
													{Math.round(leg.elevGain)} / −
													{Math.round(leg.elevLoss)} m
												</text>
											)}
											{/* Icônes aliments du tronçon */}
											{w > 72 &&
												(() => {
													const key = legKey(li);
													const SLOT_W = 30;
													const ICON_SZ = 24;
													const assignments = (
														legNutritionPlan[key] ?? []
													).filter((a) =>
														foodLibrary.some((f) => f.id === a.foodItemId),
													);
													if (assignments.length === 0) return null;
													const maxSlots = Math.floor((w - 8) / SLOT_W);
													const visibleA = assignments.slice(
														0,
														maxSlots - (assignments.length > maxSlots ? 1 : 0),
													);
													const overflow = assignments.length - visibleA.length;
													const totalW =
														visibleA.length * SLOT_W +
														(overflow > 0 ? SLOT_W : 0);
													const startX = x1 + w / 2 - totalW / 2;
													const iconTop = STATS_LANE_Y + 33;
													return (
														<g style={{ pointerEvents: "none" }}>
															{visibleA.map((a, ai) => {
																const item = foodLibrary.find(
																	(f) => f.id === a.foodItemId,
																);
																if (!item) return null;
																const ix =
																	startX + ai * SLOT_W + (SLOT_W - ICON_SZ) / 2;
																return (
																	<g key={`${key}-${a.foodItemId}`}>
																		<image
																			height={ICON_SZ}
																			href={foodIconSrc(item)}
																			width={ICON_SZ}
																			x={ix}
																			y={iconTop}
																		/>
																		{a.quantity > 1 && (
																			<text
																				fill="var(--chart-foreground)"
																				fontSize={8}
																				fontWeight="800"
																				textAnchor="middle"
																				x={ix + ICON_SZ / 2}
																				y={iconTop + ICON_SZ + 9}
																			>
																				×{a.quantity}
																			</text>
																		)}
																	</g>
																);
															})}
															{overflow > 0 && (
																<text
																	fill="#5a5a56"
																	fontSize={7}
																	fontWeight="600"
																	textAnchor="middle"
																	x={
																		startX +
																		visibleA.length * SLOT_W +
																		SLOT_W / 2
																	}
																	y={iconTop + ICON_SZ - 1}
																>
																	+{overflow}
																</text>
															)}
														</g>
													);
												})()}
										</g>
									)}
									{/* Note du tronçon sur le graphique */}
									{(() => {
										const note = legNotes[legKey(li)];
										if (!note || w < 40) return null;
										const maxChars = Math.floor((w - 12) / 5.5);
										const display =
											note.length > maxChars
												? `${note.slice(0, maxChars - 1)}…`
												: note;
										return (
											<text
												fill="#6b7280"
												fontSize={7.5}
												fontStyle="italic"
												style={{ pointerEvents: "none" }}
												textAnchor="middle"
												x={x1 + w / 2}
												y={STATS_LANE_Y + STATS_LANE_H - 4}
											>
												{display}
											</text>
										);
									})()}
									{/* Indicateur nutrition insuffisante */}
									{nutritionMode === "normal" &&
										leg.time > 0 &&
										w > 14 &&
										(() => {
											const key = legKey(li);
											const assignments = legNutritionPlan[key] ?? [];
											const totals = computeLegNutrition(
												assignments,
												foodLibrary,
											);
											const hours = leg.time / 3600;
											const issues: string[] = [];
											if (
												carbsPerHour > 0 &&
												totals.carbs < Math.round(hours * carbsPerHour)
											)
												issues.push(
													`Glucides : ${totals.carbs}g / ${Math.round(hours * carbsPerHour)}g`,
												);
											if (
												waterPerHour > 0 &&
												totals.water < Math.round(hours * waterPerHour)
											)
												issues.push(
													`Eau : ${totals.water} mL / ${Math.round(hours * waterPerHour)} mL`,
												);
											if (
												sodiumPerHour > 0 &&
												totals.sodium < Math.round(hours * sodiumPerHour)
											)
												issues.push(
													`Sodium : ${totals.sodium} mg / ${Math.round(hours * sodiumPerHour)} mg`,
												);
											if (issues.length === 0) return null;
											const iconSz = 9;
											const iconX = x1 + 5;
											const iconY = STATS_LANE_Y + STATS_LANE_H - 5 - iconSz;
											const scale = iconSz / 24;
											const isHov = hoveredWarningLegIdx === li;
											const tooltipW = 158;
											const tooltipH = issues.length * 14 + 8;
											const tipAnchorX = iconX + iconSz / 2;
											const tooltipX =
												tipAnchorX + 6 + tooltipW > PAD_LEFT + CHART_W
													? tipAnchorX - tooltipW - 6
													: tipAnchorX + 6;
											const tooltipY = iconY - tooltipH - 4;
											return (
												<g>
													{/* biome-ignore lint/a11y/noStaticElementInteractions: SVG element */}
													<g
														fill="none"
														onMouseEnter={() => setHoveredWarningLegIdx(li)}
														onMouseLeave={() => setHoveredWarningLegIdx(null)}
														stroke="#f97316"
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={0.8 / scale}
														style={{ cursor: "default" }}
														transform={`translate(${iconX}, ${iconY}) scale(${scale})`}
													>
														<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
														<path d="M12 9v4" />
														<path d="M12 17h.01" />
													</g>
													{isHov && (
														<g style={{ pointerEvents: "none" }}>
															<rect
																fill="#1c1c1a"
																height={tooltipH}
																rx={4}
																stroke="#374151"
																strokeWidth={1}
																width={tooltipW}
																x={tooltipX}
																y={tooltipY}
															/>
															{issues.map((issue, ii) => (
																<text
																	fill="#d1d5db"
																	fontSize={9}
																	key={issue}
																	x={tooltipX + 8}
																	y={tooltipY + 13 + ii * 14}
																>
																	{issue}
																</text>
															))}
														</g>
													)}
												</g>
											);
										})()}
								</g>
							);
						})}

						<g clipPath="url(#aid-chart-area)">
							{coloredLines}

							{/* Lignes verticales ravitaillements */}
							{sortedStations.map((s) => (
								<line
									key={s.id}
									stroke="#E07B4F"
									strokeDasharray="6 3"
									strokeWidth={1.5}
									x1={toX(s.distanceFromStart)}
									x2={toX(s.distanceFromStart)}
									y1={PAD_TOP}
									y2={PAD_TOP + CHART_H}
								/>
							))}
						</g>

						{/* Marqueurs ravitaillements — rectangles avec nom */}
						{sortedStations.map((s) => {
							const x = toX(s.distanceFromStart);
							const isDragging = dragId === s.id;
							const isEditing = editingStationId === s.id;
							const label =
								s.name.length > 12 ? `${s.name.slice(0, 11)}…` : s.name;
							const rectW = Math.max(44, label.length * 6.5 + 14);
							const rectH = 17;
							const rectY = PAD_TOP - rectH - 3;
							let fill: string;
							if (isDragging) {
								fill = "#F0A070";
							} else if (isEditing) {
								fill = "#f4a261";
							} else {
								fill = "#E07B4F";
							}
							const isInlineEditing = inlineEditingStationId === s.id;
							return (
								// biome-ignore lint/a11y/noStaticElementInteractions: SVG <g> has no semantic interactive equivalent
								<g
									key={s.id}
									onDoubleClick={(e) => {
										e.stopPropagation();
										setInlineEditingStationId(s.id);
										setEditingStationId(null);
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											setEditingStationId((prev) =>
												prev === s.id ? null : s.id,
											);
										}
									}}
									onMouseDown={(e) => {
										if (inlineEditingStationId !== s.id)
											handleMarkerMouseDown(e, s.id);
									}}
									style={{
										cursor: isInlineEditing
											? "text"
											: isDragging
												? "grabbing"
												: "grab",
									}}
									tabIndex={0}
								>
									<rect
										fill={fill}
										height={rectH}
										rx={4}
										stroke="var(--chart-surface)"
										strokeWidth={1.5}
										width={rectW}
										x={x - rectW / 2}
										y={rectY}
									/>
									{isInlineEditing ? (
										<foreignObject
											height={rectH}
											width={rectW}
											x={x - rectW / 2}
											y={rectY}
										>
											<input
												autoFocus
												onBlur={() => setInlineEditingStationId(null)}
												onChange={(e) =>
													updateStationName(s.id, e.target.value)
												}
												onKeyDown={(e) => {
													e.stopPropagation();
													if (e.key === "Enter" || e.key === "Escape") {
														setInlineEditingStationId(null);
													}
												}}
												onMouseDown={(e) => e.stopPropagation()}
												style={{
													background: "transparent",
													border: "none",
													color: "#fff",
													fontSize: "9.5px",
													fontWeight: 600,
													height: "100%",
													outline: "none",
													textAlign: "center",
													width: "100%",
													padding: "0 2px",
												}}
												type="text"
												value={s.name}
											/>
										</foreignObject>
									) : (
										<text
											fill="#fff"
											fontSize={9.5}
											fontWeight="600"
											style={{ pointerEvents: "none" }}
											textAnchor="middle"
											x={x}
											y={rectY + rectH - 5}
										>
											{label}
										</text>
									)}
								</g>
							);
						})}

						{/* Ghost marker — prévisualisation en mode ajout de ravito */}
						{showAddStation &&
							hover &&
							(() => {
								const x = toX(hover.distM);
								const autoName =
									addStationName.trim() || `Ravito ${aidStations.length + 1}`;
								const label =
									autoName.length > 12 ? `${autoName.slice(0, 11)}…` : autoName;
								const rectW = Math.max(44, label.length * 6.5 + 14);
								const rectH = 17;
								const rectY = PAD_TOP - rectH - 3;
								return (
									<g style={{ pointerEvents: "none" }}>
										<line
											stroke="#E07B4F"
											strokeDasharray="3 3"
											strokeOpacity={0.4}
											strokeWidth={1}
											x1={x}
											x2={x}
											y1={PAD_TOP}
											y2={PAD_TOP + CHART_H}
										/>
										<rect
											fill="#E07B4F"
											height={rectH}
											opacity={0.35}
											rx={4}
											stroke="var(--chart-surface)"
											strokeWidth={1.5}
											width={rectW}
											x={x - rectW / 2}
											y={rectY}
										/>
										<text
											fill="#fff"
											fontSize={9.5}
											fontWeight="600"
											opacity={0.5}
											style={{ pointerEvents: "none" }}
											textAnchor="middle"
											x={x}
											y={rectY + rectH - 5}
										>
											{label}
										</text>
									</g>
								);
							})()}

						{/* Food lane (mode avancé uniquement) */}
						{nutritionMode === "advanced" && (
							<line
								stroke="#2a2a28"
								strokeWidth={1}
								x1={PAD_LEFT}
								x2={PAD_LEFT + CHART_W}
								y1={FOOD_LANE_Y - 1}
								y2={FOOD_LANE_Y - 1}
							/>
						)}
						{nutritionMode === "advanced" &&
							(() => {
								const sorted = [...nutritionPlacements].sort(
									(a, b) => a.distanceFromStart - b.distanceFromStart,
								);
								const groups: PlacedFoodItem[][] = [];
								for (const p of sorted) {
									const x = toX(p.distanceFromStart);
									const last = groups.at(-1);
									if (
										last &&
										Math.abs(toX(last[0].distanceFromStart) - x) <= 16
									) {
										last.push(p);
									} else {
										groups.push([p]);
									}
								}
								return groups.map((group, _gi) => {
									const centerX = toX(group[0].distanceFromStart);
									const MAX_VISIBLE = 3;
									const visible = group.slice(0, MAX_VISIBLE);
									const overflow = group.length - MAX_VISIBLE;
									return (
										<g clipPath="url(#aid-food-lane)" key={group[0].id}>
											{visible.map((p, si) => {
												const item = foodLibrary.find(
													(f) => f.id === p.foodItemId,
												);
												if (!item) return null;
												const iconY =
													FOOD_LANE_Y +
													(FOOD_LANE_H - FOOD_ICON_SIZE) / 2 -
													si * (FOOD_ICON_SIZE * 0.7);
												const isDragging = dragFoodId === p.id;
												const isSelected = selectedFoodPlacementId === p.id;
												return (
													<g key={p.id}>
														{/* biome-ignore lint/a11y/noStaticElementInteractions: SVG <rect> has no semantic interactive equivalent */}
														<rect
															fill="transparent"
															height={FOOD_ICON_SIZE + 8}
															onClick={(e) => {
																e.stopPropagation();
																if (!foodDragMovedRef.current)
																	setSelectedFoodPlacementId((prev) =>
																		prev === p.id ? null : p.id,
																	);
															}}
															onKeyDown={(e) => {
																if (e.key === "Enter" || e.key === " ")
																	setSelectedFoodPlacementId((prev) =>
																		prev === p.id ? null : p.id,
																	);
															}}
															onMouseDown={(e) =>
																handleFoodIconMouseDown(e, p.id)
															}
															onMouseEnter={() => setHoveredFoodId(p.id)}
															onMouseLeave={() => setHoveredFoodId(null)}
															style={{
																cursor: isDragging ? "grabbing" : "grab",
															}}
															tabIndex={0}
															width={FOOD_ICON_SIZE + 8}
															x={centerX - FOOD_ICON_SIZE / 2 - 4}
															y={iconY - 4}
														/>
														<image
															height={FOOD_ICON_SIZE}
															href={foodIconSrc(item)}
															style={{
																pointerEvents: "none",
																opacity: isDragging ? 0.6 : 1,
															}}
															width={FOOD_ICON_SIZE}
															x={centerX - FOOD_ICON_SIZE / 2}
															y={iconY}
														/>
														{isSelected && (
															<rect
																fill="none"
																height={FOOD_ICON_SIZE + 6}
																rx={4}
																stroke="#60a5fa"
																strokeWidth={1.5}
																style={{ pointerEvents: "none" }}
																width={FOOD_ICON_SIZE + 6}
																x={centerX - FOOD_ICON_SIZE / 2 - 3}
																y={iconY - 3}
															/>
														)}
													</g>
												);
											})}
											{overflow > 0 && (
												<text
													fill="#6E6C66"
													fontSize={8}
													textAnchor="middle"
													x={centerX}
													y={FOOD_LANE_Y + FOOD_LANE_H - 4}
												>
													+{overflow}
												</text>
											)}
										</g>
									);
								});
							})()}

						{/* Tooltip nom aliment au survol (mode avancé) */}
						{nutritionMode === "advanced" &&
							hoveredFoodId &&
							!dragFoodId &&
							!selectedFoodPlacementId &&
							(() => {
								const p = nutritionPlacements.find(
									(pl) => pl.id === hoveredFoodId,
								);
								if (!p) return null;
								const item = foodLibrary.find((f) => f.id === p.foodItemId);
								if (!item) return null;
								return (
									<text
										fill="#6b7280"
										fontSize={8}
										style={{ pointerEvents: "none" }}
										textAnchor="middle"
										x={toX(p.distanceFromStart)}
										y={FOOD_LANE_Y + FOOD_LANE_H - 3}
									>
										{item.name}
									</text>
								);
							})()}

						{/* Lignes verticales ravitos : food lane (ou chart) → stats lane → label km */}
						{sortedStations.map((s) => (
							<line
								key={`fl-${s.id}`}
								stroke="#E07B4F"
								strokeDasharray="4 3"
								strokeOpacity={0.5}
								strokeWidth={1}
								x1={toX(s.distanceFromStart)}
								x2={toX(s.distanceFromStart)}
								y1={nutritionMode === "advanced" ? FOOD_LANE_Y : STATS_LANE_Y}
								y2={X_LABEL_Y + 14}
							/>
						))}

						{/* Labels km uniquement sous les ravitos — en bulles */}
						{sortedStations.map((s) => {
							const x = toX(s.distanceFromStart);
							const kmLabel =
								(s.distanceFromStart / 1000) % 1 === 0
									? `${s.distanceFromStart / 1000} km`
									: `${(s.distanceFromStart / 1000).toFixed(1)} km`;
							const bW = kmLabel.length * 5.2 + 10;
							const bH = 13;
							const bY = X_LABEL_Y + 1;
							return (
								<g key={`km-${s.id}`} style={{ pointerEvents: "none" }}>
									<rect
										fill="#4A7FA0"
										height={bH}
										rx={3}
										stroke="var(--chart-surface)"
										strokeWidth={1}
										width={bW}
										x={x - bW / 2}
										y={bY}
									/>
									<text
										fill="#fff"
										fontSize={8}
										fontWeight="500"
										style={{ pointerEvents: "none" }}
										textAnchor="middle"
										x={x}
										y={bY + bH - 4}
									>
										{kmLabel}
									</text>
								</g>
							);
						})}

						{/* Temps cumulés aux limites de tronçon — en bulles (sauf début et fin) */}
						{effectiveLegs.length > 0 &&
							(() => {
								const items = [
									{ dist: 0, label: "0:00" },
									...effectiveLegs.map((leg) => ({
										dist: leg.toDist,
										label: formatTime(leg.cumulativeTime),
									})),
								];
								return items.map(({ dist, label }, i) => {
									const isFirst = i === 0;
									const isLast = i === items.length - 1;
									if (isFirst || isLast) return null;
									const x = toX(dist);
									const bW = label.length * 5.2 + 10;
									const bH = 13;
									const bY = STATS_LANE_Y - bH - 2;
									return (
										<g key={dist} style={{ pointerEvents: "none" }}>
											<rect
												fill="#D0CEC8"
												height={bH}
												rx={3}
												stroke="var(--chart-surface)"
												strokeWidth={1}
												width={bW}
												x={x - bW / 2}
												y={bY}
											/>
											<text
												fill="#3a3a36"
												fontSize={8}
												fontWeight="500"
												style={{ pointerEvents: "none" }}
												textAnchor="middle"
												x={x}
												y={bY + bH - 4}
											>
												{label}
											</text>
										</g>
									);
								});
							})()}

						{/* Hover */}
						{hover && !dragId && (
							<g>
								<line
									stroke="#ffffff"
									strokeDasharray="4 3"
									strokeOpacity={0.25}
									strokeWidth={1}
									x1={hover.svgX}
									x2={hover.svgX}
									y1={PAD_TOP}
									y2={PAD_TOP + CHART_H}
								/>
								<circle
									cx={hover.svgX}
									cy={toY(hover.elevation)}
									fill={slopeHexFn(hover.slope)}
									r={3.5}
									stroke="var(--chart-surface)"
									strokeWidth={1.5}
								/>
								<rect
									fill="var(--chart-surface)"
									height={44}
									rx={5}
									stroke="#3D3D37"
									strokeWidth={1}
									width={120}
									x={tooltipOnLeft ? hover.svgX - 8 - 120 : hover.svgX + 8}
									y={PAD_TOP + 4}
								/>
								<text
									fill="#B0ADA5"
									fontSize={12}
									fontWeight="600"
									textAnchor="middle"
									x={tooltipOnLeft ? hover.svgX - 8 - 60 : hover.svgX + 8 + 60}
									y={PAD_TOP + 20}
								>
									{(hover.distM / 1000).toFixed(2)} km ·{" "}
									{Math.round(hover.elevation)} m
								</text>
								<text
									fill={slopeHexFn(hover.slope)}
									fontSize={12}
									textAnchor="middle"
									x={tooltipOnLeft ? hover.svgX - 8 - 60 : hover.svgX + 8 + 60}
									y={PAD_TOP + 36}
								>
									{hover.slope >= 0 ? "+" : ""}
									{hover.slope.toFixed(1)}%
								</text>
							</g>
						)}

						{/* Popup composition aliment (clic sur icône) */}
						{selectedFoodPlacementId &&
							(() => {
								const placement = nutritionPlacements.find(
									(p) => p.id === selectedFoodPlacementId,
								);
								if (!placement) {
									return null;
								}
								const item = foodLibrary.find(
									(f) => f.id === placement.foodItemId,
								);
								if (!item) {
									return null;
								}
								const cx = toX(placement.distanceFromStart);
								const macros = [
									item.carbsG > 0
										? { text: `${item.carbsG}g glucides`, color: "#fbbf24" }
										: null,
									item.waterMl > 0
										? { text: `${item.waterMl}mL eau`, color: "#38bdf8" }
										: null,
									item.sodiumMg > 0
										? { text: `${item.sodiumMg}mg sodium`, color: "#94a3b8" }
										: null,
									item.caffeineMg > 0
										? { text: `${item.caffeineMg}mg caféine`, color: "#a78bfa" }
										: null,
								].filter(Boolean) as { text: string; color: string }[];
								const W = 136;
								const macroH = Math.max(macros.length, 1) * 12;
								const H = 8 + 13 + macroH + 4 + 16 + 4;
								const popupY = FOOD_LANE_Y - H - 6;
								const popupX = Math.max(
									PAD_LEFT,
									Math.min(VIEW_W - PAD_RIGHT - W, cx - W / 2),
								);
								const arrowX = Math.max(
									popupX + 8,
									Math.min(popupX + W - 8, cx),
								);
								return (
									// biome-ignore lint/a11y/noStaticElementInteractions: SVG <g> popup container; no HTML semantic equivalent
									<g
										onClick={(e) => e.stopPropagation()}
										onKeyDown={(e) => e.stopPropagation()}
										style={{ pointerEvents: "all" }}
										tabIndex={-1}
									>
										<rect
											fill="var(--chart-surface)"
											height={H}
											rx={4}
											stroke="#3D3D37"
											strokeWidth={1}
											width={W}
											x={popupX}
											y={popupY}
										/>
										{/* Triangle pointant vers l'icône */}
										<polygon
											fill="var(--chart-surface)"
											points={`${arrowX - 5},${popupY + H} ${arrowX + 5},${popupY + H} ${arrowX},${FOOD_LANE_Y - 3}`}
										/>
										<line
											stroke="#3D3D37"
											strokeWidth={1}
											x1={arrowX - 5}
											x2={arrowX}
											y1={popupY + H}
											y2={FOOD_LANE_Y - 3}
										/>
										<line
											stroke="#3D3D37"
											strokeWidth={1}
											x1={arrowX + 5}
											x2={arrowX}
											y1={popupY + H}
											y2={FOOD_LANE_Y - 3}
										/>
										{/* Nom */}
										<text
											fill="#B0ADA5"
											fontSize={9}
											fontWeight="600"
											x={popupX + 7}
											y={popupY + 8 + 9}
										>
											{item.name.length > 18
												? `${item.name.slice(0, 17)}…`
												: item.name}
										</text>
										{/* × fermeture */}
										{/* biome-ignore lint/a11y/noStaticElementInteractions: SVG <text> close button; no HTML semantic equivalent in SVG */}
										<text
											fill="#4b5563"
											fontSize={11}
											onClick={() => setSelectedFoodPlacementId(null)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													setSelectedFoodPlacementId(null);
												}
											}}
											style={{ cursor: "pointer" }}
											tabIndex={0}
											textAnchor="end"
											x={popupX + W - 6}
											y={popupY + 8 + 9}
										>
											×
										</text>
										{/* Macros */}
										{macros.length === 0 && (
											<text
												fill="#4b5563"
												fontSize={8}
												x={popupX + 7}
												y={popupY + 8 + 13 + 9}
											>
												Aucune macro
											</text>
										)}
										{macros.map((m, mi) => (
											<text
												fill={m.color}
												fontSize={8.5}
												key={m.text}
												x={popupX + 7}
												y={popupY + 8 + 13 + mi * 12 + 9}
											>
												{m.text}
											</text>
										))}
										{/* Bouton supprimer */}
										{/* biome-ignore lint/a11y/noStaticElementInteractions: SVG <g> delete button; no HTML semantic equivalent in SVG */}
										<g
											onClick={() => {
												removePlacement(placement.id);
												setSelectedFoodPlacementId(null);
											}}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													removePlacement(placement.id);
													setSelectedFoodPlacementId(null);
												}
											}}
											style={{ cursor: "pointer" }}
											tabIndex={0}
										>
											<rect
												fill="#7f1d1d"
												height={14}
												rx={3}
												width={W - 10}
												x={popupX + 5}
												y={popupY + H - 16 - 4}
											/>
											<text
												fill="#fca5a5"
												fontSize={8}
												textAnchor="middle"
												x={popupX + W / 2}
												y={popupY + H - 16 - 4 + 9.5}
											>
												Supprimer
											</text>
										</g>
									</g>
								);
							})()}

						{/* Indicateur de dépôt (drag & drop depuis les favoris) */}
						{dragOverChart && (
							<g style={{ pointerEvents: "none" }}>
								<line
									stroke="#60a5fa"
									strokeDasharray="4 3"
									strokeOpacity={0.9}
									strokeWidth={2}
									x1={dragOverChart.svgX}
									x2={dragOverChart.svgX}
									y1={PAD_TOP}
									y2={
										nutritionMode === "advanced"
											? FOOD_LANE_Y + FOOD_LANE_H
											: STATS_LANE_Y + STATS_LANE_H
									}
								/>
								{(() => {
									const km = (dragOverChart.distM / 1000).toFixed(2);
									const onLeft = dragOverChart.svgX > VIEW_W / 2;
									const rx = onLeft
										? dragOverChart.svgX - 8 - 126
										: dragOverChart.svgX + 8;
									const hasTime = totalTime > 0;
									return (
										<>
											<rect
												fill="#0d1625"
												height={hasTime ? 44 : 26}
												rx={5}
												stroke="#3b82f6"
												strokeOpacity={0.8}
												strokeWidth={1}
												width={126}
												x={rx}
												y={PAD_TOP + 2}
											/>
											<text
												fill="#93c5fd"
												fontSize={12}
												fontWeight="600"
												textAnchor="middle"
												x={rx + 63}
												y={PAD_TOP + 17}
											>
												{km} km
											</text>
											{hasTime && (
												<text
													fill="#60a5fa"
													fontSize={11}
													textAnchor="middle"
													x={rx + 63}
													y={PAD_TOP + 34}
												>
													{formatTime(distanceToTime(dragOverChart.distM))}
												</text>
											)}
										</>
									);
								})()}
							</g>
						)}

						{/* Encadré — entoure ravitos (haut) + profil + stats + km (bas) */}
						<rect
							fill="none"
							height={VIEW_H_PROFILE - 1}
							rx={4}
							stroke="#3d3d37"
							strokeWidth={1}
							style={{ pointerEvents: "none" }}
							width={VIEW_W}
							x={0}
							y={0}
						/>
					</svg>
					{!hasClickedLeg && effectiveLegs.length > 1 && (
						<p className="pointer-events-none mt-1 text-center text-[11px] text-gray-500 italic animate-pulse" data-print-hide="">
							Cliquer sur un tronçon pour ajuster le temps et la nutrition
						</p>
					)}
				</div>

				{/* Bibliothèque + favoris + indicateur armé — sous le graphique (mode avancé) */}
				{nutritionMode === "advanced" && (
					<div
						className="mt-1 flex items-center justify-between gap-3"
						data-print-hide=""
					>
						{/* Favoris */}
						{(() => {
							const favorites = foodLibrary.filter((f) => f.favorite);
							if (favorites.length === 0) return <div />;
							return (
								<div className="flex flex-wrap items-center gap-1.5">
									{favorites.map((item) => {
										const isArmed = armedFoodId === item.id;
										return (
											<button
												className="flex cursor-grab flex-col items-center gap-0.5 active:cursor-grabbing"
												draggable
												key={item.id}
												onClick={() =>
													setArmedFoodId((prev) =>
														prev === item.id ? null : item.id,
													)
												}
												onDragStart={(e) => {
													e.dataTransfer.setData("foodItemId", item.id);
													e.dataTransfer.effectAllowed = "copy";
												}}
												title={item.name}
												type="button"
											>
												<div
													className={[
														"flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150",
														isArmed
															? "border-2 border-teal-500 bg-teal-900/50"
															: "border border-gray-700 bg-gray-800/80 hover:border-gray-500",
													].join(" ")}
												>
													<img
														alt={item.name}
														className="h-5 w-5 object-contain"
														height={20}
														src={foodIconSrc(item)}
														width={20}
													/>
												</div>
											</button>
										);
									})}
								</div>
							);
						})()}
						{/* Droite : indicateur armé + bibliothèque */}
						<div className="flex items-center gap-2 ml-auto">
							{armedFoodId && (
								<div className="rounded-lg border border-teal-700/40 bg-teal-900/20 px-3 py-1.5 text-[11px] text-teal-400">
									Cliquer sur le profil pour placer · Échap pour annuler
								</div>
							)}
							<FoodLibrary
								armedFoodId={armedFoodId}
								disableArm={false}
								foodLibrary={foodLibrary}
								nutritionPlacements={nutritionPlacements}
								onArmFood={(id) =>
									setArmedFoodId((prev) => (prev === id ? null : id))
								}
								openTrigger={foodLibraryTrigger}
								setFoodLibrary={setFoodLibrary}
								setNutritionPlacements={setNutritionPlacements}
							/>
						</div>
					</div>
				)}

				{/* FoodLibrary en mode normal — bouton trigger masqué, drawer accessible via openTrigger depuis les tronçons */}
				{nutritionMode === "normal" && (
					<FoodLibrary
						armedFoodId={null}
						disableArm
						foodLibrary={foodLibrary}
						hideTrigger
						nutritionPlacements={nutritionPlacements}
						onArmFood={() => {}}
						openTrigger={foodLibraryTrigger}
						setFoodLibrary={setFoodLibrary}
						setNutritionPlacements={setNutritionPlacements}
					/>
				)}

				{/* Résumé nutrition global */}
				{totalTime > 0 &&
					(() => {
						const hours = totalTime / 3600;

						let totalCarbs = 0,
							totalWater = 0,
							totalSodium = 0,
							totalCaffeine = 0;
						if (nutritionMode === "normal") {
							for (const assignments of Object.values(legNutritionPlan)) {
								const t = computeLegNutrition(assignments, foodLibrary);
								totalCarbs += t.carbs;
								totalWater += t.water;
								totalSodium += t.sodium;
								totalCaffeine += t.caffeine;
							}
						} else {
							const t = computeNutritionFromPlacements(
								nutritionPlacements,
								foodLibrary,
							);
							totalCarbs = t.carbs;
							totalWater = t.water;
							totalSodium = t.sodium;
							totalCaffeine = t.caffeine;
						}

						const rows = [
							{
								label: "Glucides",
								val: totalCarbs,
								tgt: Math.round(hours * carbsPerHour),
								perH: hours > 0 ? Math.round(totalCarbs / hours) : 0,
								unit: "g",
							},
							{
								label: "Eau",
								val: totalWater,
								tgt: Math.round(hours * waterPerHour),
								perH: hours > 0 ? Math.round(totalWater / hours) : 0,
								unit: "mL",
							},
							{
								label: "Sodium",
								val: totalSodium,
								tgt: Math.round(hours * sodiumPerHour),
								perH: hours > 0 ? Math.round(totalSodium / hours) : 0,
								unit: "mg",
							},
							...(totalCaffeine > 0
								? [
										{
											label: "Caféine",
											val: totalCaffeine,
											tgt: 0,
											perH: hours > 0 ? Math.round(totalCaffeine / hours) : 0,
											unit: "mg",
										},
									]
								: []),
						];

						// Consolidation des aliments
						const qtyById: Record<string, number> = {};
						if (nutritionMode === "normal") {
							for (const assignments of Object.values(legNutritionPlan)) {
								for (const a of assignments) {
									qtyById[a.foodItemId] =
										(qtyById[a.foodItemId] ?? 0) + a.quantity;
								}
							}
						} else {
							for (const p of nutritionPlacements) {
								qtyById[p.foodItemId] = (qtyById[p.foodItemId] ?? 0) + 1;
							}
						}
						const foodSummary = Object.entries(qtyById)
							.map(([id, qty]) => ({
								item: foodLibrary.find((f) => f.id === id),
								qty,
							}))
							.filter(
								(e): e is { item: NonNullable<typeof e.item>; qty: number } =>
									!!e.item,
							)
							.sort((a, b) => b.qty - a.qty);

						return (
							<div
								className="mt-4 flex flex-col gap-4 border-gray-800 border-t pt-4"
								data-print-section="summary"
								{...(!printOptions.summary ? { "data-print-hide": "" } : {})}
							>
								<p className="font-medium text-[10px] text-gray-600 uppercase tracking-widest">
									Bilan
								</p>
								<div className="flex gap-6">
									{/* Tableau nutrition */}
									<table className="shrink-0 border-collapse text-xs">
										<thead>
											<tr className="border-gray-800 border-b">
												<th className="pb-1.5 pr-8 text-left font-medium text-gray-600">
													Nutriment
												</th>
												<th className="pb-1.5 pr-8 text-right font-medium text-gray-600">
													/ heure
												</th>
												<th className="pb-1.5 pr-8 text-right font-medium text-gray-600">
													Total
												</th>
												<th className="pb-1.5 text-right font-medium text-gray-600">
													Objectif
												</th>
											</tr>
										</thead>
										<tbody>
											{rows.map(({ label, val, tgt, perH, unit }) => (
												<tr
													className="border-gray-800/50 border-b last:border-0"
													key={label}
												>
													<td className="py-1.5 pr-8 text-gray-500">{label}</td>
													<td className="py-1.5 pr-8 text-right text-gray-300">
														{perH} {unit}
													</td>
													<td className="py-1.5 pr-8 text-right text-gray-300">
														{val} {unit}
													</td>
													<td className="py-1.5 text-right text-gray-600">
														{tgt > 0 ? `${tgt} ${unit}` : "—"}
													</td>
												</tr>
											))}
										</tbody>
									</table>

									{/* Séparateur vertical */}
									{foodSummary.length > 0 && (
										<div className="w-px shrink-0 bg-gray-800" />
									)}

									{/* Aliments à préparer */}
									{foodSummary.length > 0 && (
										<div className="flex min-w-0 flex-col gap-2">
											<span className="font-medium text-[11px] text-gray-600 uppercase tracking-wide">
												Aliments à préparer
											</span>
											<div className="flex flex-wrap gap-2">
												{foodSummary.map(({ item, qty }) => (
													<div
														className="flex items-center gap-1.5 rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1.5"
														key={item.id}
													>
														<img
															alt=""
															className="h-5 w-5 object-contain"
															height={20}
															src={foodIconSrc(item)}
															width={20}
														/>
														<span className="text-gray-400 text-xs">
															{item.name}
														</span>
														<span className="font-medium text-gray-200 text-xs">
															× {qty}
														</span>
													</div>
												))}
											</div>
										</div>
									)}
								</div>
							</div>
						);
					})()}
			</div>
			{/* /printRef */}

			{/* Timelines nutrition avec switch (mode avancé uniquement) */}
			{nutritionMode === "advanced" &&
				totalTime > 0 &&
				(() => {
					const t2 = 2 * bodyWeightKg;
					const t3 = 3 * bodyWeightKg;
					const t6 = 6 * bodyWeightKg;
					const tabs: {
						key: "carbs" | "water" | "sodium" | "caffeine";
						label: string;
						color: string;
						hasData: boolean;
					}[] = [
						{
							key: "carbs",
							label: "Glucides",
							color: "#fbbf24",
							hasData: carbsTimeline.length > 0,
						},
						{
							key: "water",
							label: "Eau",
							color: "#38bdf8",
							hasData: waterTimeline.length > 0,
						},
						{
							key: "sodium",
							label: "Sodium",
							color: "#cbd5e1",
							hasData: sodiumTimeline.length > 0,
						},
						{
							key: "caffeine",
							label: "Caféine",
							color: "#a78bfa",
							hasData: caffeineTimeline.length > 0,
						},
					];
					const hasAnyData = tabs.some((t) => t.hasData);
					if (!hasAnyData) {
						return null;
					}

					const activeTab =
						tabs.find((t) => t.key === activeNutritionChart && t.hasData) ??
						tabs.find((t) => t.hasData);
					if (!activeTab) {
						return null;
					}

					const totalCarbsRace = Math.round(
						nutritionPlacements.reduce((sum, p) => {
							const item = foodLibrary.find((f) => f.id === p.foodItemId);
							return sum + (item?.carbsG ?? 0);
						}, 0),
					);
					const totalTimeHRace = totalTime / 3600;
					const avgCarbsPerHourRace =
						totalTimeHRace > 0
							? Math.round(totalCarbsRace / totalTimeHRace)
							: 0;

					return (
						<div className="flex flex-col gap-1">
							<div className="flex gap-1">
								{tabs
									.filter((t) => t.hasData)
									.map((t) => (
										<button
											className="rounded-md px-2.5 py-1 text-xs transition-colors"
											key={t.key}
											onClick={() => setActiveNutritionChart(t.key)}
											style={
												activeTab.key === t.key
													? {
															background: `${t.color}22`,
															color: t.color,
															border: `1px solid ${t.color}55`,
														}
													: {
															background: "transparent",
															color: "#6E6C66",
															border: "1px solid transparent",
														}
											}
											type="button"
										>
											{t.label}
										</button>
									))}
							</div>
							<div>
								{activeTab.key === "carbs" && (
									<NutritionRateChart
										color="#fbbf24"
										gradientId="rate-carbs"
										intakeMarkers={carbsMarkers}
										maxValue={maxCarbsRate}
										onRemoveMarker={removePlacement}
										target={carbsPerHour}
										timelinePoints={carbsTimeline}
										title="Glucides · débit horaire glissant (g/h)"
										totalTimeH={totalTime / 3600}
										unit="g/h"
									/>
								)}
								{activeTab.key === "water" && (
									<NutritionRateChart
										color="#38bdf8"
										gradientId="rate-water"
										intakeMarkers={waterMarkers}
										maxValue={maxWaterRate}
										onRemoveMarker={removePlacement}
										target={waterPerHour}
										timelinePoints={waterTimeline}
										title="Eau · débit horaire glissant (mL/h)"
										totalTimeH={totalTime / 3600}
										unit="mL/h"
									/>
								)}
								{activeTab.key === "sodium" && (
									<NutritionRateChart
										color="#cbd5e1"
										gradientId="rate-sodium"
										intakeMarkers={sodiumMarkers}
										maxValue={maxSodiumRate}
										onRemoveMarker={removePlacement}
										target={sodiumPerHour}
										timelinePoints={sodiumTimeline}
										title="Sodium · débit horaire glissant (mg/h)"
										totalTimeH={totalTime / 3600}
										unit="mg/h"
									/>
								)}
								{activeTab.key === "caffeine" && (
									<NutritionRateChart
										color="#a78bfa"
										dangerAbove={t6}
										dangerColor="#ef4444"
										footerLabel="t½ = 5h"
										gradientId="rate-caff"
										intakeMarkers={caffeineIntakes.map((i) => ({
											timeH: i.timeH,
											label: `${i.doseMg}mg`,
											placementId: i.placementId,
											foodName: i.item.name,
											carbsG: i.item.carbsG || undefined,
											waterMl: i.item.waterMl || undefined,
											sodiumMg: i.item.sodiumMg || undefined,
											caffeineMg: i.item.caffeineMg || undefined,
										}))}
										legendItems={[
											{ label: `seuil bas ${t2}mg`, color: "#6b7280" },
											{ label: `optimal ${t3}–${t6}mg`, color: "#16a34a" },
											{ label: `effets 2nd >${t6}mg`, color: "#ef4444" },
										]}
										maxValue={maxCaffeineConc}
										onRemoveMarker={removePlacement}
										thresholds={[
											{
												value: t2,
												color: "#6b7280",
												label: `seuil bas ${t2}mg`,
											},
											{
												value: t3,
												color: "#16a34a",
												label: `optimal ${t3}–${t6}mg`,
											},
											{
												value: t6,
												color: "#ef4444",
												label: `effets 2nd >${t6}mg`,
											},
										]}
										timelinePoints={caffeineTimeline.map((p) => ({
											timeH: p.timeH,
											value: p.concentrationMg,
										}))}
										title={`Caféine dans le corps (mg) · ${bodyWeightKg} kg`}
										totalTimeH={totalTime / 3600}
										unit="mg"
										zoneHighlight={{ from: t3, to: t6, color: "#16a34a" }}
									/>
								)}
							</div>
							{totalCarbsRace > 0 && (
								<div className="flex items-center justify-end gap-1.5 pt-1">
									<span className="font-medium text-[11px] text-gray-500 uppercase tracking-wide">
										Total course
									</span>
									<span className="rounded-full border border-amber-700/40 bg-amber-900/30 px-2 py-0.5 font-medium text-[10px] text-amber-400">
										{totalCarbsRace}g glucides
									</span>
									<span className="rounded-full border border-amber-700/40 bg-amber-900/30 px-2 py-0.5 font-medium text-[10px] text-amber-400">
										{avgCarbsPerHourRace}g/h moy.
									</span>
								</div>
							)}
						</div>
					);
				})()}

			{/* Modal d'édition du tronçon */}
			{selectedLegIdx !== null &&
				effectiveLegs[selectedLegIdx] &&
				// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex by nature
				(() => {
					const leg = effectiveLegs[selectedLegIdx];
					const predictedTime = legs[selectedLegIdx]?.time ?? leg.time;
					const key = legKey(selectedLegIdx);
					const isTimeOvr = key in timeOverrides;
					const avgPace =
						leg.time > 0 && leg.distance > 0
							? leg.time / (leg.distance / 1000)
							: null;
					const endStation =
						leg.toName === "Arrivée"
							? null
							: sortedStations.find((s) => s.name === leg.toName);

					return (
						<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
							<button
								aria-label="Fermer la modale"
								className="absolute inset-0 cursor-default bg-black/60"
								onClick={() => {
									setSelectedLegIdx(null);
									setEditingStationName(false);
								}}
								type="button"
							/>
							<dialog
								className="relative flex max-h-[90vh] w-full max-w-2xl flex-col gap-5 overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"
								onClose={() => {
									setSelectedLegIdx(null);
									setEditingStationName(false);
								}}
								open
							>
								{/* Header */}
								<div className="flex items-center justify-between gap-3">
									<div className="flex min-w-0 flex-1 items-center gap-2">
										<span className="shrink-0 text-gray-400 text-sm">
											{leg.fromName}
										</span>
										<span className="shrink-0 text-gray-600">→</span>
										{endStation ? (
											<div className="flex min-w-0 items-center gap-1.5">
												{editingStationName ? (
													<input
														autoFocus
														className="w-[140px] border-gray-500 border-b bg-transparent py-0.5 font-semibold text-gray-100 text-sm outline-none focus:border-gray-300"
														onBlur={() => setEditingStationName(false)}
														onChange={(e) =>
															updateStationName(endStation.id, e.target.value)
														}
														onKeyDown={(e) =>
															e.key === "Enter" && setEditingStationName(false)
														}
														type="text"
														value={endStation.name}
													/>
												) : (
													<span className="font-semibold text-gray-100 text-sm">
														{endStation.name}
													</span>
												)}
												<button
													className="shrink-0 text-gray-600 transition-colors hover:text-gray-300"
													onClick={() => setEditingStationName((v) => !v)}
													title="Renommer"
													type="button"
												>
													<Pencil size={11} />
												</button>
											</div>
										) : (
											<span className="font-semibold text-gray-100 text-sm">
												{leg.toName}
											</span>
										)}
									</div>
									<div className="flex shrink-0 items-center gap-1">
										<Button
											className="h-7 w-7 text-gray-500 hover:text-gray-300"
											onClick={() => {
												setSelectedLegIdx(null);
												setEditingStationName(false);
											}}
											size="icon"
											variant="ghost"
										>
											<X size={14} />
										</Button>
									</div>
								</div>

								{/* Stats */}
								<div className="flex flex-wrap gap-4 text-sm">
									<span
										className={
											isTimeOvr
												? "font-medium text-amber-300"
												: "font-medium text-gray-200"
										}
									>
										{formatTime(leg.time)}
									</span>
									<span className="text-gray-500">
										{(leg.distance / 1000).toFixed(1)} km
									</span>
									<span className="text-gray-500">
										+{Math.round(leg.elevGain)} / −{Math.round(leg.elevLoss)} m
									</span>
									{avgPace !== null && (
										<span className="text-gray-500">
											{formatPace(avgPace)}/km
										</span>
									)}
								</div>

								{/* Temps */}
								<div className="flex flex-col gap-2 border-gray-700 border-b pb-1">
									<div className="flex items-center justify-between">
										<span className="font-medium text-[11px] text-gray-500 uppercase tracking-wide">
											Temps du tronçon
										</span>
										{isTimeOvr && (
											<button
												className="flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-gray-400"
												onClick={() => resetTimeOverride(key)}
												type="button"
											>
												<RotateCcw size={10} /> prédit :{" "}
												{formatTime(predictedTime)}
											</button>
										)}
									</div>
									<div className="flex items-center gap-3">
										<Input
											className={[
												"h-auto w-24 border-0 bg-gray-700 py-1.5 text-sm focus-visible:ring-1 focus-visible:ring-gray-500",
												isTimeOvr ? "text-amber-300" : "text-gray-100",
											].join(" ")}
											defaultValue={formatDuration(leg.time)}
											key={`t-${selectedLegIdx}-${timeOverrides[key] ?? "auto"}`}
											onBlur={(e) => setTimeOverride(key, e.target.value)}
											placeholder="ex: 1:30"
											type="text"
										/>
										{isTimeOvr ? (
											<span className="text-[11px] text-amber-600/80">
												modifié manuellement
											</span>
										) : (
											<span className="text-[11px] text-gray-600">
												prédit par le modèle GAP
											</span>
										)}
									</div>
								</div>

								{/* Nutrition — aliments du tronçon */}
								{nutritionMode === "normal" ? (
									<LegNutritionPanel
										assignments={legNutritionPlan[key] ?? []}
										carbsPerHour={carbsPerHour}
										foodLibrary={foodLibrary}
										legTime={leg.time}
										onAddFood={(foodItemId) =>
											handleLegAddFood(selectedLegIdx, foodItemId)
										}
										onOpenLibrary={() => setFoodLibraryTrigger((t) => t + 1)}
										onRemoveFood={(foodItemId) =>
											handleLegRemoveFood(selectedLegIdx, foodItemId)
										}
										sodiumPerHour={sodiumPerHour}
										waterPerHour={waterPerHour}
									/>
								) : (
									(() => {
										const items = placementsForLeg(selectedLegIdx);
										const nutrition = computeNutritionFromPlacements(
											items,
											foodLibrary,
										);
										const hours = leg.time / 3600;
										const targets = {
											carbs: Math.round(hours * carbsPerHour),
											water: Math.round(hours * waterPerHour),
											sodium: Math.round(hours * sodiumPerHour),
										};
										const BILAN = [
											{
												key: "carbs",
												label: "Glucides",
												val: nutrition.carbs,
												tgt: targets.carbs,
												unit: "g",
												color: "text-amber-400",
											},
											{
												key: "water",
												label: "Eau",
												val: nutrition.water,
												tgt: targets.water,
												unit: "mL",
												color: "text-sky-400",
											},
											{
												key: "sodium",
												label: "Sodium",
												val: nutrition.sodium,
												tgt: targets.sodium,
												unit: "mg",
												color: "text-slate-300",
											},
										];
										return (
											<div className="flex flex-col gap-3">
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-1.5">
														{BILAN.map(
															({
																key: bk,
																label: bl,
																val,
																tgt,
																unit,
																color,
															}) => {
																const pct =
																	tgt > 0 ? Math.round((val / tgt) * 100) : 0;
																const hasItems = items.length > 0;
																let statusClass: string;
																if (!hasItems)
																	statusClass = `bg-gray-700/30 border-gray-600/40 ${color}`;
																else if (pct < 75 || pct > 130)
																	statusClass =
																		"bg-red-900/30 border-red-700/50 text-red-300";
																else if (pct < 100 || pct > 115)
																	statusClass =
																		"bg-orange-900/30 border-orange-700/50 text-orange-300";
																else
																	statusClass =
																		"bg-green-900/30 border-green-700/50 text-green-300";
																return (
																	<div
																		className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[10px] ${statusClass}`}
																		key={bk}
																	>
																		{hasItems ? (
																			<>
																				<span>{pct}%</span>
																				<span className="opacity-50">·</span>
																				<span className="opacity-75">
																					{val}
																					{unit}
																				</span>
																			</>
																		) : (
																			"—"
																		)}
																		<span className="opacity-60">{bl}</span>
																	</div>
																);
															},
														)}
													</div>
												</div>
												{items.length === 0 ? (
													<p className="text-gray-600 text-xs italic">
														Sélectionner un aliment dans la bibliothèque puis
														cliquer sur le profil pour placer dans ce tronçon.
													</p>
												) : (
													<div className="flex flex-wrap gap-2">
														{items.map((p) => {
															const item = foodLibrary.find(
																(f) => f.id === p.foodItemId,
															);
															if (!item) return null;
															return (
																<div
																	className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-2 py-1.5"
																	key={p.id}
																>
																	<img
																		alt=""
																		className="h-6 w-6 object-contain"
																		height={24}
																		src={foodIconSrc(item)}
																		width={24}
																	/>
																	<div className="flex flex-col">
																		<span className="text-gray-300 text-xs">
																			{item.name}
																		</span>
																		<span className="text-[10px] text-gray-600">
																			{(p.distanceFromStart / 1000).toFixed(1)}{" "}
																			km
																		</span>
																	</div>
																	<button
																		className="ml-1 text-gray-600 transition-colors hover:text-red-400"
																		onClick={() => removePlacement(p.id)}
																		title="Retirer"
																		type="button"
																	>
																		<X size={12} />
																	</button>
																</div>
															);
														})}
													</div>
												)}
											</div>
										);
									})()
								)}
								{/* Note du tronçon */}
								<div className="flex flex-col gap-1.5">
									<span className="font-medium text-[11px] text-gray-500 uppercase tracking-wide">
										Note
									</span>
									<textarea
										className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-200 text-sm placeholder-gray-600 outline-none focus:border-gray-500"
										onChange={(e) =>
											setLegNotes((prev) => ({
												...prev,
												[key]: e.target.value,
											}))
										}
										placeholder="Ajouter une note pour ce segment…"
										rows={2}
										value={legNotes[key] ?? ""}
									/>
								</div>

								{/* Supprimer le ravito */}
								{endStation && (
									<div className="flex justify-end border-gray-800 border-t pt-3">
										<button
											className="flex items-center gap-2 text-gray-600 text-sm transition-colors hover:text-gray-400"
											onClick={() => setConfirmDeleteStationId(endStation.id)}
											type="button"
										>
											<Trash2 size={14} />
											Supprimer le ravitaillement « {endStation.name} »
										</button>
									</div>
								)}
							</dialog>
						</div>
					);
				})()}

			{/* AlertDialog for mode switch confirmation */}
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) setPendingMode(null);
				}}
				open={!!pendingMode}
			>
				<AlertDialogContent className="border-gray-700 bg-gray-900 text-gray-100">
					<AlertDialogHeader>
						<AlertDialogTitle className="text-gray-100">
							Changer de mode nutrition
						</AlertDialogTitle>
						<AlertDialogDescription className="text-gray-400">
							{pendingMode === "advanced"
								? "Passer en mode Avancé convertira vos quantités par tronçon en placements sur le profil. La conversion est approximative."
								: "Passer en mode Normal convertira vos placements sur le profil en quantités par tronçon. Les positions exactes seront perdues."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel className="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-100">
							Annuler
						</AlertDialogCancel>
						<AlertDialogAction
							className="border-0 bg-teal-900 text-teal-100 hover:bg-teal-800"
							onClick={confirmModeSwitch}
						>
							Confirmer
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* AlertDialog for delete confirmation */}
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setConfirmDeleteStationId(null);
					}
				}}
				open={!!confirmDeleteStationId}
			>
				<AlertDialogContent className="border-gray-700 bg-gray-900 text-gray-100">
					<AlertDialogHeader>
						<AlertDialogTitle className="text-gray-100">
							Supprimer le ravitaillement
						</AlertDialogTitle>
						<AlertDialogDescription className="text-gray-400">
							Supprimer{" "}
							<span className="font-semibold text-gray-200">
								{stationToDelete?.name}
							</span>{" "}
							? Cette action est irréversible.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel className="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-100">
							Annuler
						</AlertDialogCancel>
						<AlertDialogAction
							className="border-0 bg-red-900 text-red-100 hover:bg-red-800"
							onClick={() => {
								if (confirmDeleteStationId) {
									deleteStation(confirmDeleteStationId);
									setConfirmDeleteStationId(null);
									setSelectedLegIdx(null);
								}
							}}
						>
							Supprimer
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{aidStations.length === 0 && (
				<p className="text-center text-[11px] text-gray-600">
					Cliquer sur le profil pour placer un ravitaillement
				</p>
			)}

			{/* Impression */}
			<div
				className="flex items-center justify-between border-t border-gray-800 pt-4"
				data-print-hide=""
			>
				<div className="flex items-center gap-4">
					<span className="text-[11px] text-gray-600">
						Inclure dans l'impression :
					</span>
					{(
						[
							{ key: "chart", label: "Graphique" },
							{ key: "summary", label: "Bilan" },
						] as const
					).map(({ key, label }) => (
						<label
							className="flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-400"
							key={key}
						>
							<input
								checked={printOptions[key]}
								className="accent-teal-500"
								onChange={(e) =>
									setPrintOptions((p) => ({ ...p, [key]: e.target.checked }))
								}
								type="checkbox"
							/>
							{label}
						</label>
					))}
				</div>
				<button
					className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 hover:text-gray-100"
					onClick={() => handlePrint()}
					type="button"
				>
					<Printer size={13} />
					Imprimer / Exporter PDF
				</button>
			</div>
		</div>
	);
}
