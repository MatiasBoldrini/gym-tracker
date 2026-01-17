"use client";

import type { Exercise, PersonalRecord } from "@/types";
import { Check } from "lucide-react";

interface ExerciseCardProps {
    exercise: Exercise;
    pr?: PersonalRecord;
    isStacked?: boolean;
    priority?: boolean;
}

export function ExerciseCard({ exercise, pr, isStacked = false, priority = false }: ExerciseCardProps) {
    // Parse target sets from prescribed series string (e.g. "3 x 10")
    const targetSetCount = Math.max(1, parseInt(exercise.prescribedSeries?.toString().split(/[\sxX]+/)[0]) || 3);

    // Count completed sets (sets with valid weight AND reps)
    // We access the count from exercise.sets which should have the user data
    // SLICE to targetSetCount to ignore extra/garbage sets (e.g. 4 sets of data for a 3-set exercise)
    const completedSetsCount = exercise.sets?.slice(0, targetSetCount).filter(s =>
        s.weight !== null && s.weight !== undefined && s.weight >= 0 &&
        s.reps !== null && s.reps !== undefined && s.reps > 0
    ).length || 0;

    const isComplete = completedSetsCount >= targetSetCount;

    return (
        <div className={`
            bg-white rounded-[32px] p-6 h-full flex flex-col
            ${isStacked
                ? "border border-black/5 shadow-[0_10px_30px_-14px_rgba(0,0,0,0.28)]"
                : "ios-card"}
        `}>
            <div className="mb-6">
                <div className="flex justify-between items-start mb-1">
                    <h3 className="text-2xl font-black uppercase tracking-tight text-black leading-tight">
                        {exercise.name}
                    </h3>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-gray-400">
                        {exercise.prescribedSeries}
                    </span>
                    {pr && (
                        <div className="flex items-center gap-1.5 text-gray-400 font-bold">
                            <span className="text-lg">({pr.reps} x {pr.weight}kg)</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center bg-ios-blue/5 rounded-[24px] mb-6 overflow-hidden border border-ios-blue/10 relative group">
                {/* Exercise Illustration */}
                <div className="absolute inset-0 bg-white">
                    {exercise.image ? (
                        <img
                            src={`/images/exercises/${exercise.image}`}
                            alt={exercise.name}
                            className="absolute inset-0 w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                            loading={priority ? "eager" : "lazy"}
                            decoding="async"
                            fetchPriority={priority ? "high" : "auto"}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-ios-gray font-black text-sm px-6 text-center">
                            {exercise.name}
                        </div>
                    )}
                </div>

                {/* Detail Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />
            </div>

            {/* Progress Footer */}
            {(completedSetsCount > 0 || isComplete) && (
                <div className="flex items-center gap-3 pt-2">
                    {/* Progress Bar & Text */}
                    <div className="flex-1 flex flex-col gap-1.5">
                        <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] uppercase font-black tracking-wider text-gray-400">
                                Progreso
                            </span>
                            <span className={`text-xs font-black ${isComplete ? "text-ios-green" : "text-black"}`}>
                                {completedSetsCount}/{targetSetCount}
                            </span>
                        </div>

                        {/* Segmented Progress Bar */}
                        <div className="flex gap-1 h-1.5 w-full">
                            {Array.from({ length: targetSetCount }).map((_, idx) => (
                                <div
                                    key={idx}
                                    className={`
                                        h-full rounded-full flex-1 transition-all duration-500
                                        ${idx < completedSetsCount
                                            ? "bg-ios-green" // Completed
                                            : "bg-gray-100"} // Pending
                                    `}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Status Icon */}
                    <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors
                        ${isComplete ? "bg-ios-green text-white" : "bg-gray-100 text-gray-400"}
                    `}>
                        {isComplete ? (
                            <Check size={16} strokeWidth={3} />
                        ) : (
                            <span className="text-xs font-black">{completedSetsCount}</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
