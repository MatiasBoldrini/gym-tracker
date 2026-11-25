"use client";

import { useState, type ReactNode } from "react";
import { GripVertical, Trash2, Plus, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    useSensor,
    useSensors,
    DragOverlay,
    PointerSensor,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import "./exercise-list.css";
import type { RoutineExercise } from "@/lib/sheets-client";

interface DayRoutineEditorProps {
    exercises: ExerciseWithImage[];
    onExercisesChange: (exercises: ExerciseWithImage[]) => void;
    onAddExercise: () => void;
    maxExercises?: number;
    detail?: { activeId: string; toggle: (id: string) => void; fields: ReactNode; renderMedia?: (name: string) => ReactNode };
}

type ExerciseWithImage = RoutineExercise & { id?: string; image?: string; detailLabel?: string };

// Contenido visual del ejercicio (reutilizable)
function ExerciseItemContent({
    exercise,
    onRemove,
    dragHandleProps,
    isOverlay = false,
    onSelect, expanded, handleRef, media,
}: {
    exercise: ExerciseWithImage;
    onRemove?: () => void;
    dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
    handleRef?: (node: HTMLButtonElement | null) => void;
    isOverlay?: boolean;
    onSelect?: () => void;
    expanded?: boolean;
    media?: ReactNode;
}) {
    return (
        <>

            <button type="button" ref={handleRef} tabIndex={isOverlay ? -1 : undefined}
                {...dragHandleProps}
                aria-label={`Reordenar ${exercise.name}`}
                className={`p-1.5 -m-1 transition-colors select-none touch-manipulation ${isOverlay
                    ? "text-gray-500"
                    : "cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
                    }`}
                style={{ touchAction: "none" }}
            >
                <GripVertical size={20} />
            </button>

            {media ?? (exercise.image && <img src={`/images/exercises/${exercise.image}`} width={36} height={36}
                alt="" className="size-9 shrink-0 object-contain" draggable={false} loading="lazy" decoding="async" />)}
            <div className="min-w-0 flex-1">
                {onSelect ? <button type="button" className="plan-row-toggle" aria-expanded={expanded}
                    onClick={onSelect}><span>{exercise.name}<small>{exercise.detailLabel || exercise.prescribedSeries}</small></span>
                    <ChevronDown size={15} aria-hidden="true" /></button> : <>
                    <strong className="block text-sm">{exercise.name}</strong>
                    <small className="block text-gray-600">{exercise.prescribedSeries}</small>
                </>}
            </div>

            {/* Delete Button */}
            {onRemove ? (
                <motion.button
                    type="button" aria-label={`Quitar ${exercise.name}`}
                    onClick={onRemove}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    whileTap={{ scale: 0.9 }}
                    className="grid size-11 place-items-center text-gray-500 hover:text-red-600 transition-colors"
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
    onRemove, detail,
}: {
    exercise: ExerciseWithImage;
    exerciseId: string;
    onRemove: () => void;
    detail?: DayRoutineEditorProps["detail"];
}) {
    const {
        attributes,
        listeners,
        setNodeRef, setActivatorNodeRef,
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
        <li ref={setNodeRef} style={style} className="plan-sort-row">
            <div className="flex items-center gap-2 py-1.5">
                <ExerciseItemContent exercise={exercise} onRemove={onRemove} dragHandleProps={dragHandleProps} handleRef={setActivatorNodeRef}
                    media={detail?.renderMedia?.(exercise.name)}
                    expanded={detail?.activeId === exerciseId}
                    onSelect={detail ? () => detail.toggle(exerciseId) : undefined} />
            </div>
            {detail?.activeId === exerciseId && detail.fields}
        </li>
    );
}

export function DayRoutineEditor({
    exercises,
    onExercisesChange,
    onAddExercise,
    maxExercises = 7,
    detail,
}: DayRoutineEditorProps) {
    const [activeId, setActiveId] = useState<string | null>(null);

    const occurrences = new Map<string, number>();
    const exerciseIds = exercises.map(({ id, name, prescribedSeries, image }) => {
        if (id) return id;
        const key = JSON.stringify([name, prescribedSeries, image]);
        const occurrence = occurrences.get(key) ?? 0;
        occurrences.set(key, occurrence + 1);
        return `${key}:${occurrence}`;
    });

    // Sensores:
    // Usamos PointerSensor unificado que maneja mouse y touch de manera más limpia
    // y NO interfiere con otros eventos cuando no está en drag mode.
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                delay: 250,
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragCancel = () => {
        setActiveId(null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (over && active.id !== over.id) {
            const oldIndex = exerciseIds.indexOf(active.id as string);
            const newIndex = exerciseIds.indexOf(over.id as string);

            if (oldIndex !== -1 && newIndex !== -1) {
                onExercisesChange(arrayMove(exercises, oldIndex, newIndex));
            }
        }
    };

    const handleRemoveExercise = (index: number) => {
        onExercisesChange(exercises.filter((_, i) => i !== index));
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
                        autoScroll={false}
                    >
                        <SortableContext
                            items={exerciseIds}
                            strategy={verticalListSortingStrategy}
                        >
                            <ul className="plan-sort-list" role="list" aria-label="Ejercicios del día">
                                {exercises.map((exercise, index) => (
                                    <SortableExerciseItem
                                        key={exerciseIds[index]}
                                        exerciseId={exerciseIds[index]}
                                        exercise={exercise}
                                        detail={detail}
                                        onRemove={() => handleRemoveExercise(index)}
                                    />
                                ))}
                            </ul>
                        </SortableContext>

                        <DragOverlay
                            adjustScale={false}
                            // Seguridad: el overlay no debe bloquear clicks (especialmente sobre la BottomNav)
                            // y lo mantenemos por debajo del nav (nav z=9999).
                            zIndex={200}
                            style={{ pointerEvents: "none" }}
                            dropAnimation={{
                                duration: 180,
                                easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                            }}
                        >
                            {activeExercise ? (
                                <div aria-hidden="true" inert className="pointer-events-none flex items-center gap-2 px-2 py-1.5 bg-white border-y border-black/15 shadow-sm">
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
                            className="flex min-h-11 items-center gap-2 px-1 text-sm font-semibold text-[#005fbe]"
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
