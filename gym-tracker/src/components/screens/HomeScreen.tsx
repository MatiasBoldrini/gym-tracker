"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { saveExerciseSets, fetchExerciseSets, fetchWeekData, fetchWeeksList, WeekListItem } from "@/lib/sheets-client";
import { Week, PersonalRecord, Exercise, Set } from "@/types";
import { ExerciseCard } from "@/components/ui/ExerciseCard";
import Stack from "@/components/ui/Stack";
import { ExerciseModal } from "@/components/ui/ExerciseModal";
import { DaySelector } from "@/components/ui/DaySelector";
import { SetupModal } from "@/components/modals/SetupModal";
import { useAuth } from "@/lib/hooks/useAuth";
import { EyeOff, Loader2, Settings, Sparkles } from "lucide-react";
import { normalizeExerciseKey } from "@/lib/normalize";

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

    // Info popover (rutina + progreso)
    const [showInfoPopover, setShowInfoPopover] = useState(false);
    const [isRefreshingInfo, setIsRefreshingInfo] = useState(false);
    const infoPopoverRef = useRef<HTMLDivElement>(null);

    // Ocultar ejercicios completados + toast
    const [hideCompleted, setHideCompleted] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        for (const pr of prs) map.set(normalizeExerciseKey(pr.exercise), pr);
        return map;
    }, [prs]);

    const currentDay = week.days[currentDayIndex];

    const isExerciseComplete = (exercise: Exercise) => {
        const targetSetCount = Math.max(
            1,
            parseInt(exercise.prescribedSeries?.toString().split(/[\sxX]+/)[0]) || 3
        );
        const completedSetsCount = exercise.sets?.slice(0, targetSetCount).filter(s =>
            s.weight !== null && s.weight !== undefined && s.weight >= 0 &&
            s.reps !== null && s.reps !== undefined && s.reps > 0
        ).length || 0;

        return completedSetsCount >= targetSetCount;
    };

    const visibleExercises = useMemo(() => {
        if (!currentDay) return [];
        if (!hideCompleted) return currentDay.exercises;
        return currentDay.exercises.filter((exercise) => !isExerciseComplete(exercise));
    }, [currentDay, hideCompleted]);

    const routineProgress = useMemo(() => {
        if (!currentDay) return [];

        const isValidSet = (s: Set) =>
            s.weight !== null && s.weight !== undefined && s.weight >= 0 &&
            s.reps !== null && s.reps !== undefined && s.reps > 0;

        return currentDay.exercises.map((exercise) => {
            const targetSetCount = Math.max(
                1,
                parseInt(exercise.prescribedSeries?.toString().split(/[\sxX]+/)[0]) || 3
            );
            const completedSetsCount = exercise.sets?.slice(0, targetSetCount).filter(isValidSet).length || 0;
            return {
                name: exercise.name,
                completed: completedSetsCount,
                target: targetSetCount,
                isComplete: completedSetsCount >= targetSetCount,
            };
        });
    }, [currentDay]);

    // Calcular porcentaje total de la rutina del día
    const routinePercentage = useMemo(() => {
        if (routineProgress.length === 0) return 0;
        const totalCompleted = routineProgress.reduce((sum, item) => sum + item.completed, 0);
        const totalTarget = routineProgress.reduce((sum, item) => sum + item.target, 0);
        if (totalTarget === 0) return 0;
        return Math.round((totalCompleted / totalTarget) * 100);
    }, [routineProgress]);

    useEffect(() => {
        if (!showInfoPopover) return;

        const handlePointerDown = (e: MouseEvent | TouchEvent) => {
            const el = infoPopoverRef.current;
            if (!el) return;
            if (e.target instanceof Node && !el.contains(e.target)) {
                setShowInfoPopover(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setShowInfoPopover(false);
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("touchstart", handlePointerDown, { passive: true });
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("touchstart", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [showInfoPopover]);

    useEffect(() => {
        if (!showInfoPopover) return;
        if (auth.isLoading) return;
        if (!auth.isSetupComplete) return;
        if (!currentDay) return;

        const weekId = week.id;
        const dayId = currentDay.id;
        const exerciseNames = currentDay.exercises.map((e) => e.name);

        let cancelled = false;

        const refresh = async () => {
            setIsRefreshingInfo(true);
            try {
                const results = await Promise.all(
                    exerciseNames.map(async (exerciseName) => {
                        try {
                            const { sets } = await fetchExerciseSets({ weekId, dayId, exerciseName });
                            const normalized: Set[] = (sets || []).map((s) => ({
                                // 0x0 = vacío; peso 0 con reps>0 es válido.
                                weight: (s.weight === 0 && s.reps === 0) ? null : (s.weight ?? null),
                                reps: (s.weight === 0 && s.reps === 0) ? null : (s.reps ?? null),
                            }));
                            return { exerciseName, sets: normalized };
                        } catch {
                            return { exerciseName, sets: null as Set[] | null };
                        }
                    })
                );

                if (cancelled) return;

                setWeek((prev) => {
                    const updated = { ...prev };
                    const dayIdx = updated.days.findIndex((d) => d.id === dayId);
                    if (dayIdx < 0) return prev;

                    const day = updated.days[dayIdx];
                    updated.days = [...updated.days];
                    updated.days[dayIdx] = { ...day, exercises: [...day.exercises] };

                    for (const r of results) {
                        if (!r.sets) continue;
                        const exIdx = updated.days[dayIdx].exercises.findIndex((e) => e.name === r.exerciseName);
                        if (exIdx < 0) continue;
                        updated.days[dayIdx].exercises[exIdx] = {
                            ...updated.days[dayIdx].exercises[exIdx],
                            sets: r.sets,
                        };
                    }

                    return updated;
                });
            } finally {
                if (!cancelled) setIsRefreshingInfo(false);
            }
        };

        refresh();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showInfoPopover, auth.isLoading, auth.isSetupComplete, week.id, currentDayIndex]);

    useEffect(() => {
        return () => {
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        };
    }, []);

    const showToast = (message: string) => {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setToastMessage(message);
        toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 1800);
    };

    const exerciseCards = visibleExercises.map((exercise, idx) => {
        const pr = prByExercise.get(normalizeExerciseKey(exercise.name));
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
                    priority={idx === (visibleExercises.length - 1)}
                />
            </div>
        );
    }) || [];

    const shouldShowCompletionCard =
        hideCompleted &&
        !!currentDay &&
        currentDay.exercises.length > 0 &&
        visibleExercises.length === 0;

    const completionCard = (
        <div className="bg-white rounded-[32px] p-6 h-full flex flex-col border border-black/5 shadow-[0_10px_30px_-14px_rgba(0,0,0,0.28)]">
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-ios-green/15 text-ios-green flex items-center justify-center">
                    <Sparkles size={22} />
                </div>
                <div className="text-xl font-black text-black">
                    ¡Rutina completada!
                </div>
                <p className="text-sm font-bold text-gray-500">
                    No quedan ejercicios pendientes hoy.
                </p>
            </div>
        </div>
    );

    const cardsToRender = shouldShowCompletionCard ? [completionCard] : exerciseCards;

    const handleToggleHideCompleted = () => {
        setHideCompleted((prev) => {
            const next = !prev;
            showToast(next ? "Ejercicios completados ocultos" : "Ejercicios completados visibles");
            return next;
        });
        setShowWeekPicker(false);
        setShowInfoPopover(false);
    };

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

                // Mantener el ejercicio seleccionado sincronizado.
                setSelectedExercise((prev) => (prev && prev.name === selectedExercise.name ? { ...prev, sets } : prev));

                // Si el ejercicio quedó completo, cerrar el modal automáticamente.
                const completedNow = isExerciseComplete({ ...selectedExercise, sets });
                if (completedNow) {
                    setIsModalOpen(false);
                }
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
                    {/* Toggle ocultar completados */}
                    <button
                        onClick={handleToggleHideCompleted}
                        aria-pressed={hideCompleted}
                        className={`w-10 h-10 rounded-full shadow-sm border border-black/5 flex items-center justify-center active:scale-95 transition-all ${
                            hideCompleted ? "bg-black text-white" : "bg-white text-gray-500"
                        }`}
                        aria-label={hideCompleted ? "Mostrar ejercicios completados" : "Ocultar ejercicios completados"}
                    >
                        <EyeOff size={18} />
                    </button>

                    {/* Settings Button */}
                    <button
                        onClick={() => setShowSetupModal(true)}
                        className="w-10 h-10 bg-white rounded-full shadow-sm border border-black/5 flex items-center justify-center text-gray-500 active:scale-95 transition-transform"
                    >
                        <Settings size={18} />
                    </button>

                    {/* Info Popover */}
                    <div ref={infoPopoverRef} className="relative">
                        <button
                            type="button"
                            onClick={() => {
                                setShowInfoPopover((v) => !v);
                                setShowWeekPicker(false);
                            }}
                            className="w-10 h-10 relative flex items-center justify-center active:scale-95 transition-transform"
                            aria-label="Info de rutina de hoy"
                            aria-expanded={showInfoPopover}
                        >
                            {/* Circular progress ring */}
                            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 40 40">
                                {/* Background circle */}
                                <circle
                                    cx="20"
                                    cy="20"
                                    r="18"
                                    fill="white"
                                    stroke="#E5E5EA"
                                    strokeWidth="2.5"
                                />
                                {/* Progress circle */}
                                <circle
                                    cx="20"
                                    cy="20"
                                    r="18"
                                    fill="none"
                                    stroke={routinePercentage === 100 ? "#34C759" : "#007AFF"}
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeDasharray={`${(routinePercentage / 100) * 113.1} 113.1`}
                                    className="transition-all duration-500"
                                />
                            </svg>
                            {/* Percentage text */}
                            <span className={`relative z-10 text-[10px] font-black tabular-nums ${routinePercentage === 100 ? "text-ios-green" : "text-black"}`}>
                                {routinePercentage}%
                            </span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Routine Info Modal Backdrop with Blur */}
            {showInfoPopover && (
                <div 
                    className="fixed inset-0 z-40 bg-black/20 backdrop-blur-md"
                    onClick={() => setShowInfoPopover(false)}
                />
            )}

            {/* Routine Info Modal */}
            {showInfoPopover && (
                <div 
                    className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-3rem)] max-w-sm bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-black/5 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                >
                    <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-black tracking-wider text-gray-400">
                                Rutina de hoy
                            </span>
                            <span className="text-lg font-black text-black">
                                {currentDay ? `Día ${currentDay.id}` : "Sin rutina"}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            {isRefreshingInfo && (
                                <div className="text-gray-400">
                                    <Loader2 size={16} className="animate-spin" />
                                </div>
                            )}
                            <div className={`text-xl font-black tabular-nums ${routinePercentage === 100 ? "text-ios-green" : "text-ios-blue"}`}>
                                {routinePercentage}%
                            </div>
                        </div>
                    </div>

                    {!currentDay ? (
                        <div className="px-5 py-6 text-sm font-bold text-gray-400 text-center">
                            No hay rutina programada para hoy.
                        </div>
                    ) : routineProgress.length === 0 ? (
                        <div className="px-5 py-6 text-sm font-bold text-gray-400 text-center">
                            No hay ejercicios para este día.
                        </div>
                    ) : (
                        <ul className="max-h-80 overflow-auto">
                            {routineProgress.map((item) => (
                                <li
                                    key={item.name}
                                    className="px-5 py-3.5 flex items-center justify-between gap-3 border-b border-black/5 last:border-0"
                                >
                                    <span className="text-sm font-bold text-black truncate">
                                        {item.name}
                                    </span>
                                    <span className={`text-sm font-black tabular-nums ${item.isComplete ? "text-ios-green" : "text-gray-400"}`}>
                                        {item.completed}/{item.target}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

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
                                cards={cardsToRender}
                                sensitivity={150}
                                randomRotation={true}
                                animationConfig={{ stiffness: 300, damping: 25 }}
                                disabled={isModalOpen || shouldShowCompletionCard}
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
                    pr={prByExercise.get(normalizeExerciseKey(selectedExercise.name))}
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

            {/* Toast inferior */}
            {toastMessage && (
                <div className="fixed bottom-[calc(var(--bottom-nav-base)+env(safe-area-inset-bottom)+1rem)] left-1/2 -translate-x-1/2 z-50">
                    <div className="bg-black text-white px-4 py-3 rounded-full shadow-lg text-sm font-semibold">
                        {toastMessage}
                    </div>
                </div>
            )}
        </div>
    );
}
