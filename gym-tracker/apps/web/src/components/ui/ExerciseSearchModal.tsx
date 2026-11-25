"use client";

import { prescriptionInputState } from "@/lib/setInput";

import { useState, useMemo, useEffect, useRef } from "react";
import { X, Search, Plus, Check, ChevronDown, Filter } from "lucide-react";
import type { ExerciseItem } from "@/lib/sheets-client";
import { cacheUrls } from "@/lib/pwa";
import { normalizeMuscleKey } from "@/lib/normalize";
import { ModalFrame } from "./ModalFrame";
import "./exercise-list.css";

interface ExerciseSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    exercises: ExerciseItem[];
    seriesOptions: string[];
    onAddExercise: (exercise: { name: string; prescribedSeries: string; image: string; muscle?: string }) => void;
    existingExerciseNames: string[];
    /** Optional: pre-select multiple muscles for OR filtering (for onboarding) */
    defaultSelectedMuscles?: string[];
    /** If true, use multi-muscle OR mode with chips instead of single-select dropdown */
    multiMuscleMode?: boolean;
}

export function ExerciseSearchModal({ isOpen, ...props }: ExerciseSearchModalProps) {
    if (!isOpen) return null;

    const muscles = Array.from(new Set(
        props.defaultSelectedMuscles?.map(normalizeMuscleKey).filter(Boolean) ?? []
    ));
    return <ExerciseSearchContent key={JSON.stringify([...muscles].sort())} {...props} defaultSelectedMuscles={muscles} />;
}

