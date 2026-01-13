"use client";

import { useEffect, useState } from "react";
import { GripVertical, Trash2, Plus } from "lucide-react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
    DragCancelEvent,
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
import { nanoid } from "@/lib/nanoid";

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
            {/* Drag Handle - solo este elemento tiene los listeners de DnD */}
            <div
                {...dragHandleProps}
                className={`p-1.5 -m-1 transition-colors select-none touch-manipulation ${
                    isOverlay 
                        ? "text-gray-500" 
                        : "cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
                }`}
                style={{ touchAction: "none" }}
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
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
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
        transition: isDragging
            ? undefined
            : (transition ?? "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)"),
        opacity: isDragging ? 0.4 : 1,
    };

    // Pasamos los listeners solo al drag handle para evitar conflictos con otros elementos de la UI
    const dragHandleProps = {
        ...attributes,
        ...listeners,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`
                flex items-center gap-3 p-3 bg-white rounded-2xl border border-black/5
                ${isDragging ? "z-10 shadow-lg" : ""}
                select-none
            `}
        >
            <ExerciseItemContent
                exercise={exercise}
                onRemove={onRemove}
                dragHandleProps={dragHandleProps}
            />
        </div>
    );
}

export function DayRoutineEditor({
    exercises,
    onExercisesChange,
    onAddExercise,
    maxExercises = 7,
}: DayRoutineEditorProps) {
    const [activeId, setActiveId] = useState<string | null>(null);

    // IDs estables por item (crítico para animaciones "en vivo" al reordenar)
    const [exerciseIds, setExerciseIds] = useState<string[]>(() =>
        exercises.map(() => `ex-${nanoid(10)}`)
    );

    // Reconciliar IDs si cambia la cantidad desde afuera (agregar/quitar)
    useEffect(() => {
        setExerciseIds((prev) => {
            if (prev.length === exercises.length) return prev;
            if (prev.length < exercises.length) {
                const missing = exercises.length - prev.length;
                return [...prev, ...Array.from({ length: missing }, () => `ex-${nanoid(10)}`)];
            }
            return prev.slice(0, exercises.length);
        });
    }, [exercises.length]);

    // Sensores:
    // - Pointer: unificado para mouse y touch, más confiable con Next.js
    // - Touch: long-press para activar reordenamiento (iOS-like) y dejar scroll libre si el gesto es scroll.
    // - Mouse: drag normal en desktop.
    // IMPORTANTE: Usamos activationConstraint más estrictos para evitar conflictos con Next.js Link
    const sensors = useSensors(
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 300, // Increased delay to avoid conflicts
                tolerance: 5,
            },
        }),
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 10, // Increased distance to avoid accidental activation
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragCancel = (_event: DragCancelEvent) => {
        setActiveId(null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (over && active.id !== over.id) {
            const oldIndex = exerciseIds.indexOf(active.id as string);
            const newIndex = exerciseIds.indexOf(over.id as string);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newExercises = arrayMove(exercises, oldIndex, newIndex);
                setExerciseIds((prev) => arrayMove(prev, oldIndex, newIndex));
                onExercisesChange(newExercises);
            }
        }
    };

    const handleRemoveExercise = (index: number) => {
        const newExercises = exercises.filter((_, i) => i !== index);
        setExerciseIds((prev) => prev.filter((_, i) => i !== index));
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
                        onDragCancel={handleDragCancel}
                    >
                        <SortableContext
                            items={exerciseIds}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                                {exercises.map((exercise, index) => (
                                    <SortableExerciseItem
                                        key={exerciseIds[index]}
                                        exerciseId={exerciseIds[index]}
                                        exercise={exercise}
                                        onRemove={() => handleRemoveExercise(index)}
                                    />
                                ))}
                            </div>
                        </SortableContext>

                        <DragOverlay
                            adjustScale={false}
                            // Seguridad: el overlay no debe bloquear clicks (especialmente sobre la BottomNav)
                            // y lo mantenemos por debajo del nav (nav z=1000).
                            zIndex={200}
                            dropAnimation={{
                                duration: 180,
                                easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                            }}
                        >
                            {activeExercise ? (
                                <div className="pointer-events-none flex items-center gap-3 p-3 bg-white rounded-2xl border border-black/5 shadow-2xl scale-105">
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
