"use client";

import { useState } from "react";
import { GripVertical, Trash2, Plus } from "lucide-react";
import Image from "next/image";
import { Reorder, useDragControls, motion } from "framer-motion";
import { RoutineExercise } from "@/lib/sheets-client";

interface DayRoutineEditorProps {
    exercises: (RoutineExercise & { image?: string })[];
    onExercisesChange: (exercises: (RoutineExercise & { image?: string })[]) => void;
    onAddExercise: () => void;
    maxExercises?: number;
}

// Componente individual para cada item con su propio dragControls
function ExerciseItem({
    exercise,
    onRemove,
}: {
    exercise: RoutineExercise & { image?: string };
    onRemove: () => void;
}) {
    const dragControls = useDragControls();
    const [isDragging, setIsDragging] = useState(false);

    return (
        <Reorder.Item
            value={exercise}
            dragListener={false}
            dragControls={dragControls}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setIsDragging(false)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ 
                opacity: 1, 
                y: 0,
                scale: isDragging ? 1.02 : 1,
                boxShadow: isDragging 
                    ? "0 10px 40px -10px rgba(0,0,0,0.15)" 
                    : "0 0px 0px 0px rgba(0,0,0,0)",
            }}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
            transition={{
                type: "spring",
                stiffness: 400,
                damping: 30,
            }}
            layout
            className={`
                flex items-center gap-3 p-3 bg-white rounded-2xl border border-black/5
                ${isDragging ? "z-50 relative" : ""}
            `}
            style={{ 
                touchAction: "pan-x",
            }}
        >
            {/* Drag Handle - Solo este elemento inicia el drag */}
            <motion.div
                onPointerDown={(e) => {
                    e.preventDefault();
                    dragControls.start(e);
                }}
                whileTap={{ scale: 0.95 }}
                className="touch-none cursor-grab active:cursor-grabbing p-1.5 -m-1 text-gray-300 hover:text-gray-500 transition-colors select-none"
            >
                <GripVertical size={20} />
            </motion.div>

            {/* Exercise Image */}
            <div className="w-12 h-12 rounded-xl bg-gray-50 border border-black/5 overflow-hidden flex-shrink-0">
                {exercise.image ? (
                    <Image
                        src={`/images/exercises/${exercise.image}`}
                        alt={exercise.name}
                        width={48}
                        height={48}
                        className="w-full h-full object-contain"
                        draggable={false}
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
            <motion.button
                onClick={onRemove}
                whileTap={{ scale: 0.9 }}
                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
            >
                <Trash2 size={18} />
            </motion.button>
        </Reorder.Item>
    );
}

export function DayRoutineEditor({
    exercises,
    onExercisesChange,
    onAddExercise,
    maxExercises = 7,
}: DayRoutineEditorProps) {
    const handleRemoveExercise = (index: number) => {
        const newExercises = exercises.filter((_, i) => i !== index);
        onExercisesChange(newExercises);
    };

    return (
        <div className="space-y-2">
            {exercises.length === 0 ? (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-12"
                >
                    <div className="text-gray-400 font-medium mb-4">
                        No hay ejercicios en este día
                    </div>
                    <motion.button
                        onClick={onAddExercise}
                        whileTap={{ scale: 0.95 }}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-ios-blue text-white rounded-2xl font-bold"
                    >
                        <Plus size={20} />
                        Agregar Ejercicio
                    </motion.button>
                </motion.div>
            ) : (
                <>
                    <Reorder.Group
                        axis="y"
                        values={exercises}
                        onReorder={onExercisesChange}
                        className="space-y-2"
                        layoutScroll
                    >
                        {exercises.map((exercise, index) => (
                            <ExerciseItem
                                key={`${exercise.name}-${index}`}
                                exercise={exercise}
                                onRemove={() => handleRemoveExercise(index)}
                            />
                        ))}
                    </Reorder.Group>

                    {/* Add More Button */}
                    {exercises.length < maxExercises && (
                        <motion.button
                            onClick={onAddExercise}
                            whileTap={{ scale: 0.98 }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-bold hover:border-ios-blue hover:text-ios-blue transition-colors"
                        >
                            <Plus size={20} />
                            Agregar Ejercicio ({exercises.length}/{maxExercises})
                        </motion.button>
                    )}
                </>
            )}
        </div>
    );
}