function ExerciseSearchContent({
    onClose,
    exercises,
    seriesOptions,
    onAddExercise,
    existingExerciseNames,
    defaultSelectedMuscles: normalizedDefaultMuscles = [],
    multiMuscleMode = false,
}: Omit<ExerciseSearchModalProps, "isOpen">) {
    const [searchQuery, setSearchQuery] = useState("");
    // Single muscle mode (legacy)
    const [selectedMuscle, setSelectedMuscle] = useState<string>("");
    // Multi muscle mode (for onboarding)
    const [selectedMuscles, setSelectedMuscles] = useState(() => new Set(normalizedDefaultMuscles));
    // Focused muscle (when clicking on a selected muscle chip)
    const [focusedMuscle, setFocusedMuscle] = useState<string | null>(null);
    const [selectedExercise, setSelectedExercise] = useState<ExerciseItem | null>(null);
    const [selectedSeries, setSelectedSeries] = useState<string>("");
    const [customSeries, setCustomSeries] = useState("");
    const [showSeriesError, setShowSeriesError] = useState(false);
    const [showSeriesPicker, setShowSeriesPicker] = useState(false);
    const [showMusclePicker, setShowMusclePicker] = useState(false);
    const seriesPickerRef = useRef<HTMLDivElement>(null);
    const musclePickerRef = useRef<HTMLDivElement>(null);

    const muscleOptions = useMemo(() => {
        const map = new Map<string, { key: string; label: string }>();

        const capitalizeFirst = (input: string) => {
            const v = String(input ?? "").trim();
            if (!v) return "";
            return v.charAt(0).toUpperCase() + v.slice(1);
        };

        const addMuscle = (raw: string | undefined | null) => {
            if (!raw) return;
            const key = normalizeMuscleKey(raw);
            if (!key || map.has(key)) return;
            const labelSource = raw.trim() || key;
            map.set(key, { key, label: capitalizeFirst(labelSource) });
        };

        exercises.forEach((e) => addMuscle(e.muscle));
        normalizedDefaultMuscles.forEach(addMuscle);

        return Array.from(map.values()).sort((a, b) =>
            a.label.localeCompare(b.label, "es", { sensitivity: "base" })
        );
    }, [exercises, normalizedDefaultMuscles]);

    const getMuscleLabel = (key: string) => {
        const normalized = normalizeMuscleKey(key);
        return muscleOptions.find((m) => m.key === normalized)?.label || normalized || "";
    };

    // Toggle a muscle in multi-muscle mode (from picker)
    const toggleMuscle = (muscle: string) => {
        const key = normalizeMuscleKey(muscle);
        if (!key) return;

        setSelectedMuscles((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    // Handle clicking on a selected muscle chip (focus/unfocus)
    const handleMuscleChipClick = (muscle: string) => {
        const key = normalizeMuscleKey(muscle);
        if (focusedMuscle === key) {
            // Unfocus - show all selected muscles again
            setFocusedMuscle(null);
        } else {
            // Focus on this muscle
            setFocusedMuscle(key);
        }
    };

    // Filter exercises based on search and filters
    const filteredExercises = useMemo(() => {
        return exercises.filter((exercise) => {
            const exerciseKey = normalizeMuscleKey(exercise.muscle);

            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                if (!exercise.name.toLowerCase().includes(query)) {
                    return false;
                }
            }

            // Muscle filter (OR mode for multi, AND mode for single)
            if (multiMuscleMode) {
                // If a muscle is focused, only show exercises from that muscle
                if (focusedMuscle) {
                    if (exerciseKey !== focusedMuscle) {
                        return false;
                    }
                } else {
                    // OR filter: show if muscle is in selected set, or show all if none selected
                    if (selectedMuscles.size > 0 && !selectedMuscles.has(exerciseKey)) {
                        return false;
                    }
                }
            } else {
                // Single select mode (legacy)
                const selectedMuscleKey = normalizeMuscleKey(selectedMuscle);
                if (selectedMuscleKey && exerciseKey !== selectedMuscleKey) {
                    return false;
                }
            }

            return true;
        });
    }, [exercises, searchQuery, selectedMuscle, selectedMuscles, multiMuscleMode, focusedMuscle]);

    // Cache images when filtered exercises change
    useEffect(() => {
        const urls = filteredExercises
            .slice(0, 20) // Cache first 20 visible
            .map((e) => (e.image ? `/images/exercises/${e.image}` : null))
            .filter((u): u is string => !!u);

        if (urls.length > 0) {
            void cacheUrls(urls);
        }
    }, [filteredExercises]);

    // Close pickers when clicking outside
    useEffect(() => {
        if (!showSeriesPicker && !showMusclePicker) return;

        const handleClick = (e: MouseEvent) => {
            if (showSeriesPicker && seriesPickerRef.current && !seriesPickerRef.current.contains(e.target as Node)) {
                setShowSeriesPicker(false);
            }
            if (showMusclePicker && musclePickerRef.current && !musclePickerRef.current.contains(e.target as Node)) {
                setShowMusclePicker(false);
            }
        };

        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [showSeriesPicker, showMusclePicker]);

    const handleSelectExercise = (exercise: ExerciseItem) => {
        setSelectedExercise(exercise);
        setCustomSeries("");
        setShowSeriesError(false);
        setSelectedSeries(seriesOptions[0] || "3 x 10-12");
    };

    const handleAddExercise = () => {
        if (!selectedExercise) return;

        const series = customSeries || selectedSeries;
        if (!series) return;
        if (customSeries && prescriptionInputState(customSeries) !== "complete") {
            setShowSeriesPicker(true);
            setShowSeriesError(true);
            return;
        }

        onAddExercise({
            name: selectedExercise.name,
            prescribedSeries: series,
            image: selectedExercise.image,
            muscle: selectedExercise.muscle,
        });

        setSelectedExercise(null);
        setSelectedSeries("");
        setCustomSeries("");
    };

    const isExerciseAlreadyAdded = (name: string) => {
        return existingExerciseNames.some(
            (n) => n.toLowerCase() === name.toLowerCase()
        );
    };

    return (
        <ModalFrame label="Agregar ejercicio" onClose={onClose}><div className="relative flex h-full items-end justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="exercise-search-sheet relative w-full max-w-lg bg-white rounded-t-3xl flex flex-col pb-[env(safe-area-inset-bottom)]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
                    <h2 className="text-xl font-black text-black">Agregar Ejercicio</h2>
                    <button
                        onClick={onClose}
                        aria-label="Cerrar buscador" className="size-11 rounded-full flex items-center justify-center"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Search Input */}
                <div className="px-6 py-3 border-b border-black/5">
                    <div className="relative">
                        <Search
                            size={18}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                        <input
                            type="text"
                            placeholder="Buscar ejercicio..."
                            aria-label="Buscar ejercicio"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ios-blue/30"
                        />
                    </div>
                </div>

                {/* Filters */}
                <div className="px-6 py-3 border-b border-black/5">
                    {multiMuscleMode ? (
                        /* Multi-muscle mode: show picker button + selected chips */
                        <div className="space-y-2">
                            {/* Picker button */}
                            <div className="relative" ref={musclePickerRef}>
                                <button
                                    onClick={() => setShowMusclePicker(!showMusclePicker)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 rounded-xl text-sm font-bold border border-black/5"
                                >
                                    <span className="text-gray-700">
                                        {selectedMuscles.size > 0
                                            ? `${selectedMuscles.size} músculo${selectedMuscles.size > 1 ? 's' : ''} seleccionado${selectedMuscles.size > 1 ? 's' : ''}`
                                            : "Seleccionar músculos"}
                                    </span>
                                    <ChevronDown
                                        size={16}
                                        className={`text-gray-400 transition-transform ${showMusclePicker ? "rotate-180" : ""}`}
                                    />
                                </button>

                                {/* Muscle picker dropdown */}
                                {showMusclePicker && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-black/10 max-h-64 overflow-y-auto z-20">
                                        <div className="p-2 space-y-1">
                                            {muscleOptions.map((muscle) => {
                                                const isSelected = selectedMuscles.has(muscle.key);
                                                return (
                                                    <button
                                                        key={muscle.key}
                                                        onClick={() => toggleMuscle(muscle.key)}
                                                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-left text-sm font-bold transition-colors ${isSelected
                                                            ? "bg-ios-blue/10 text-ios-blue"
                                                            : "text-gray-700 hover:bg-gray-50"
                                                            }`}
                                                    >
                                                        <span>{muscle.label}</span>
                                                        {isSelected && <Check size={16} />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Selected muscle chips */}
                            {selectedMuscles.size > 0 && (
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {Array.from(selectedMuscles).map((muscle) => {
                                        const isFocused = focusedMuscle === muscle;
                                        return (
                                            <button
                                                key={muscle}
                                                onClick={() => handleMuscleChipClick(muscle)}
                                                className={`h-9 px-4 rounded-full text-sm font-bold whitespace-nowrap transition-all shrink-0 ${isFocused
                                                    ? "bg-ios-blue text-white shadow-lg ring-2 ring-ios-blue/30"
                                                    : "bg-ios-blue/10 text-ios-blue"
                                                    }`}
                                            >
                                                {getMuscleLabel(muscle)}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Single muscle mode: dropdown selector */
                        <div className="flex gap-2 overflow-x-auto">
                            <div className="relative shrink-0">
                                <Filter
                                    size={16}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                                />
                                <select
                                    value={selectedMuscle}
                                    onChange={(e) => setSelectedMuscle(e.target.value)}
                                    className="h-10 pl-9 pr-10 bg-gray-100 rounded-xl text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-ios-blue/30 appearance-none border border-black/5 shadow-[0_1px_0_rgba(0,0,0,0.03)]"
                                >
                                    <option value="">Músculo</option>
                                    {muscleOptions.map((muscle) => (
                                        <option key={muscle.key} value={muscle.key}>
                                            {muscle.label}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown
                                    size={16}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                                />
                            </div>

                            {/* Clear Filters */}
                            {selectedMuscle && (
                                <button
                                    onClick={() => {
                                        setSelectedMuscle("");
                                    }}
                                    className="h-10 px-3 bg-white border border-black/10 text-ios-blue rounded-xl text-sm font-bold whitespace-nowrap shadow-[0_1px_0_rgba(0,0,0,0.03)] transition-colors hover:bg-ios-blue/5 active:scale-[0.98]"
                                >
                                    Limpiar
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Exercise List */}
                <div className="flex-1 overflow-y-auto px-6 py-3">
                    {filteredExercises.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 font-medium">
                            No se encontraron ejercicios
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredExercises.map((exercise) => {
                                const isAdded = isExerciseAlreadyAdded(exercise.name);
                                const isSelected = selectedExercise?.name === exercise.name;

                                return (
                                    <button
                                        key={exercise.name}
                                        onClick={() => !isAdded && handleSelectExercise(exercise)}
                                        disabled={isAdded}
                                        className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${isAdded
                                            ? "bg-gray-50 opacity-50 cursor-not-allowed"
                                            : isSelected
                                                ? "bg-ios-blue/10 ring-2 ring-ios-blue"
                                                : "bg-gray-50 hover:bg-gray-100 active:scale-[0.98]"
                                            }`}
                                    >
                                        {/* Image */}
                                        <div className="w-14 h-14 overflow-hidden flex-shrink-0">
                                            {exercise.image ? (
                                                <img
                                                    src={`/images/exercises/${exercise.image}`}
                                                    alt={exercise.name}
                                                    className="w-full h-full object-contain"
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs font-bold">
                                                    Sin img
                                                </div>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 text-left">
                                            <div className="font-bold text-black text-sm leading-tight">
                                                {exercise.name}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-0.5">
                                                {exercise.muscle}
                                                {exercise.categories && ` · ${exercise.categories}`}
                                            </div>
                                        </div>

                                        {/* Status Icon */}
                                        {isAdded ? (
                                            <div className="w-8 h-8 rounded-full bg-ios-green/10 text-ios-green flex items-center justify-center">
                                                <Check size={16} />
                                            </div>
                                        ) : isSelected ? (
                                            <div className="w-8 h-8 rounded-full bg-ios-blue text-white flex items-center justify-center">
                                                <Check size={16} />
                                            </div>
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center">
                                                <Plus size={16} />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Series Selection (when exercise is selected) */}
                {selectedExercise && (
                    <div className="px-6 py-4 border-t border-black/5 bg-gray-50">
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <div className="text-xs font-bold text-gray-400 mb-1.5">
                                    Series para {selectedExercise.name}
                                </div>
                                <div className="relative" ref={seriesPickerRef}>
                                    <button
                                        aria-label="Series asignadas" aria-expanded={showSeriesPicker}
                                        onClick={() => setShowSeriesPicker(!showSeriesPicker)}
                                        className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-black/10 text-sm font-bold"
                                    >
                                        <span>{customSeries || selectedSeries || "Seleccionar series"}</span>
                                        <ChevronDown size={16} className={`text-gray-400 transition-transform ${showSeriesPicker ? "rotate-180" : ""}`} />
                                    </button>

                                    {showSeriesPicker && (
                                        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-lg border border-black/10 max-h-48 overflow-y-auto z-10">
                                            {seriesOptions.map((series) => (
                                                <button
                                                    key={series}
                                                    onClick={() => {
                                                        setSelectedSeries(series);
                                                        setShowSeriesError(false);
                                                        setCustomSeries("");
                                                        setShowSeriesPicker(false);
                                                    }}
                                                    className={`w-full px-4 py-2.5 text-left text-sm font-bold hover:bg-gray-50 ${selectedSeries === series && !customSeries
                                                        ? "text-ios-blue bg-ios-blue/5"
                                                        : "text-black"
                                                        }`}
                                                >
                                                    {series}
                                                </button>
                                            ))}
                                            <div className="border-t border-black/5 p-2">
                                                <input
                                                    type="text"
                                                    aria-label="Serie personalizada" aria-invalid={showSeriesError || undefined}
                                                    aria-describedby={showSeriesError ? "custom-series-error" : undefined}
                                                    autoComplete="off" autoCorrect="off" spellCheck={false}
                                                    placeholder="Serie personalizada (ej: 4 x 6-8)"
                                                    value={customSeries}
                                                    onPaste={e => {
                                                        if (/[\t\r\n]/.test(e.clipboardData.getData("text/plain"))) e.preventDefault();
                                                    }}
                                                    onChange={(e) => {
                                                        const next = e.target.value;
                                                        if (prescriptionInputState(next) !== "invalid") {
                                                            setCustomSeries(next);
                                                            setShowSeriesError(false);
                                                        }
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-full px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ios-blue/30"
                                                />
                                                {showSeriesError && <p id="custom-series-error" className="form-error">Completá la indicación, por ejemplo 4 x 6-8 o 20 min.</p>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={handleAddExercise}
                                disabled={!selectedSeries && !customSeries}
                                className="px-6 py-3 bg-ios-blue text-white rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Agregar
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div></ModalFrame>
    );
}
