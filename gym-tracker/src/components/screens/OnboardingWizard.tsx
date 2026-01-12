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

type Step = "days" | "muscles" | "exercises" | "weeks" | "complete";

interface OnboardingWizardProps {
    isOpen: boolean;
    onComplete: () => void;
}

interface DayConfig {
    dayId: number;
    muscles: string[];
    exercises: (RoutineExercise & { image?: string })[];
}

export function OnboardingWizard({ isOpen, onComplete }: OnboardingWizardProps) {
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

    // Add exercise to current day
    const handleAddExercise = useCallback((exercise: { name: string; prescribedSeries: string; image: string }) => {
        setDaysConfig((prev) => {
            const updated = [...prev];
            const day = updated[currentDayIndex];
            day.exercises = [
                ...day.exercises,
                {
                    name: exercise.name,
                    prescribedSeries: exercise.prescribedSeries,
                    image: exercise.image || undefined,
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

            // Mark onboarding as complete in localStorage
            localStorage.setItem("onboarding_completed_v1", "true");

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

    return (
        <div className="fixed inset-0 z-[200] bg-[#F2F2F7] flex flex-col overflow-hidden">
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

                        {/* Number selector */}
                        <div className="flex gap-3 mb-12">
                            {[1, 2, 3, 4, 5].map((num) => (
                                <button
                                    key={num}
                                    onClick={() => setTotalDays(num)}
                                    className={`w-16 h-16 rounded-2xl text-2xl font-black transition-all ${
                                        totalDays === num
                                            ? "bg-ios-blue text-white shadow-lg scale-110"
                                            : "bg-white text-gray-400 border-2 border-gray-200"
                                    }`}
                                >
                                    {num}
                                </button>
                            ))}
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
                        className="flex-1 flex flex-col pt-[calc(env(safe-area-inset-top)+1.5rem)]"
                    >
                        {/* Header */}
                        <div className="px-6 mb-6">
                            <p className="text-ios-blue font-bold text-sm mb-1">
                                Día {currentDay.dayId} de {totalDays}
                            </p>
                            <h1 className="text-3xl font-black text-black">
                                ¿Qué vas a entrenar?
                            </h1>
                            <p className="text-gray-500 mt-1">
                                Seleccioná los músculos para el Día {currentDay.dayId}
                            </p>
                        </div>

                        {/* Muscle Grid */}
                        <div className="flex-1 overflow-y-auto px-6 pb-4">
                            <div className="grid grid-cols-2 gap-3">
                                {availableMuscles.map((muscle) => {
                                    const isSelected = currentDay.muscles.includes(muscle);
                                    return (
                                        <button
                                            key={muscle}
                                            onClick={() => toggleMuscle(muscle)}
                                            className={`p-4 rounded-2xl text-left font-bold transition-all ${
                                                isSelected
                                                    ? "bg-ios-blue text-white shadow-lg"
                                                    : "bg-white text-gray-700 border border-gray-200"
                                            }`}
                                        >
                                            <span className="text-lg">{muscle}</span>
                                            {isSelected && (
                                                <Check size={18} className="inline ml-2" />
                                            )}
                                        </button>
                                    );
                                })}
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
                        className="flex-1 flex flex-col pt-[calc(env(safe-area-inset-top)+1.5rem)]"
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
                        <div className="flex-1 overflow-y-auto px-6 pb-4">
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
