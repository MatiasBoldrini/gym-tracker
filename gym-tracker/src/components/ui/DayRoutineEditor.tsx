"use client";

import { useState } from "react";
import { GripVertical, Trash2, Plus } from "lucide-react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RoutineExercise } from "@/lib/sheets-client";

interface DayRoutineEditorProps {
    exercises: (RoutineExercise & { image?: string })[];
    onExercisesChange: (exercises: (RoutineExercise & { image?: string })[]) => void;
    onAddExercise: () => void;
    maxExercises?: number;
}

type ExerciseWithImage = RoutineExercise & { image?: string };

// Contenido visual del ejercicio (reutilizable)
function ExerciseItemContent({
    exercise,
    onRemove,
    dragHandleProps,
    isOverlay = false,
}: {
    exercise: ExerciseWithImage;
    onRemove?: () => void;
    dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
    isOverlay?: boolean;
}) {
    return (
        <>
            {/* Drag Handle */}
            <div
                {...dragHandleProps}
                className={`p-1.5 -m-1 transition-colors select-none ${
                    isOverlay 
                        ? "text-gray-500" 
                        : "touch-none cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
                }`}
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
            {onRemove ? (
                <motion.button
                    onClick={onRemove}
                    whileTap={{ scale: 0.9 }}
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                >
                    <Trash2 size={18} />
                </motion.button>
            ) : (
                <div className="p-2 text-gray-300">
                    <Trash2 size={18} />
                </div>
            )}
        </>
    );
}

// Componente para el item arrastrable
function SortableExerciseItem({
    exercise,
    exerciseId,
    onRemove,
}: {
    exercise: ExerciseWithImage;
    exerciseId: string;
    onRemove: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: exerciseId });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        touchAction: "none" as const,
    };

    return (
        <motion.div
            ref={setNodeRef}
            style={style}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
            className={`
                flex items-center gap-3 p-3 bg-white rounded-2xl border border-black/5
                ${isDragging ? "z-10 shadow-lg" : ""}
            `}
        >
            <ExerciseItemContent
                exercise={exercise}
                onRemove={onRemove}
                dragHandleProps={{ ...attributes, ...listeners }}
            />
        </motion.div>
    );
}

export function DayRoutineEditor({
    exercises,
    onExercisesChange,
    onAddExercise,
    maxExercises = 7,
}: DayRoutineEditorProps) {
    const [activeId, setActiveId] = useState<string | null>(null);

    // Crear IDs estables para cada ejercicio
    const exerciseIds = exercises.map((e, i) => `${e.name}-${i}`);

    // Configurar sensores con distancia de activación
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (over && active.id !== over.id) {
            const oldIndex = exerciseIds.indexOf(active.id as string);
            const newIndex = exerciseIds.indexOf(over.id as string);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newExercises = arrayMove(exercises, oldIndex, newIndex);
                onExercisesChange(newExercises);
            }
        }
    };

    const handleRemoveExercise = (index: number) => {
        const newExercises = exercises.filter((_, i) => i !== index);
        onExercisesChange(newExercises);
    };

    const activeExercise = activeId
        ? exercises[exerciseIds.indexOf(activeId)]
        : null;

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
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={exerciseIds}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                                <AnimatePresence mode="popLayout">
                                    {exercises.map((exercise, index) => (
                                        <SortableExerciseItem
                                            key={exerciseIds[index]}
                                            exerciseId={exerciseIds[index]}
                                            exercise={exercise}
                                            onRemove={() => handleRemoveExercise(index)}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        </SortableContext>

                        <DragOverlay dropAnimation={null}>
                            {activeExercise ? (
                                <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-black/5 shadow-2xl scale-105">
                                    <ExerciseItemContent
                                        exercise={activeExercise}
                                        isOverlay
                                    />
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>

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
