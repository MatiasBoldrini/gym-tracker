"use client";

import React, { useState } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { X, Check } from "lucide-react";
import type { Exercise, PersonalRecord, Set } from "@/types";
import { IOSPicker } from "./IOSPicker";

interface ExerciseModalProps {
    exercise: Exercise;
    pr?: PersonalRecord;
    isOpen: boolean;
    onClose: () => void;
    onSave: (sets: Set[]) => void;
}

export const ExerciseModal = ({
    exercise,
    pr,
    isOpen,
    onClose,
    onSave,
}: ExerciseModalProps) => {
    const dragControls = useDragControls();
    // Parse target sets from prescribed series string (e.g. "3 x 10")
    // Default to 3 if parsing fails or returns 0
    const targetSetCount = Math.max(1, parseInt(exercise.prescribedSeries?.toString().split(/[\sxX]+/)[0]) || 3);

    const buildInitialSets = React.useCallback((): Set[] => {
        const defaults: Set[] = Array.from({ length: targetSetCount }, () => ({ weight: null, reps: null }));
        const fromExercise = exercise.sets || [];
        return defaults.map((fallback, index) => {
            const s = fromExercise[index];
            if (!s) return fallback;
            return {
                weight: s.weight ?? null,
                reps: s.reps ?? null,
            };
        });
    }, [exercise.sets, targetSetCount]);

    const [sets, setSets] = useState<Set[]>(buildInitialSets);
    // Valores "visuales" del picker. Puede arrancar desde PR aunque el set aún no esté guardado.
    const [draft, setDraft] = useState<Array<{ weight: number; reps: number }>>([]);

    const [activeSetIndex, setActiveSetIndex] = useState(0);
    const [completedSets, setCompletedSets] = useState<boolean[]>(new Array(targetSetCount).fill(false));
    const [isEditing, setIsEditing] = useState(false);

    // Bloquear navegación “adelantada”: solo se puede ir hasta la primera serie incompleta.
    // Ej: si la serie 2 no está completada, no se puede cargar la 3.
    const firstIncompleteIdx = React.useMemo(() => {
        const idx = completedSets.findIndex((c) => !c);
        return idx < 0 ? null : idx;
    }, [completedSets]);

    // Generate options for the picker
    const weights = Array.from({ length: 301 }, (_, i) => i); // 0 a 300 kg en enteros
    // Permitir rangos altos (p.ej. zancadas 20-25 y a veces más); además soporta valores ya cargados desde Sheets.
    const reps = Array.from({ length: 201 }, (_, i) => i); // 0..200 reps

    React.useEffect(() => {
        if (!isOpen) return;
        const initialSets = buildInitialSets();
        setSets(initialSets);
        const nextDraft = Array.from({ length: targetSetCount }, (_, idx) => {
            const s = initialSets[idx];
            // Considerar guardado si tiene al menos reps > 0 o weight > 0
            const hasSaved = s && (
                (s.weight !== null && s.weight > 0) ||
                (s.reps !== null && s.reps > 0)
            );
            if (hasSaved) return { weight: s.weight ?? 0, reps: s.reps ?? 0 };
            // TODAS las series vacías arrancan con el PR si existe (no solo la primera)
            if (pr) return { weight: pr.weight ?? 0, reps: pr.reps ?? 0 };
            // Sin PR, arranca en 0
            return { weight: 0, reps: 0 };
        });
        setDraft(nextDraft);
        // Marcar como "cargados" los sets que ya existen (p.ej. si se cargaron desde Sheets).
        setCompletedSets(
            initialSets.map((s) => {
                const w = s.weight;
                const r = s.reps;
                // Consideramos cargado si hay reps > 0 y peso definido (incluye 0 para peso corporal)
                return r !== null && r !== undefined && r > 0 && w !== null && w !== undefined && w >= 0;
            })
        );
        // Abrir en la última serie no vacía; si no hay ninguna, abrir en la última.
        const lastFilledIdx = (() => {
            for (let i = Math.min(targetSetCount, initialSets.length) - 1; i >= 0; i--) {
                const s = initialSets[i];
                const w = s?.weight;
                const r = s?.reps;
                if (r !== null && r !== undefined && r > 0 && w !== null && w !== undefined && w >= 0) {
                    return i;
                }
            }
            return -1;
        })();
        // Abrir en la primera serie VACÍA (la próxima a cargar). Si están todas cargadas, abrir en la última cargada.
        const firstEmptyIdx = (() => {
            for (let i = 0; i < Math.min(targetSetCount, initialSets.length); i++) {
                const s = initialSets[i];
                const w = s?.weight;
                const r = s?.reps;
                const filled = r !== null && r !== undefined && r > 0 && w !== null && w !== undefined && w >= 0;
                if (!filled) return i;
            }
            return -1;
        })();
        setActiveSetIndex(
            firstEmptyIdx >= 0
                ? firstEmptyIdx
                : (lastFilledIdx >= 0 ? lastFilledIdx : 0)
        );
        setIsEditing(false);
    }, [isOpen, buildInitialSets, targetSetCount, pr]);


    const handleRegistration = () => {
        const currentDraft = draft[activeSetIndex] || { weight: 0, reps: 0 };
        const nextWeight = Number(currentDraft.weight ?? 0);
        const nextReps = Number(currentDraft.reps ?? 0);

        const newSets = [...sets];
        newSets[activeSetIndex] = {
            // Interpretar "0x0" como vacío para no guardar sets no cargados.
            weight: (nextWeight === 0 && nextReps === 0) ? null : nextWeight,
            reps: (nextWeight === 0 && nextReps === 0) ? null : nextReps,
        };
        setSets(newSets);

        const newCompleted = [...completedSets];
        // Consideramos cargado si hay reps > 0 y peso definido (incluye 0 para peso corporal)
        const isFilled = nextReps > 0 && nextWeight >= 0 && !(nextWeight === 0 && nextReps === 0);
        newCompleted[activeSetIndex] = isFilled;
        setCompletedSets(newCompleted);

        // Always save to sync state
        onSave(newSets);

        // Cerrar automáticamente si todas las series quedaron completas.
        const allCompleted = newCompleted.every(Boolean);
        if (allCompleted) {
            // Pequeño delay para dejar que el estado suba y la animación de botón termine.
            setTimeout(() => {
                onClose();
            }, 150);
            return;
        }

        if (isEditing) {
            setIsEditing(false);
        } else if (newCompleted[activeSetIndex] && activeSetIndex < sets.length - 1) {
            // Auto-advance
            const nextIdx = activeSetIndex + 1;
            setTimeout(() => {
                // Si la próxima serie está vacía y aún no se tocó, hereda el draft actual.
                setDraft((prev) => {
                    const next = [...prev];
                    const nextSet = newSets[nextIdx];
                    const isNextEmpty =
                        !nextSet ||
                        nextSet.weight === null ||
                        nextSet.reps === null ||
                        (nextSet.weight === 0 && nextSet.reps === 0);
                    const isNextDraftUntouched = (prev[nextIdx]?.weight ?? 0) === 0 && (prev[nextIdx]?.reps ?? 0) === 0;
                    if (isNextEmpty && isNextDraftUntouched) {
                        next[nextIdx] = { weight: nextWeight, reps: nextReps };
                    }
                    return next;
                });
                setActiveSetIndex(nextIdx);
            }, 300);
        }
    };

    const updateCurrentSet = (val: { [key: string]: string | number }) => {
        const nextWeight = Number(val.weight ?? 0);
        const nextReps = Number(val.reps ?? 0);
        const newDraft = [...draft];
        newDraft[activeSetIndex] = { weight: nextWeight, reps: nextReps };
        setDraft(newDraft);
    };

    const handleTabClick = (idx: number) => {
        // No permitir seleccionar una serie más allá de la primera incompleta.
        // Permite volver a series anteriores para editar, y permite cargar solo la “próxima” pendiente.
        if (firstIncompleteIdx !== null && idx > firstIncompleteIdx) return;
        // Si la serie destino está vacía y aún no se tocó, arrancar con los valores de la serie actual.
        // (Local/instantáneo: copia solo el draft, no guarda nada.)
        setDraft((prev) => {
            const next = [...prev];
            const destSet = sets[idx];
            const isDestEmpty =
                !destSet ||
                destSet.weight === null ||
                destSet.reps === null ||
                (destSet.weight === 0 && destSet.reps === 0);
            const isDestDraftUntouched = (prev[idx]?.weight ?? 0) === 0 && (prev[idx]?.reps ?? 0) === 0;
            if (isDestEmpty && isDestDraftUntouched) {
                const src = prev[activeSetIndex] || { weight: 0, reps: 0 };
                next[idx] = { weight: Number(src.weight ?? 0), reps: Number(src.reps ?? 0) };
            }
            return next;
        });
        setActiveSetIndex(idx);
        setIsEditing(false);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop - Click to close and save */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => {
                            onSave(sets);
                            onClose();
                        }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300, mass: 0.8 }}
                        drag="y"
                        dragControls={dragControls}
                        dragListener={false}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={0.7}
                        dragMomentum={false}
                        onPointerDown={(e) => {
                            const target = e.target as HTMLElement;
                            // Only start drag if we are NOT clicking inside the ios picker
                            if (!target.closest('.ios-picker-container')) {
                                // Evita que el gesto “contamine” scroll/pinch; mejora la sensación de drag y deja scroll libre en el picker.
                                e.preventDefault();
                                dragControls.start(e);
                            }
                        }}
                        onDragEnd={(_, { offset, velocity }) => {
                            const swipeThreshold = typeof window !== 'undefined' ? window.innerHeight * 0.3 : 100;
                            if (offset.y > swipeThreshold || velocity.y > 500) {
                                onSave(sets);
                                onClose();
                            }
                        }}
                        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-50 px-6 pt-6 pb-32 shadow-2xl"
                        // Permite scroll nativo con inercia dentro del picker.
                        style={{ touchAction: "pan-y", overscrollBehavior: "contain" }}
                    >
                        {/* Handle */}
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-gray-200 rounded-full" />

                        <div className="flex justify-between items-start mb-6">
                            <div className="flex gap-4 items-center">
                                {exercise.image && (
                                    <div className="w-16 h-16 bg-white rounded-2xl overflow-hidden border border-black/5 shadow-sm shrink-0 p-1">
                                        <img
                                            src={`/images/exercises/${exercise.image}`}
                                            alt={exercise.name}
                                            className="w-full h-full object-contain mix-blend-multiply"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-xl font-black tracking-tight text-black uppercase leading-tight mb-1">{exercise.name}</h2>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 font-bold text-[10px] uppercase tracking-wide border border-black/5">
                                            {exercise.prescribedSeries}
                                        </span>
                                        {pr && (
                                            <span className="px-2 py-0.5 rounded-md bg-ios-blue/10 text-ios-blue font-bold text-[10px] uppercase tracking-wide whitespace-nowrap">
                                                PR: {pr.weight}kg x {pr.reps} reps
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    onSave(sets);
                                    onClose();
                                }}
                                className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 active:scale-90 transition-transform shrink-0"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Set Selector Tabs */}
                        <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar p-4 touch-pan-x">
                            {sets.map((_, idx) => (
                                (() => {
                                    const isTabDisabled = firstIncompleteIdx !== null && idx > firstIncompleteIdx;
                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => handleTabClick(idx)}
                                            disabled={isTabDisabled}
                                            className={`
                                        flex-none min-w-[60px] h-12 rounded-2xl font-black text-xs transition-all relative flex items-center justify-center gap-1.5 px-4
                                        ${activeSetIndex === idx
                                                    ? "bg-black text-white shadow-lg shadow-black/20 scale-105 z-10"
                                                    : completedSets[idx]
                                                        ? "bg-ios-green text-white shadow-md shadow-ios-green/20"
                                                        : "bg-[#F2F2F7] text-gray-400"}
                                        ${isTabDisabled ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}
                                    `}
                                        >
                                            {completedSets[idx] && activeSetIndex !== idx && <Check size={12} strokeWidth={4} />}
                                            {completedSets[idx] ? (
                                                <span className="whitespace-nowrap">{sets[idx].weight}kg x {sets[idx].reps}</span>
                                            ) : (
                                                idx + 1
                                            )}
                                        </button>
                                    );
                                })()
                            ))}
                        </div>

                        <div className="mb-6">
                            {completedSets[activeSetIndex] && !isEditing ? (
                                /* Serie completada - mostrar mensaje en lugar de pickers */
                                <div className="relative h-[180px] bg-gradient-to-b from-ios-green/5 to-ios-green/10 rounded-[24px] overflow-hidden border border-ios-green/20 flex flex-col items-center justify-center gap-3">
                                    <div className="w-16 h-16 bg-ios-green/20 rounded-full flex items-center justify-center">
                                        <Check size={32} strokeWidth={3} className="text-ios-green" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-lg font-black text-ios-green uppercase tracking-wide">
                                            Serie completada
                                        </p>
                                        <p className="text-sm text-gray-500 mt-1">
                                            {sets[activeSetIndex]?.weight}kg × {sets[activeSetIndex]?.reps} reps
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                /* Pickers normales para registrar/editar */
                                <>
                                    <div className="flex justify-around mb-1 px-4">
                                        <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em]">Peso (kg)</span>
                                        <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em]">Reps</span>
                                    </div>
                                    <div className="relative h-[180px] bg-gray-50 rounded-[24px] overflow-hidden border border-black/5">
                                        <IOSPicker
                                            value={{
                                                weight: draft[activeSetIndex]?.weight ?? 0,
                                                reps: draft[activeSetIndex]?.reps ?? 0
                                            }}
                                            onChange={(val) => {
                                                if ('weight' in val && 'reps' in val) {
                                                    updateCurrentSet(val);
                                                }
                                            }}
                                            selections={{
                                                weight: weights,
                                                reps: reps,
                                            }}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex flex-col gap-2">
                            {completedSets[activeSetIndex] && !isEditing ? (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="w-full py-4 rounded-[20px] font-black text-xs uppercase tracking-[0.15em] bg-gray-100 text-black active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-black/5"
                                >
                                    Editar Serie {activeSetIndex + 1}
                                </button>
                            ) : (
                                <button
                                    onClick={handleRegistration}
                                    className={`w-full py-5 rounded-[20px] font-black text-xs uppercase tracking-[0.15em] shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2
                                        ${isEditing ? "bg-black text-white shadow-black/20" : "bg-ios-blue text-white shadow-ios-blue/20"}
                                    `}
                                >
                                    {isEditing ? (
                                        <>
                                            <Check size={16} strokeWidth={3} />
                                            Guardar Cambios
                                        </>
                                    ) : (
                                        <>Registrar Serie {activeSetIndex + 1}</>
                                    )}
                                </button>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
