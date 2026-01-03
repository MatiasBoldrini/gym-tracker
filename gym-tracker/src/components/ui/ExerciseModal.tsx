"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Plus } from "lucide-react";
import { Exercise, PersonalRecord, Set } from "@/types";
import { IOSPicker } from "./IOSPicker";
import Image from "next/image";

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
    // Parse target sets from prescribed series string (e.g. "3 x 10")
    // Default to 3 if parsing fails or returns 0
    const targetSetCount = Math.max(1, parseInt(exercise.prescribedSeries?.toString().split(/[\sxX]+/)[0]) || 3);

    // Initialize exactly targetSetCount sets
    const [sets, setSets] = useState<Set[]>(() => {
        // Create initial array of correct size
        const initialSets = new Array(targetSetCount).fill({ weight: 60, reps: 10 });

        // Fill with existing data if available
        if (exercise.sets && exercise.sets.length > 0) {
            return initialSets.map((defaultSet, index) => {
                return exercise.sets[index] || defaultSet;
            });
        }

        return initialSets;
    });

    const [activeSetIndex, setActiveSetIndex] = useState(0);
    const [completedSets, setCompletedSets] = useState<boolean[]>(new Array(targetSetCount).fill(false));
    const [isEditing, setIsEditing] = useState(false);

    // Generate options for the picker
    const weights = Array.from({ length: 401 }, (_, i) => i * 0.5); // 0 to 200kg in 0.5 steps
    const reps = Array.from({ length: 31 }, (_, i) => i); // 0 to 30 reps

    // Sync completed sets state based on data
    React.useEffect(() => {
        const compl = new Array(targetSetCount).fill(false);
        sets.forEach((set, idx) => {
            // If set has real data (loaded from sheet/state), mark as complete?
            // Actually `exercise.sets` has the data. 
            // Logic: If we are initializing from existing data, we might want to mark them complete?
            // For now, let's leave as user interaction driven or simple check:
            // If we passed in data, it's "done" for the day?
            // The prompt didn't specify auto-complete, so leave false to let user confirm, 
            // OR check if weight/reps are non-zero/null. 
        });
        // Simplification: just reset to false on open, unless we want persistence of "checked" state.
        // Given current app state, persistence of "checked" isn't in data model explicitly (just existence of sets).
    }, []);


    const handleRegistration = () => {
        const newCompleted = [...completedSets];
        newCompleted[activeSetIndex] = true;
        setCompletedSets(newCompleted);

        // Always save to sync state
        onSave(sets);

        if (isEditing) {
            setIsEditing(false);
        } else if (activeSetIndex < sets.length - 1) {
            // Auto-advance
            setTimeout(() => setActiveSetIndex(activeSetIndex + 1), 300);
        }
    };

    const updateCurrentSet = (val: { [key: string]: string | number }) => {
        const newSets = [...sets];
        newSets[activeSetIndex] = {
            weight: Number(val.weight ?? 0),
            reps: Number(val.reps ?? 0)
        };
        setSets(newSets);
    };

    const handleTabClick = (idx: number) => {
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
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={0.7}
                        dragMomentum={false}
                        onDragEnd={(e, { offset, velocity }) => {
                            const swipeThreshold = typeof window !== 'undefined' ? window.innerHeight * 0.3 : 100;
                            if (offset.y > swipeThreshold || velocity.y > 500) {
                                onSave(sets);
                                onClose();
                            }
                        }}
                        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-50 px-6 pt-6 pb-32 shadow-2xl"
                    >
                        {/* Handle */}
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-gray-200 rounded-full" />

                        <div className="flex justify-between items-start mb-6">
                            <div className="flex gap-4 items-center">
                                {exercise.image && (
                                    <div className="w-16 h-16 bg-white rounded-2xl overflow-hidden border border-black/5 shadow-sm shrink-0 p-1">
                                        <Image
                                            src={`/images/exercises/${exercise.image}`}
                                            alt={exercise.name}
                                            width={64}
                                            height={64}
                                            sizes="64px"
                                            className="w-full h-full object-contain mix-blend-multiply"
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
                                                PR: {pr.weight}kg
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
                                <button
                                    key={idx}
                                    onClick={() => handleTabClick(idx)}
                                    className={`
                                        flex-none min-w-[60px] h-12 rounded-2xl font-black text-xs transition-all relative flex items-center justify-center gap-1.5 px-4
                                        ${activeSetIndex === idx
                                            ? "bg-black text-white shadow-lg shadow-black/20 scale-105 z-10"
                                            : completedSets[idx]
                                                ? "bg-ios-green text-white shadow-md shadow-ios-green/20"
                                                : "bg-[#F2F2F7] text-gray-400"}
                                    `}
                                >
                                    {completedSets[idx] && activeSetIndex !== idx && <Check size={12} strokeWidth={4} />}
                                    {completedSets[idx] ? (
                                        <span className="whitespace-nowrap">{sets[idx].weight}kg x {sets[idx].reps}</span>
                                    ) : (
                                        idx + 1
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="mb-6">
                            <div className="flex justify-around mb-1 px-4">
                                <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em]">Peso (kg)</span>
                                <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em]">Reps</span>
                            </div>
                            <div className={`relative h-[180px] bg-gray-50 rounded-[24px] overflow-hidden border border-black/5 transition-all ${completedSets[activeSetIndex] && !isEditing ? "opacity-30 grayscale pointer-events-none scale-95" : "opacity-100 scale-100"}`}>
                                <IOSPicker
                                    // Removed key={activeSetIndex} to prevent remounting and lag

                                    value={{
                                        weight: sets[activeSetIndex]?.weight || 0,
                                        reps: sets[activeSetIndex]?.reps || 0
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
