"use client";

import { useMemo, useState, useEffect } from "react";
import { saveExerciseSets, fetchExerciseSets, fetchWeekData, fetchWeeksList, WeekListItem } from "@/lib/sheets-client";
import { Week, PersonalRecord, Exercise, Set } from "@/types";
import { ExerciseCard } from "@/components/ui/ExerciseCard";
import Stack from "@/components/ui/Stack";
import { ExerciseModal } from "@/components/ui/ExerciseModal";
import { DaySelector } from "@/components/ui/DaySelector";
import { SetupModal } from "@/components/modals/SetupModal";
import { useAuth } from "@/lib/hooks/useAuth";
import { Settings } from "lucide-react";

type HomeScreenProps = {
    initialWeek: Week;
    initialPrs: PersonalRecord[];
};

export function HomeScreen({ initialWeek, initialPrs }: HomeScreenProps) {
    const [week, setWeek] = useState<Week>(initialWeek);
    const [prs] = useState<PersonalRecord[]>(initialPrs);
    const [currentDayIndex, setCurrentDayIndex] = useState(0);
    const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [showWeekPicker, setShowWeekPicker] = useState(false);
    const [weeks, setWeeks] = useState<WeekListItem[]>([]);
    const [selectedWeekId, setSelectedWeekId] = useState<number>(initialWeek?.id || 1);
    const [selectedWeekName, setSelectedWeekName] = useState(initialWeek?.id ? `Semana ${initialWeek.id}` : "Semana 1");

    // Auth state
    const auth = useAuth();
    const [showSetupModal, setShowSetupModal] = useState(false);

    // Show setup modal if not fully configured (after initial load)
    useEffect(() => {
        if (!auth.isLoading && !auth.isSetupComplete) {
            setShowSetupModal(true);
        }
    }, [auth.isLoading, auth.isSetupComplete]);

    useEffect(() => {
        if (auth.isLoading) return;
        if (!auth.isSetupComplete) return;

        let cancelled = false;

        const loadWeeks = async () => {
            const fetchedWeeks = await fetchWeeksList();
            if (cancelled) return;

            const sorted = fetchedWeeks.sort((a, b) => a.id - b.id);
            setWeeks(sorted);

            const resolvedWeekId =
                sorted.some((w) => w.id === selectedWeekId)
                    ? selectedWeekId
                    : (sorted[0]?.id ?? 1);

            setSelectedWeekId(resolvedWeekId);
            setSelectedWeekName(`Semana ${resolvedWeekId}`);
        };

        loadWeeks();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth.isLoading, auth.isSetupComplete]);

    useEffect(() => {
        if (auth.isLoading) return;
        if (!auth.isSetupComplete) return;

        let cancelled = false;

        const loadWeek = async () => {
            try {
                const data = await fetchWeekData(selectedWeekId);
                if (cancelled) return;
                setWeek(data.week);
                setCurrentDayIndex(0);
                setSelectedWeekName(`Semana ${selectedWeekId}`);
            } catch (e) {
                console.error("Failed to load week:", e);
            }
        };

        loadWeek();

        return () => {
            cancelled = true;
        };
    }, [auth.isLoading, auth.isSetupComplete, selectedWeekId]);

    const prByExercise = useMemo(() => {
        const map = new Map<string, PersonalRecord>();
        for (const pr of prs) map.set(pr.exercise.toLowerCase(), pr);
        return map;
    }, [prs]);

    const currentDay = week.days[currentDayIndex];

    const exerciseCards = currentDay?.exercises.map((exercise, idx) => {
        const pr = prByExercise.get(exercise.name.toLowerCase());
        return (
            <div
                key={idx}
                className="w-full h-full"
                onClick={async () => {
                    setSelectedExercise(exercise);
                    setIsModalOpen(true);

                    // If the spreadsheet can be modified elsewhere, pull latest sets on open.
                    if (!auth.isSetupComplete) return;

                    try {
                        const { sets } = await fetchExerciseSets({
                            weekId: week.id,
                            dayId: currentDay.id,
                            exerciseName: exercise.name,
                        });

                        const normalizedSets: Set[] = (sets || []).map((s) => ({
                            // Misma convención que en el modal: 0x0 = vacío, pero peso 0 con reps>0 es válido.
                            weight: (s.weight === 0 && s.reps === 0) ? null : (s.weight ?? null),
                            reps: (s.weight === 0 && s.reps === 0) ? null : (s.reps ?? null),
                        }));

                                const hasFetchedFilled = normalizedSets.some((s) =>
                                    s.weight !== null && s.weight !== undefined && s.weight >= 0 &&
                                    s.reps !== null && s.reps !== undefined && s.reps > 0
                                );
                                const hasExistingFilled = (exercise.sets || []).some((s) =>
                                    s.weight !== null && s.weight !== undefined && s.weight >= 0 &&
                                    s.reps !== null && s.reps !== undefined && s.reps > 0
                                );

                                // Evitar “pisar” datos locales con un fetch vacío (suele ser ruido/rango incompleto).
                                if (!hasFetchedFilled && hasExistingFilled) {
                                    console.warn("fetchExerciseSets devolvió vacío; se mantiene el estado local:", {
                                        weekId: week.id,
                                        dayId: currentDay.id,
                                        exerciseName: exercise.name,
                                    });
                                    return;
                                }

                        setWeek((prev) => {
                            const updated = { ...prev };
                            const dayIdx = updated.days.findIndex((d) => d.id === currentDay.id);
                            if (dayIdx < 0) return prev;
                            const exIdx = updated.days[dayIdx].exercises.findIndex((e) => e.name === exercise.name);
                            if (exIdx < 0) return prev;
                            updated.days = [...updated.days];
                            updated.days[dayIdx] = { ...updated.days[dayIdx] };
                            updated.days[dayIdx].exercises = [...updated.days[dayIdx].exercises];
                            updated.days[dayIdx].exercises[exIdx] = {
                                ...updated.days[dayIdx].exercises[exIdx],
                                sets: normalizedSets,
                            };
                            return updated;
                        });

                        // Keep modal state in sync too.
                        setSelectedExercise((prev) => (prev && prev.name === exercise.name ? { ...prev, sets: normalizedSets } : prev));
                    } catch (e) {
                        console.error("Failed to preload sets:", e);
                    }
                }}
            >
                <ExerciseCard
                    exercise={exercise}
                    pr={pr}
                    isStacked
                    priority={idx === (currentDay.exercises.length - 1)}
                />
            </div>
        );
    }) || [];

    const handleSaveSeries = async (sets: Set[]) => {
        if (!selectedExercise || !week || !currentDay) return;

        try {
            // Filter out sets with null values and convert to the format expected by saveExerciseSets
            const validSets = sets
                .filter(s => s.weight !== null && s.reps !== null && !(s.weight === 0 && s.reps === 0))
                .map(s => ({ weight: s.weight!, reps: s.reps! }));

            if (validSets.length > 0) {
                await saveExerciseSets(week.id, currentDay.id, selectedExercise.name, validSets);
            }

            // Optionally update local state to show progress immediately
            const updatedWeek = { ...week };
            const dayIdx = updatedWeek.days.findIndex(d => d.id === currentDay.id);
            const exIdx = updatedWeek.days[dayIdx].exercises.findIndex(e => e.name === selectedExercise.name);

            if (dayIdx >= 0 && exIdx >= 0) {
                updatedWeek.days[dayIdx].exercises[exIdx].sets = sets;
                setWeek(updatedWeek);
            }
        } catch (error) {
            console.error("Failed to save series:", error);
        }
    };

    return (
        <div className="min-h-[calc(100dvh-(var(--bottom-nav-base)+env(safe-area-inset-bottom)))] w-full flex flex-col bg-[#F2F2F7] overflow-x-hidden">
            {/* Header with Week Picker - Increased z-index to sit above DaySelector */}
            <header className="flex justify-between items-center px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-2 shrink-0 z-30 relative">
                <div className="relative">
                    <button
                        onClick={() => setShowWeekPicker(!showWeekPicker)}
                        className="flex items-center gap-2 active:opacity-60 transition-opacity"
                    >
                        <h1 className="text-3xl font-black tracking-tight text-black">
                            {selectedWeekName}
                        </h1>
                        <div className={`text-ios-blue transition-transform ${showWeekPicker ? "rotate-180" : ""}`}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                    </button>

                    {/* Week Picker Dropdown */}
                    {showWeekPicker && (
                        <div className="absolute top-full left-0 mt-2 w-48 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-black/5 overflow-hidden origin-top-left animate-in fade-in zoom-in-95 duration-200">
                            {weeks.map((w, idx) => (
                                <button
                                    key={String(w.id)}
                                    className="w-full text-left px-4 py-3 font-bold text-sm hover:bg-black/5 active:bg-black/10 transition-colors border-b border-black/5 last:border-0"
                                    onClick={() => {
                                        setSelectedWeekId(w.id);
                                        setSelectedWeekName(w.name);
                                        setShowWeekPicker(false);
                                        setCurrentDayIndex(0);
                                    }}
                                >
                                    {w.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Settings Button */}
                    <button
                        onClick={() => setShowSetupModal(true)}
                        className="w-10 h-10 bg-white rounded-full shadow-sm border border-black/5 flex items-center justify-center text-gray-500 active:scale-95 transition-transform"
                    >
                        <Settings size={18} />
                    </button>

                    {/* Profile Avatar */}
                    <div className="bg-white rounded-full p-1.5 shadow-sm border border-black/5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ring-2 ring-white ${auth.isSetupComplete ? "bg-ios-green" : "bg-ios-orange"}`}>
                            {auth.isSetupComplete ? "✓" : "!"}
                        </div>
                    </div>
                </div>
            </header>

            {/* Day Selector */}
            <div className="px-6 pb-2 shrink-0 z-20">
                <DaySelector
                    days={week?.days || []}
                    selectedIndex={currentDayIndex}
                    onSelect={setCurrentDayIndex}
                />
            </div>

            {/* Active Day Content - fills remaining space */}
            <div className="flex-1 flex flex-col items-center justify-center relative min-h-0 -mt-4 overflow-hidden">
                {currentDay ? (
                    <div className="w-full max-w-sm h-full flex flex-col">
                        {/* Card Stack Container */}
                        <div className="w-full h-[420px] relative flex items-center justify-center px-4">
                            <Stack
                                cards={exerciseCards}
                                sensitivity={150}
                                randomRotation={true}
                                animationConfig={{ stiffness: 300, damping: 25 }}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="text-center p-8 text-ios-gray">
                        <p>No hay rutina programada para hoy.</p>
                    </div>
                )}
            </div>

            {/* Exercise Modal */}
            {selectedExercise && (
                <ExerciseModal
                    exercise={selectedExercise}
                    pr={prByExercise.get(selectedExercise.name.toLowerCase())}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSaveSeries}
                />
            )}

            {/* Setup Modal */}
            <SetupModal
                isOpen={showSetupModal}
                onClose={() => setShowSetupModal(false)}
                onComplete={() => {
                    auth.refresh();
                    setShowSetupModal(false);
                }}
                isAuthenticated={auth.isAuthenticated}
                hasSpreadsheet={auth.hasSpreadsheet}
                currentSpreadsheetId={auth.spreadsheetId}
            />
        </div>
    );
}
