"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Check, Loader2, X, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import {
    fetchExercisesList,
    fetchSeriesOptions,
    saveRoutine,
    createMesociclo,
    ExerciseItem,
    RoutineExercise,
} from "@/lib/sheets-client";
import { ExerciseSearchModal } from "@/components/ui/ExerciseSearchModal";
import { BodyMapInteractive } from "@/components/ui/BodyMapInteractive";
import { MUSCLE_MAPPING, parseSeriesCount, getCategoryFromSvgId } from "@/lib/fatiga";

type Step = "days" | "muscles" | "exercises" | "weeks" | "complete";

interface OnboardingWizardProps {
    isOpen: boolean;
    onComplete: () => void;
    onSkip?: () => void;
}

interface DayConfig {
    dayId: number;
    muscles: string[];
    exercises: (RoutineExercise & { image?: string; muscle?: string })[];
}

export function OnboardingWizard({ isOpen, onComplete, onSkip }: OnboardingWizardProps) {
    // Wizard state
    const [step, setStep] = useState<Step>("days");
    const [totalDays, setTotalDays] = useState<number>(0);
    const [currentDayIndex, setCurrentDayIndex] = useState(0);
    const [daysConfig, setDaysConfig] = useState<DayConfig[]>([]);
    const [totalWeeks, setTotalWeeks] = useState<number>(0);

    // Data state
    const [availableExercises, setAvailableExercises] = useState<ExerciseItem[]>([]);
    const [seriesOptions, setSeriesOptions] = useState<string[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // UI state
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // BodyMap popover state
    const [selectedBodyMapMuscle, setSelectedBodyMapMuscle] = useState<string | null>(null);
    const [selectedBodyMapGroupId, setSelectedBodyMapGroupId] = useState<string | null>(null);
    const [isBodyMapPopoverOpen, setIsBodyMapPopoverOpen] = useState(false);
    const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);

    // Get unique muscles from exercises
    const availableMuscles = useMemo(() => {
        const set = new Set<string>();
        availableExercises.forEach((e) => {
            if (e.muscle) set.add(e.muscle);
        });
        return Array.from(set).sort();
    }, [availableExercises]);

    // Current day being configured
    const currentDay = daysConfig[currentDayIndex];

    // Compute weekly series by category (across all days) for bodymap coloring
    const { weeklySeriesByCategory, intensityByGroupId } = useMemo(() => {
        const seriesByCategory: Record<string, number> = {};

        // Sum series from all days
        daysConfig.forEach((day) => {
            day.exercises.forEach((exercise) => {
                const muscle = exercise.muscle?.toLowerCase().trim();
                if (!muscle) return;
                const seriesCount = parseSeriesCount(exercise.prescribedSeries);
                seriesByCategory[muscle] = (seriesByCategory[muscle] || 0) + seriesCount;
            });
        });

        // Map category series to SVG group IDs
        const intensities: Record<string, number> = {};
        Object.entries(seriesByCategory).forEach(([category, series]) => {
            const svgIds = MUSCLE_MAPPING[category] || [];
            svgIds.forEach((id) => {
                // Accumulate if multiple categories map to same ID (unlikely but safe)
                intensities[id] = (intensities[id] || 0) + series;
            });
        });

        return { weeklySeriesByCategory: seriesByCategory, intensityByGroupId: intensities };
    }, [daysConfig]);

    // Get SVG IDs that are selected for the current day (for highlighting)
    const currentDayHighlightedIds = useMemo(() => {
        if (!currentDay) return [];
        const ids: string[] = [];
        currentDay.muscles.forEach((muscle) => {
            const svgIds = MUSCLE_MAPPING[muscle.toLowerCase().trim()] || [];
            ids.push(...svgIds);
        });
        return ids;
    }, [currentDay]);

    // Reset wizard state when opened
    useEffect(() => {
        if (isOpen) {
            setStep("days");
            setTotalDays(0);
            setCurrentDayIndex(0);
            setDaysConfig([]);
            setTotalWeeks(0);
            setErrorMessage(null);
        }
    }, [isOpen]);

    // Load initial data
    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;

        const loadData = async () => {
            setIsLoadingData(true);
            try {
                const [exercisesData, seriesData] = await Promise.all([
                    fetchExercisesList(),
                    fetchSeriesOptions(),
                ]);

                if (cancelled) return;

                setAvailableExercises(exercisesData);
                setSeriesOptions(seriesData);
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
    }, [isOpen]);

    // Initialize days config when totalDays is set
    useEffect(() => {
        if (totalDays > 0 && daysConfig.length === 0) {
            const config: DayConfig[] = [];
            for (let i = 1; i <= totalDays; i++) {
                config.push({ dayId: i, muscles: [], exercises: [] });
            }
            setDaysConfig(config);
        }
    }, [totalDays, daysConfig.length]);

    // Toggle muscle selection for current day
    const toggleMuscle = (muscle: string) => {
        setDaysConfig((prev) => {
            const updated = [...prev];
            const day = updated[currentDayIndex];
            if (day.muscles.includes(muscle)) {
                day.muscles = day.muscles.filter((m) => m !== muscle);
            } else {
                day.muscles = [...day.muscles, muscle];
            }
            return updated;
        });
    };

    // Handle bodymap muscle click
    const handleBodyMapMuscleClick = (muscleId: string, e: React.MouseEvent) => {
        const category = getCategoryFromSvgId(muscleId);
        if (!category) return;

        // Calculate position for popover
        const rect = e.currentTarget.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top;

        setSelectedBodyMapMuscle(category);
        setSelectedBodyMapGroupId(muscleId);
        setPopoverPosition({ x, y });
        setIsBodyMapPopoverOpen(true);
    };

    // Get series count for a category
    const getSeriesForCategory = (category: string): number => {
        return weeklySeriesByCategory[category.toLowerCase().trim()] || 0;
    };

    // Check if a category is selected for the current day
    const isCategorySelectedForCurrentDay = (category: string): boolean => {
        if (!currentDay) return false;
        return currentDay.muscles.some(
            (m) => m.toLowerCase().trim() === category.toLowerCase().trim()
        );
    };

    // Add exercise to current day
    const handleAddExercise = useCallback((exercise: { name: string; prescribedSeries: string; image: string; muscle?: string }) => {
        setDaysConfig((prev) => {
            const updated = [...prev];
            const day = updated[currentDayIndex];
            day.exercises = [
                ...day.exercises,
                {
                    name: exercise.name,
                    prescribedSeries: exercise.prescribedSeries,
                    image: exercise.image || undefined,
                    muscle: exercise.muscle,
                },
            ];
            return updated;
        });
        setIsSearchModalOpen(false);
    }, [currentDayIndex]);

    // Remove exercise from current day
    const handleRemoveExercise = (index: number) => {
        setDaysConfig((prev) => {
            const updated = [...prev];
            const day = updated[currentDayIndex];
            day.exercises = day.exercises.filter((_, i) => i !== index);
            return updated;
        });
    };

    // Save current day's routine and move to next
    const saveCurrentDayAndContinue = async () => {
        if (!currentDay || currentDay.exercises.length === 0) {
            setErrorMessage("Agregá al menos un ejercicio");
            return;
        }

        setIsSaving(true);
        setErrorMessage(null);

        try {
            const result = await saveRoutine(
                currentDay.dayId,
                currentDay.exercises.map((e) => ({
                    name: e.name,
                    prescribedSeries: e.prescribedSeries,
                }))
            );

            if (!result.ok) {
                throw new Error(result.error || "Error al guardar");
            }

            // Move to next day or weeks step
            if (currentDayIndex < totalDays - 1) {
                setCurrentDayIndex((prev) => prev + 1);
                setStep("muscles");
            } else {
                setStep("weeks");
            }
        } catch (error: any) {
            setErrorMessage(error.message || "Error al guardar la rutina");
        } finally {
            setIsSaving(false);
        }
    };

    // Create mesociclo and complete onboarding
    const handleCreateMesociclo = async () => {
        if (totalWeeks < 1 || totalWeeks > 15) {
            setErrorMessage("Ingresá un número entre 1 y 15");
            return;
        }

        setIsSaving(true);
        setErrorMessage(null);

        try {
            const result = await createMesociclo(totalWeeks);

            if (!result.ok) {
                throw new Error(result.error || "Error al crear mesociclo");
            }

            setStep("complete");
            
            // Wait a moment then close
            setTimeout(() => {
                onComplete();
            }, 1500);
        } catch (error: any) {
            setErrorMessage(error.message || "Error al crear el mesociclo");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    // Loading state
    if (isLoadingData) {
        return (
            <div className="fixed inset-0 z-[200] bg-[#F2F2F7] flex flex-col items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-ios-blue" />
                <p className="mt-4 text-gray-500 font-medium">Preparando tu entrenamiento...</p>
            </div>
        );
    }

    const handleSkip = () => {
        if (onSkip) {
            onSkip();
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-[#F2F2F7] flex flex-col overflow-hidden">
            {/* Skip button - visible on all steps except complete */}
            {step !== "complete" && (
                <div className="absolute top-[env(safe-area-inset-top)] right-0 p-6 z-10">
                    <button
                        onClick={handleSkip}
                        className="text-gray-500 font-bold text-sm hover:text-gray-700 active:opacity-60 transition-all"
                    >
                        Omitir por ahora
                    </button>
                </div>
            )}

            <AnimatePresence mode="wait">
                {/* Step 1: Number of Days */}
                {step === "days" && (
                    <motion.div
                        key="days"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        className="flex-1 flex flex-col items-center justify-center px-8"
                    >
                        <h1 className="text-4xl font-black text-black text-center mb-4">
                            ¿Cuántos días querés entrenar?
                        </h1>
                        <p className="text-gray-500 text-center mb-12 max-w-xs">
                            Elegí la cantidad de días por semana que vas a dedicar al gym
                        </p>

                        {/* Number counter */}
                        <div className="flex items-center gap-6 mb-12">
                            <button
                                onClick={() => setTotalDays(Math.max(1, totalDays - 1))}
                                disabled={totalDays <= 1}
                                className="w-14 h-14 rounded-2xl bg-white text-black font-black text-2xl shadow-md border-2 border-gray-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                            >
                                −
                            </button>
                            <div className="w-24 h-24 rounded-3xl bg-white shadow-lg border-2 border-gray-200 flex items-center justify-center">
                                <span className="text-5xl font-black tabular-nums text-black">
                                    {totalDays || 0}
                                </span>
                            </div>
                            <button
                                onClick={() => setTotalDays(Math.min(5, totalDays + 1))}
                                disabled={totalDays >= 5}
                                className="w-14 h-14 rounded-2xl bg-white text-black font-black text-2xl shadow-md border-2 border-gray-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                            >
                                +
                            </button>
                        </div>

                        <button
                            onClick={() => {
                                if (totalDays > 0) {
                                    setStep("muscles");
                                }
                            }}
                            disabled={totalDays === 0}
                            className="flex items-center gap-2 px-8 py-4 bg-black text-white rounded-2xl font-bold text-lg disabled:opacity-30"
                        >
                            Continuar
                            <ChevronRight size={20} />
                        </button>
                    </motion.div>
                )}

                {/* Step 2: Muscle Selection */}
                {step === "muscles" && currentDay && (
                    <motion.div
                        key={`muscles-${currentDay.dayId}`}
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        className="flex-1 flex flex-col min-h-0 pt-[calc(env(safe-area-inset-top)+1.5rem)]"
                    >
                        {/* Scrollable content (iOS-safe) */}
                        <div
                            className="flex-1 min-h-0 h-0 overflow-y-auto pb-4"
                            style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}
                        >
                            {/* Header */}
                            <div className="px-6 mb-4">
                                <p className="text-ios-blue font-bold text-sm mb-1">
                                    Día {currentDay.dayId} de {totalDays}
                                </p>
                                <h1 className="text-3xl font-black text-black">
                                    ¿Qué vas a entrenar?
                                </h1>
                                <p className="text-gray-500 mt-1">
                                    Tocá el gráfico o las tarjetas para seleccionar
                                </p>
                            </div>

                            {/* Body Map Section */}
                            <div className="px-6 mb-4">
                                <div className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm">
                                    <div className="flex gap-4 w-full h-[280px]">
                                        <div className="flex-1 flex flex-col items-center justify-center relative">
                                            <BodyMapInteractive
                                                view="front"
                                                intensityByGroupId={intensityByGroupId}
                                                onMuscleClick={handleBodyMapMuscleClick}
                                                highlightGroupIds={currentDayHighlightedIds}
                                                activeGroupIds={selectedBodyMapGroupId ? [selectedBodyMapGroupId] : []}
                                                className="h-full w-full"
                                            />
                                            <span className="absolute bottom-0 text-[10px] font-black text-gray-300 uppercase tracking-widest pointer-events-none">
                                                Frente
                                            </span>
                                        </div>
                                        <div className="flex-1 flex flex-col items-center justify-center relative">
                                            <BodyMapInteractive
                                                view="back"
                                                intensityByGroupId={intensityByGroupId}
                                                onMuscleClick={handleBodyMapMuscleClick}
                                                highlightGroupIds={currentDayHighlightedIds}
                                                activeGroupIds={selectedBodyMapGroupId ? [selectedBodyMapGroupId] : []}
                                                className="h-full w-full"
                                            />
                                            <span className="absolute bottom-0 text-[10px] font-black text-gray-300 uppercase tracking-widest pointer-events-none">
                                                Espalda
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        {/* BodyMap Popover */}
                        <AnimatePresence>
                            {isBodyMapPopoverOpen && selectedBodyMapMuscle && popoverPosition && (
                                <>
                                    {/* Backdrop */}
                                    <div
                                        className="fixed inset-0 z-40 bg-transparent"
                                        onClick={() => {
                                            setIsBodyMapPopoverOpen(false);
                                            setSelectedBodyMapMuscle(null);
                                            setSelectedBodyMapGroupId(null);
                                            setPopoverPosition(null);
                                        }}
                                    />
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.8, y: 10 }}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                            position: "fixed",
                                            left: popoverPosition.x,
                                            top: popoverPosition.y - 10,
                                            transform: "translate(-50%, -100%)",
                                        }}
                                        className="z-50 w-56"
                                    >
                                        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-black/5 p-4">
                                            <div className="text-center mb-3">
                                                <h3 className="text-sm font-black uppercase tracking-tight mb-0.5 capitalize">
                                                    {selectedBodyMapMuscle}
                                                </h3>
                                                <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">
                                                    {getSeriesForCategory(selectedBodyMapMuscle)} series semanales
                                                </p>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    // Find the matching muscle name from availableMuscles
                                                    const matchingMuscle = availableMuscles.find(
                                                        (m) => m.toLowerCase().trim() === selectedBodyMapMuscle.toLowerCase().trim()
                                                    );
                                                    if (matchingMuscle) {
                                                        toggleMuscle(matchingMuscle);
                                                    }
                                                    setIsBodyMapPopoverOpen(false);
                                                    setSelectedBodyMapMuscle(null);
                                                    setSelectedBodyMapGroupId(null);
                                                    setPopoverPosition(null);
                                                }}
                                                className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                                                    isCategorySelectedForCurrentDay(selectedBodyMapMuscle)
                                                        ? "bg-red-50 text-red-600 border border-red-200"
                                                        : "bg-ios-blue text-white"
                                                }`}
                                            >
                                                {isCategorySelectedForCurrentDay(selectedBodyMapMuscle)
                                                    ? `Quitar del Día ${currentDay.dayId}`
                                                    : `Agregar al Día ${currentDay.dayId}`}
                                            </button>

                                            {/* Arrow pointing down */}
                                            <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-full">
                                                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white/95 drop-shadow-sm"></div>
                                            </div>
                                        </div>
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>

                        {/* Muscle Grid */}
                        <div className="px-6 pb-4">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                                O seleccioná por tarjetas
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                {availableMuscles.map((muscle) => {
                                    const isSelected = currentDay.muscles.includes(muscle);
                                    const seriesCount = getSeriesForCategory(muscle);
                                    return (
                                        <button
                                            key={muscle}
                                            onClick={() => toggleMuscle(muscle)}
                                            // ayuda a que el gesto vertical se trate como scroll en mobile
                                            style={{ touchAction: "pan-y" }}
                                            className={`p-4 rounded-2xl text-left font-bold transition-all ${
                                                isSelected
                                                    ? "bg-ios-blue text-white shadow-lg"
                                                    : "bg-white text-gray-700 border border-gray-200"
                                            }`}
                                        >
                                            <span className="text-lg">{muscle}</span>
                                            {seriesCount > 0 && (
                                                <span className={`ml-2 text-xs ${isSelected ? "text-white/70" : "text-gray-400"}`}>
                                                    ({seriesCount}s)
                                                </span>
                                            )}
                                            {isSelected && (
                                                <Check size={18} className="inline ml-2" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        </div>

                        {/* Continue Button */}
                        <div className="px-6 py-4 bg-white border-t border-gray-200">
                            <button
                                onClick={() => {
                                    if (currentDay.muscles.length > 0) {
                                        setStep("exercises");
                                    }
                                }}
                                disabled={currentDay.muscles.length === 0}
                                className="w-full flex items-center justify-center gap-2 py-4 bg-black text-white rounded-2xl font-bold text-lg disabled:opacity-30"
                            >
                                Elegir ejercicios
                                <ChevronRight size={20} />
                            </button>
                            <div className="h-[env(safe-area-inset-bottom)]" />
                        </div>
                    </motion.div>
                )}

                {/* Step 3: Exercise Selection */}
                {step === "exercises" && currentDay && (
                    <motion.div
                        key={`exercises-${currentDay.dayId}`}
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        className="flex-1 flex flex-col min-h-0 pt-[calc(env(safe-area-inset-top)+1.5rem)]"
                    >
                        {/* Scrollable content (iOS-safe) */}
                        <div
                            className="flex-1 min-h-0 h-0 overflow-y-auto pb-4"
                            style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}
                        >
                            {/* Header */}
                            <div className="px-6 mb-4">
                                <p className="text-ios-blue font-bold text-sm mb-1">
                                    Día {currentDay.dayId} de {totalDays}
                                </p>
                                <h1 className="text-3xl font-black text-black">
                                    Elegí tus ejercicios
                                </h1>
                                <p className="text-gray-500 mt-1">
                                    {currentDay.muscles.join(", ")}
                                </p>
                            </div>

                            {/* Error Message */}
                            {errorMessage && (
                                <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl">
                                    <p className="text-sm text-red-700 font-medium">{errorMessage}</p>
                                </div>
                            )}

                            {/* Exercise List */}
                            <div className="px-6 pb-4">
                                {currentDay.exercises.length === 0 ? (
                                    <div className="text-center py-12">
                                        <p className="text-gray-400 font-medium mb-4">
                                            Aún no agregaste ejercicios
                                        </p>
                                        <button
                                            onClick={() => setIsSearchModalOpen(true)}
                                            className="inline-flex items-center gap-2 px-6 py-3 bg-ios-blue text-white rounded-2xl font-bold"
                                        >
                                            <Plus size={20} />
                                            Agregar Ejercicio
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {currentDay.exercises.map((exercise, idx) => (
                                            <div
                                                key={`${exercise.name}-${idx}`}
                                                className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-black/5"
                                            >
                                                <div className="w-12 h-12 rounded-xl bg-gray-50 border border-black/5 overflow-hidden flex-shrink-0">
                                                    {exercise.image ? (
                                                        <Image
                                                            src={`/images/exercises/${exercise.image}`}
                                                            alt={exercise.name}
                                                            width={48}
                                                            height={48}
                                                            className="w-full h-full object-contain"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px] font-bold">
                                                            IMG
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-black text-sm truncate">
                                                        {exercise.name}
                                                    </div>
                                                    <div className="text-xs text-gray-400 font-medium">
                                                        {exercise.prescribedSeries}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveExercise(idx)}
                                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        ))}

                                        {currentDay.exercises.length < 7 && (
                                            <button
                                                onClick={() => setIsSearchModalOpen(true)}
                                                className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-bold hover:border-ios-blue hover:text-ios-blue transition-colors"
                                            >
                                                <Plus size={20} />
                                                Agregar Ejercicio ({currentDay.exercises.length}/7)
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Save & Continue Button */}
                        <div className="px-6 py-4 bg-white border-t border-gray-200">
                            <button
                                onClick={saveCurrentDayAndContinue}
                                disabled={currentDay.exercises.length === 0 || isSaving}
                                className="w-full flex items-center justify-center gap-2 py-4 bg-black text-white rounded-2xl font-bold text-lg disabled:opacity-30"
                            >
                                {isSaving ? (
                                    <Loader2 size={20} className="animate-spin" />
                                ) : (
                                    <>
                                        {currentDayIndex < totalDays - 1
                                            ? `Guardar y continuar al Día ${currentDay.dayId + 1}`
                                            : "Guardar y finalizar"}
                                        <ChevronRight size={20} />
                                    </>
                                )}
                            </button>
                            <div className="h-[env(safe-area-inset-bottom)]" />
                        </div>

                        {/* Exercise Search Modal */}
                        <ExerciseSearchModal
                            isOpen={isSearchModalOpen}
                            onClose={() => setIsSearchModalOpen(false)}
                            exercises={availableExercises}
                            seriesOptions={seriesOptions}
                            onAddExercise={handleAddExercise}
                            existingExerciseNames={currentDay.exercises.map((e) => e.name)}
                            defaultSelectedMuscles={currentDay.muscles}
                            multiMuscleMode={true}
                        />
                    </motion.div>
                )}

                {/* Step 4: Weeks Selection */}
                {step === "weeks" && (
                    <motion.div
                        key="weeks"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        className="flex-1 flex flex-col items-center justify-center px-8"
                    >
                        <h1 className="text-4xl font-black text-black text-center mb-4">
                            ¿Cuántas semanas?
                        </h1>
                        <p className="text-gray-500 text-center mb-8 max-w-xs">
                            Elegí la duración de tu mesociclo (bloque de entrenamiento)
                        </p>

                        {/* Number input */}
                        <div className="flex items-center gap-4 mb-8">
                            <input
                                type="number"
                                min="1"
                                max="15"
                                value={totalWeeks || ""}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (val >= 1 && val <= 15) {
                                        setTotalWeeks(val);
                                    } else if (e.target.value === "") {
                                        setTotalWeeks(0);
                                    }
                                }}
                                placeholder="1-15"
                                className="w-32 h-20 text-center text-4xl font-black bg-white border-2 border-gray-200 rounded-2xl focus:border-ios-blue focus:outline-none"
                            />
                            <span className="text-2xl font-bold text-gray-400">semanas</span>
                        </div>

                        {/* Quick select */}
                        <div className="flex gap-2 mb-12">
                            {[4, 6, 8, 12].map((num) => (
                                <button
                                    key={num}
                                    onClick={() => setTotalWeeks(num)}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                        totalWeeks === num
                                            ? "bg-ios-blue text-white"
                                            : "bg-gray-100 text-gray-600"
                                    }`}
                                >
                                    {num} sem
                                </button>
                            ))}
                        </div>

                        {/* Error Message */}
                        {errorMessage && (
                            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl">
                                <p className="text-sm text-red-700 font-medium">{errorMessage}</p>
                            </div>
                        )}

                        <button
                            onClick={handleCreateMesociclo}
                            disabled={totalWeeks < 1 || totalWeeks > 15 || isSaving}
                            className="flex items-center gap-2 px-8 py-4 bg-black text-white rounded-2xl font-bold text-lg disabled:opacity-30"
                        >
                            {isSaving ? (
                                <Loader2 size={20} className="animate-spin" />
                            ) : (
                                <>
                                    Crear Mesociclo
                                    <ChevronRight size={20} />
                                </>
                            )}
                        </button>
                    </motion.div>
                )}

                {/* Complete State */}
                {step === "complete" && (
                    <motion.div
                        key="complete"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex-1 flex flex-col items-center justify-center px-8"
                    >
                        <div className="w-24 h-24 bg-ios-green rounded-full flex items-center justify-center mb-6">
                            <Check size={48} className="text-white" />
                        </div>
                        <h1 className="text-3xl font-black text-black text-center mb-2">
                            ¡Listo!
                        </h1>
                        <p className="text-gray-500 text-center">
                            Tu rutina de {totalDays} días por {totalWeeks} semanas está lista
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
