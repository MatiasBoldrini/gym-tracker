"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Plus } from "lucide-react";
import { Exercise, PersonalRecord, Set } from "@/types";
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
    // Start with 1 set, but allow up to 4
    const [sets, setSets] = useState<Set[]>(exercise.sets.length > 0 ? exercise.sets : [{ weight: 60, reps: 10 }]);
    const [activeSetIndex, setActiveSetIndex] = useState(0);
    const [completedSets, setCompletedSets] = useState<boolean[]>(new Array(4).fill(false));
    const [isEditing, setIsEditing] = useState(false);

    // Generate options for the picker
    const weights = Array.from({ length: 401 }, (_, i) => i * 0.5); // 0 to 200kg in 0.5 steps
    const reps = Array.from({ length: 31 }, (_, i) => i); // 0 to 30 reps

    const addSet = () => {
        if (sets.length < 4) {
            const lastSet = sets[sets.length - 1];
            setSets([...sets, { ...lastSet }]);
            setActiveSetIndex(sets.length);
            setIsEditing(false);
        }
    };

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
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-50 px-6 pt-2 pb-20 shadow-2xl max-h-[90vh] overflow-y-auto"
                    >
                        {/* Handle */}
                        <div className="flex justify-center mb-6">
                            <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
                        </div>

                        <div className="flex justify-between items-start mb-6">
                            <div className="flex gap-4 items-center">
                                {exercise.image && (
                                    <div className="w-16 h-16 bg-gray-50 rounded-2xl overflow-hidden border border-black/5 shrink-0">
                                        <img
                                            src={`/images/exercises/${exercise.image}`}
                                            alt={exercise.name}
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                )}
                                <div>
                                    <h2 className="text-2xl font-black tracking-tight text-black leading-tight uppercase">{exercise.name}</h2>
                                    <p className="text-ios-gray font-bold text-sm uppercase tracking-wide">{exercise.prescribedSeries}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    onSave(sets);
                                    onClose();
                                }}
                                className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 active:scale-90 transition-transform"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {pr && (
                            <div className="bg-ios-blue/5 rounded-2xl p-4 mb-6 border border-ios-blue/10">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-ios-blue uppercase tracking-widest leading-none">Record Personal</span>
                                    <span className="text-xl font-black text-ios-blue leading-none">{pr.weight}kg x {pr.reps}</span>
                                </div>
                            </div>
                        )}

                        {/* Set Selector Tabs */}
                        <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar pb-2">
                            {sets.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleTabClick(idx)}
                                    className={`
                                        flex-1 min-w-[85px] py-3 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all relative flex items-center justify-center gap-1.5
                                        ${activeSetIndex === idx
                                            ? "bg-black text-white shadow-lg shadow-black/20"
                                            : completedSets[idx]
                                                ? "bg-ios-green/10 text-ios-green border border-ios-green/20"
                                                : "bg-gray-100 text-gray-400"}
                                    `}
                                >
                                    {completedSets[idx] && <Check size={12} strokeWidth={3} className={activeSetIndex === idx ? "text-white" : "text-ios-green"} />}
                                    Serie {idx + 1}
                                </button>
                            ))}
                            {sets.length < 4 && (
                                <button
                                    onClick={addSet}
                                    className="w-12 h-10 flex items-center justify-center bg-ios-blue/10 text-ios-blue rounded-2xl active:scale-95 transition-transform shrink-0"
                                >
                                    <Plus size={20} />
                                </button>
                            )}
                        </div>

                        <div className="mb-10">
                            <div className="flex justify-around mb-2 px-4">
                                <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">Peso (kg)</span>
                                <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">Reps</span>
                            </div>
                            <div className={`relative h-[200px] bg-gray-50 rounded-[24px] overflow-hidden border border-black/5 transition-all ${completedSets[activeSetIndex] && !isEditing ? "opacity-30 grayscale pointer-events-none scale-95" : "opacity-100 scale-100"}`}>
                                <IOSPicker
                                    key={activeSetIndex} // Reset picker on set change
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
                                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-12 border-y border-black/5 pointer-events-none" />
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            {completedSets[activeSetIndex] && !isEditing ? (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="w-full py-5 rounded-[24px] font-black text-sm uppercase tracking-[0.2em] bg-gray-100 text-black active:scale-[0.98] transition-all flex items-center justify-center gap-3 border border-black/5"
                                >
                                    Editar Serie {activeSetIndex + 1}
                                </button>
                            ) : (
                                <button
                                    onClick={handleRegistration}
                                    className={`w-full py-6 rounded-[24px] font-black text-sm uppercase tracking-[0.2em] shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3
                                        ${isEditing ? "bg-black text-white shadow-black/20" : "bg-ios-blue text-white shadow-ios-blue/20"}
                                    `}
                                >
                                    {isEditing ? (
                                        <>
                                            <Check size={18} strokeWidth={3} />
                                            Guardar Cambios
                                        </>
                                    ) : (
                                        <>Registrar Serie {activeSetIndex + 1}</>
                                    )}
                                </button>
                            )}
                        </div>

                        <p className="text-center text-ios-gray/40 text-[9px] font-black uppercase tracking-[0.2em] mt-8">
                            Desliza hacia abajo para cerrar y finalizar
                        </p>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
