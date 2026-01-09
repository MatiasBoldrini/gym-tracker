"use client";

import { useState, useRef } from "react";
import { GripVertical, Trash2, Plus } from "lucide-react";
import Image from "next/image";
import { RoutineExercise } from "@/lib/sheets-client";

interface DayRoutineEditorProps {
    exercises: (RoutineExercise & { image?: string })[];
    onExercisesChange: (exercises: (RoutineExercise & { image?: string })[]) => void;
    onAddExercise: () => void;
    maxExercises?: number;
}

export function DayRoutineEditor({
    exercises,
    onExercisesChange,
    onAddExercise,
    maxExercises = 7,
}: DayRoutineEditorProps) {
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const dragRef = useRef<{ startY: number; currentIndex: number } | null>(null);

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOverIndex(index);
    };

    const handleDragEnd = () => {
        if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
            const newExercises = [...exercises];
            const [removed] = newExercises.splice(draggedIndex, 1);
            newExercises.splice(dragOverIndex, 0, removed);
            onExercisesChange(newExercises);
        }
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const handleRemoveExercise = (index: number) => {
        const newExercises = exercises.filter((_, i) => i !== index);
        onExercisesChange(newExercises);
    };

    // Touch-based drag for mobile
    const handleTouchStart = (e: React.TouchEvent, index: number) => {
        const touch = e.touches[0];
        dragRef.current = { startY: touch.clientY, currentIndex: index };
        setDraggedIndex(index);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!dragRef.current || draggedIndex === null) return;

        const touch = e.touches[0];
        const elements = document.querySelectorAll("[data-exercise-index]");
        
        for (const el of elements) {
            const rect = el.getBoundingClientRect();
            if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                const index = parseInt(el.getAttribute("data-exercise-index") || "-1");
                if (index !== -1 && index !== dragOverIndex) {
                    setDragOverIndex(index);
                }
                break;
            }
        }
    };

    const handleTouchEnd = () => {
        handleDragEnd();
        dragRef.current = null;
    };

    return (
        <div className="space-y-2">
            {exercises.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-gray-400 font-medium mb-4">
                        No hay ejercicios en este día
                    </div>
                    <button
                        onClick={onAddExercise}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-ios-blue text-white rounded-2xl font-bold"
                    >
                        <Plus size={20} />
                        Agregar Ejercicio
                    </button>
                </div>
            ) : (
                <>
                    {exercises.map((exercise, index) => (
                        <div
                            key={`${exercise.name}-${index}`}
                            data-exercise-index={index}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            onTouchStart={(e) => handleTouchStart(e, index)}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            className={`
                                flex items-center gap-3 p-3 bg-white rounded-2xl border transition-all
                                ${draggedIndex === index ? "opacity-50 scale-95" : ""}
                                ${dragOverIndex === index && draggedIndex !== index
                                    ? "border-ios-blue border-2 bg-ios-blue/5"
                                    : "border-black/5"
                                }
                            `}
                        >
                            {/* Drag Handle */}
                            <div
                                className="touch-none cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-500"
                            >
                                <GripVertical size={20} />
                            </div>

                            {/* Exercise Image */}
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

                            {/* Exercise Info */}
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-black text-sm truncate">
                                    {exercise.name}
                                </div>
                                <div className="text-xs text-gray-400 font-medium">
                                    {exercise.prescribedSeries}
                                </div>
                            </div>

                            {/* Delete Button */}
                            <button
                                onClick={() => handleRemoveExercise(index)}
                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}

                    {/* Add More Button */}
                    {exercises.length < maxExercises && (
                        <button
                            onClick={onAddExercise}
                            className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-bold hover:border-ios-blue hover:text-ios-blue transition-colors"
                        >
                            <Plus size={20} />
                            Agregar Ejercicio ({exercises.length}/{maxExercises})
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
