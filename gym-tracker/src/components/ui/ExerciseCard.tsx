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

            <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-[24px] mb-6 overflow-hidden border border-black/5 relative group">
                {/* Exercise Illustration Placeholder */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-4/5 h-4/5 relative grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500">
                        {/* 
                           Note: In a real app, we'd use exercise.imageURL.
                           For now, we use a placeholder that resembles the image provided by the user.
                        */}
                        <img
                            src={`https://api.placeholder.com/400/400?text=${exercise.name}`}
                            alt={exercise.name}
                            className="w-full h-full object-contain"
                        />
                    </div>
                </div>

                {/* Detail Overlay */}
                <div className="absolute inset-0 border-[1.5px] border-black/5 rounded-[24px] pointer-events-none" />
            </div>

            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] text-gray-300">
                <span>Sesión de hoy</span>
                <span className="w-8 h-[1px] bg-gray-200" />
                <span>Gym Tracker v1</span>
            </div>
        </div>
    );
}
