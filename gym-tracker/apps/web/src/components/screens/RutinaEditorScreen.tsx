"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, Save, Check, Plus } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
    fetchExercisesList,
    fetchSeriesOptions,
    fetchDayRoutine,
    saveRoutine,
    fetchRoutineDaysSummary,
    type ExerciseItem,
    type RoutineExercise,
    type DaySummary,
} from "@/lib/sheets-client";
import { DayRoutineEditor } from "@/components/ui/DayRoutineEditor";
import { DaySelector } from "@/components/ui/DaySelector";
import { ExerciseSearchModal } from "@/components/ui/ExerciseSearchModal";
import { cacheUrls } from "@/lib/pwa";

import type { Day } from "@/types";

// All possible days (1-5)
const ALL_DAYS: Day[] = [
    { id: 1, name: "DIA 1", exercises: [] },
    { id: 2, name: "DIA 2", exercises: [] },
    { id: 3, name: "DIA 3", exercises: [] },
    { id: 4, name: "DIA 4", exercises: [] },
    { id: 5, name: "DIA 5", exercises: [] },
];

type ExerciseWithImage = RoutineExercise & { image?: string };

export function RutinaEditorScreen() {
    const auth = useAuth();

    // Data state
    const [availableExercises, setAvailableExercises] = useState<ExerciseItem[]>([]);
    const [seriesOptions, setSeriesOptions] = useState<string[]>([]);
    const [daysSummary, setDaysSummary] = useState<DaySummary[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Current editing state
    const [selectedDayId, setSelectedDayId] = useState<number>(1);
    const [dayExercises, setDayExercises] = useState<ExerciseWithImage[]>([]);
    const [isLoadingDay, setIsLoadingDay] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Compute visible days: days with exercises + currently selected day
    const visibleDays = useMemo(() => {
        const nonEmptyDayIds = new Set(
            daysSummary.filter((d) => d.exercisesCount > 0).map((d) => d.id)
        );
        // Always include the currently selected day
        nonEmptyDayIds.add(selectedDayId);

        return ALL_DAYS.filter((d) => nonEmptyDayIds.has(d.id));
    }, [daysSummary, selectedDayId]);

    // Find selected day index in visible days
    const selectedDayIndex = useMemo(() => {
        const idx = visibleDays.findIndex((d) => d.id === selectedDayId);
        return idx >= 0 ? idx : 0;
    }, [visibleDays, selectedDayId]);

    // Find next available empty day (for "+ Día" button)
    const nextEmptyDayId = useMemo(() => {
        const nonEmptyDayIds = new Set(
            daysSummary.filter((d) => d.exercisesCount > 0).map((d) => d.id)
        );
        // Also consider current day as "occupied" for this purpose
        nonEmptyDayIds.add(selectedDayId);

        for (let i = 1; i <= 5; i++) {
            if (!nonEmptyDayIds.has(i)) {
                return i;
            }
        }
        return null; // All 5 days are used
    }, [daysSummary, selectedDayId]);

    // Saving state
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Modal state
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

    // Toast state
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (message: string) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 2000);
    };

    // Load initial data (exercises, series, and days summary)
    useEffect(() => {
        if (!auth.isAuthenticated) return;

        let cancelled = false;

        const loadData = async () => {
            setIsLoadingData(true);
            try {
                const [exercisesData, seriesData, daysData] = await Promise.all([
                    fetchExercisesList(),
                    fetchSeriesOptions(),
                    fetchRoutineDaysSummary(),
                ]);

                if (cancelled) return;

                setAvailableExercises(exercisesData);
                setSeriesOptions(seriesData);
                setDaysSummary(daysData);

                // Set initial selected day to first non-empty day, or day 1 if all empty
                const firstNonEmptyDay = daysData.find((d) => d.exercisesCount > 0);
                if (firstNonEmptyDay) {
                    setSelectedDayId(firstNonEmptyDay.id);
                }

                // Cache all exercise images in background
                const urls = exercisesData
                    .map((e) => (e.image ? `/images/exercises/${e.image}` : null))
                    .filter((u): u is string => !!u);
                void cacheUrls(urls);
            } catch (error: any) {
                console.error("Error loading data:", error);
                setErrorMessage(error.message || "Error al cargar datos");
            } finally {
                if (!cancelled) setIsLoadingData(false);
            }
        };

        loadData();
        return () => {
            cancelled = true;
        };
    }, [auth.isAuthenticated]);

    // Create exercise mapping for images
    const exerciseImageMap = useCallback(() => {
        const map = new Map<string, string>();
        availableExercises.forEach((e) => {
            if (e.image) {
                map.set(e.name.toLowerCase(), e.image);
            }
        });
        return map;
    }, [availableExercises]);

    // Load day routine when day changes
    useEffect(() => {
        if (!auth.isAuthenticated || isLoadingData) return;

        let cancelled = false;

        const loadDayRoutine = async () => {
            setIsLoadingDay(true);
            setHasChanges(false);
            setErrorMessage(null); // Clear previous error when starting new load
            try {
                const exercises = await fetchDayRoutine(selectedDayId);
                if (cancelled) return;

                // Enrich with images
                const imageMap = exerciseImageMap();
                const enriched: ExerciseWithImage[] = exercises.map((e) => ({
                    ...e,
                    image: imageMap.get(e.name.toLowerCase()) || undefined,
                }));

                setDayExercises(enriched);
            } catch (error: any) {
                // Don't show error if the request was cancelled (user switched days quickly)
                if (cancelled) return;
                console.error("Error loading day routine:", error);
                setErrorMessage(error.message || "Error al cargar la rutina del día");
                setDayExercises([]);
            } finally {
                if (!cancelled) setIsLoadingDay(false);
            }
        };

        loadDayRoutine();
        return () => {
            cancelled = true;
        };
    }, [auth.isAuthenticated, selectedDayId, isLoadingData, exerciseImageMap]);

    const handleDayChange = (index: number) => {
        if (hasChanges) {
            const confirm = window.confirm(
                "Tenés cambios sin guardar. ¿Querés cambiar de día y perderlos?"
            );
            if (!confirm) return;
        }
        // Get the day ID from visible days
        const newDayId = visibleDays[index]?.id;
        if (newDayId) {
            setSelectedDayId(newDayId);
        }
    };

    const handleAddDay = () => {
        if (nextEmptyDayId === null) return;

        if (hasChanges) {
            const confirm = window.confirm(
                "Tenés cambios sin guardar. ¿Querés agregar un nuevo día y perderlos?"
            );
            if (!confirm) return;
        }

        setSelectedDayId(nextEmptyDayId);
        showToast(`Día ${nextEmptyDayId} habilitado`);
    };

    const handleExercisesChange = (exercises: ExerciseWithImage[]) => {
        setDayExercises(exercises);
        setHasChanges(true);
        setSaveSuccess(false);
    };

    const handleAddExercise = async (exercise: { name: string; prescribedSeries: string; image: string }) => {
        const newExercise: ExerciseWithImage = {
            name: exercise.name,
            prescribedSeries: exercise.prescribedSeries,
            image: exercise.image || undefined,
        };

        const updatedExercises = [...dayExercises, newExercise];
        setDayExercises(updatedExercises);
        setIsSearchModalOpen(false);

        // Guardado automático
        setIsSaving(true);
        setErrorMessage(null);

        try {
            const result = await saveRoutine(
                selectedDayId,
                updatedExercises.map((e) => ({
                    name: e.name,
                    prescribedSeries: e.prescribedSeries,
                }))
            );

            if (!result.ok) {
                throw new Error(result.error || "Error al guardar");
            }

            setHasChanges(false);
            setSaveSuccess(true);
            showToast(`${exercise.name} agregado y guardado`);
            setTimeout(() => setSaveSuccess(false), 2000);

            // Refresh days summary to update visible days
            refreshDaysSummary();
        } catch (error: any) {
            console.error("Error saving routine:", error);
            setErrorMessage(error.message || "Error al guardar la rutina");
            setHasChanges(true);
            showToast(`${exercise.name} agregado (sin guardar)`);
        } finally {
            setIsSaving(false);
        }
    };

    // Refresh days summary after saves
    const refreshDaysSummary = async () => {
        try {
            const daysData = await fetchRoutineDaysSummary();
            setDaysSummary(daysData);
        } catch (e) {
            console.error("Failed to refresh days summary:", e);
        }
    };

    const handleSave = async () => {
        if (!hasChanges) return;

        setIsSaving(true);
        setErrorMessage(null);

        try {
            const result = await saveRoutine(
                selectedDayId,
                dayExercises.map((e) => ({
                    name: e.name,
                    prescribedSeries: e.prescribedSeries,
                }))
            );

            if (!result.ok) {
                throw new Error(result.error || "Error al guardar");
            }

            setHasChanges(false);
            setSaveSuccess(true);
            showToast("Rutina guardada correctamente");

            // Refresh days summary to update visible days
            refreshDaysSummary();

            // Reset success indicator after a delay
            setTimeout(() => setSaveSuccess(false), 2000);
        } catch (error: any) {
            console.error("Error saving routine:", error);
            setErrorMessage(error.message || "Error al guardar la rutina");
        } finally {
            setIsSaving(false);
        }
    };

    // Loading state
    if (auth.isLoading || isLoadingData) {
        return (
            <div className="min-h-[calc(100dvh-(var(--bottom-nav-base)+env(safe-area-inset-bottom)))] w-full flex flex-col items-center justify-center bg-[#F2F2F7]">
                <Loader2 className="w-8 h-8 animate-spin text-ios-blue" />
                <p className="mt-4 text-gray-500 font-medium">Cargando ejercicios...</p>
            </div>
        );
    }

    // Not authenticated
    if (!auth.isAuthenticated) {
        return (
            <div className="min-h-[calc(100dvh-(var(--bottom-nav-base)+env(safe-area-inset-bottom)))] w-full flex flex-col items-center justify-center bg-[#F2F2F7] px-8">
                <div className="text-center">
                    <h2 className="text-2xl font-black text-black mb-2">
                        Conectá tu cuenta
                    </h2>
                    <p className="text-gray-500 mb-6">
                        Para editar tu rutina, primero conectá tu cuenta de Google.
                    </p>
                    <button
                        onClick={() => auth.login()}
                        className="px-6 py-3 bg-black text-white rounded-2xl font-bold"
                    >
                        Conectar con Google
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-[calc(100dvh-(var(--bottom-nav-base)+env(safe-area-inset-bottom)))] w-full flex flex-col bg-[#F2F2F7] overflow-hidden">
            {/* Header */}
            <header className="px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-4 shrink-0">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-black tracking-tight text-black">
                        Crear Rutina
                    </h1>
                    <div className="flex items-center gap-2">
                        {/* Add Day Button */}
                        {nextEmptyDayId !== null && (
                            <button
                                onClick={handleAddDay}
                                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-bold text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all"
                                title={`Agregar Día ${nextEmptyDayId}`}
                            >
                                <Plus size={16} />
                                <span className="hidden sm:inline">Día</span>
                            </button>
                        )}
                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            disabled={!hasChanges || isSaving}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${saveSuccess
                                    ? "bg-ios-green text-white"
                                    : hasChanges
                                        ? "bg-ios-blue text-white"
                                        : "bg-gray-200 text-gray-400"
                                } disabled:opacity-50`}
                        >
                            {isSaving ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : saveSuccess ? (
                                <Check size={18} />
                            ) : (
                                <Save size={18} />
                            )}
                            {saveSuccess ? "Guardado" : "Guardar"}
                        </button>
                    </div>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                    Semana 1 · Día {selectedDayId} · {dayExercises.length} ejercicios
                </p>
            </header>

            {/* Error Banner */}
            {errorMessage && (
                <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl">
                    <p className="text-sm text-red-700 font-medium">{errorMessage}</p>
                </div>
            )}

            {/* Day Selector */}
            {visibleDays.length > 0 && (
                <div className="px-6 pb-4">
                    <DaySelector
                        days={visibleDays}
                        selectedIndex={selectedDayIndex}
                        onSelect={handleDayChange}
                        variant="black"
                        layoutId="rutina-editor-day-pill"
                    />
                </div>
            )}

            {/* Exercise List */}
            <div className="flex-1 px-6 pb-8 overflow-y-auto min-h-0">
                {isLoadingDay ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-ios-blue" />
                    </div>
                ) : (
                    <DayRoutineEditor
                        exercises={dayExercises}
                        onExercisesChange={handleExercisesChange}
                        onAddExercise={() => setIsSearchModalOpen(true)}
                        maxExercises={7}
                    />
                )}
            </div>

            {/* Exercise Search Modal */}
            <ExerciseSearchModal
                isOpen={isSearchModalOpen}
                onClose={() => setIsSearchModalOpen(false)}
                exercises={availableExercises}
                seriesOptions={seriesOptions}
                onAddExercise={handleAddExercise}
                existingExerciseNames={dayExercises.map((e) => e.name)}
            />

            {/* Toast */}
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
