"use client";

import { Exercise, PersonalRecord } from "@/types";
import { Trophy } from "lucide-react";

interface ExerciseCardProps {
    exercise: Exercise;
    pr?: PersonalRecord;
    isStacked?: boolean;
}

export function ExerciseCard({ exercise, pr, isStacked = false }: ExerciseCardProps) {
    return (
        <div className={`
            bg-white rounded-[32px] p-6 h-full flex flex-col 
            ${isStacked ? "shadow-2xl border border-black/5" : "ios-card"}
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
                <div className="absolute inset-0">
                    <img
                        src={exercise.image ? `/images/exercises/${exercise.image}` : `https://api.placeholder.com/400/400?text=${exercise.name}`}
                        alt={exercise.name}
                        className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                    />
                </div>

                {/* Detail Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />
            </div>
        </div>
    );
}
