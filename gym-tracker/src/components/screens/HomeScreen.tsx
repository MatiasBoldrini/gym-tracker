"use client";

import { useMemo, useState } from "react";
import { saveExerciseSets } from "@/lib/sheets-client";
import { Week, PersonalRecord, Exercise, Set } from "@/types";
import { ExerciseCard } from "@/components/ui/ExerciseCard";
import Stack from "@/components/ui/Stack";
import { ExerciseModal } from "@/components/ui/ExerciseModal";
import { DaySelector } from "@/components/ui/DaySelector";

type HomeScreenProps = {
    initialWeek: Week;
    initialPrs: PersonalRecord[];
};

export function HomeScreen({ initialWeek, initialPrs }: HomeScreenProps) {
    const [week, setWeek] = useState<Week>(initialWeek);
    const [prs] = useState<PersonalRecord[]>(initialPrs);
    const [currentDayIndex, setCurrentDayIndex] = useState(0);
    const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [showWeekPicker, setShowWeekPicker] = useState(false);
    const weeks = ["Semana 1", "Semana 2", "Semana 3", "Semana 4"]; // Placeholder weeks

    const prByExercise = useMemo(() => {
        const map = new Map<string, PersonalRecord>();
        for (const pr of prs) map.set(pr.exercise.toLowerCase(), pr);
        return map;
    }, [prs]);

    const currentDay = week.days[currentDayIndex];

    const exerciseCards = currentDay?.exercises.map((exercise, idx) => {
        const pr = prByExercise.get(exercise.name.toLowerCase());
        return (
            <div
                key={idx}
                className="w-full h-full"
                onClick={() => {
                    setSelectedExercise(exercise);
                    setIsModalOpen(true);
                }}
            >
                <ExerciseCard
                    exercise={exercise}
                    pr={pr}
                    isStacked
                    priority={idx === (currentDay.exercises.length - 1)}
                />
            </div>
        );
    }) || [];

    const handleSaveSeries = async (sets: Set[]) => {
        if (!selectedExercise || !week || !currentDay) return;

        console.log("Saving series for", selectedExercise.name, sets);

        try {
            // Filter out sets with null values and convert to the format expected by saveExerciseSets
            const validSets = sets
                .filter(s => s.weight !== null && s.reps !== null)
                .map(s => ({ weight: s.weight!, reps: s.reps! }));

            if (validSets.length > 0) {
                await saveExerciseSets(week.id, currentDay.id, selectedExercise.name, validSets);
            }

            // Optionally update local state to show progress immediately
            const updatedWeek = { ...week };
            const dayIdx = updatedWeek.days.findIndex(d => d.id === currentDay.id);
            const exIdx = updatedWeek.days[dayIdx].exercises.findIndex(e => e.name === selectedExercise.name);

            if (dayIdx >= 0 && exIdx >= 0) {
                updatedWeek.days[dayIdx].exercises[exIdx].sets = sets;
                setWeek(updatedWeek);
            }
        } catch (error) {
            console.error("Failed to save series:", error);
        }
    };

    return (
        <div className="min-h-[calc(100dvh-(var(--bottom-nav-base)+env(safe-area-inset-bottom)))] w-full flex flex-col bg-[#F2F2F7] overflow-x-hidden">
            {/* Header with Week Picker */}
            <header className="flex justify-between items-center px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-2 shrink-0 z-10 relative">
                <div className="relative">
                    <button
                        onClick={() => setShowWeekPicker(!showWeekPicker)}
                        className="flex items-center gap-2 active:opacity-60 transition-opacity"
                    >
                        <h1 className="text-3xl font-black tracking-tight text-black">
                            {weeks[0]}
                        </h1>
                        <div className={`text-ios-blue transition-transform ${showWeekPicker ? "rotate-180" : ""}`}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                    </button>

                    {/* Week Picker Dropdown */}
                    {showWeekPicker && (
                        <div className="absolute top-full left-0 mt-2 w-48 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-black/5 overflow-hidden origin-top-left animate-in fade-in zoom-in-95 duration-200">
                            {weeks.map((w, idx) => (
                                <button
                                    key={idx}
                                    className="w-full text-left px-4 py-3 font-bold text-sm hover:bg-black/5 active:bg-black/10 transition-colors border-b border-black/5 last:border-0"
                                    onClick={() => {
                                        // TODO: Implement actual week switching
                                        setShowWeekPicker(false);
                                    }}
                                >
                                    {w}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-full p-1.5 shadow-sm border border-black/5">
                    <div className="w-8 h-8 rounded-full bg-ios-blue flex items-center justify-center text-white font-bold text-xs ring-2 ring-white">
                        MB
                    </div>
                </div>
            </header>

            {/* Day Selector */}
            <div className="px-6 pb-2 shrink-0 z-20">
                <DaySelector
                    days={week?.days || []}
                    selectedIndex={currentDayIndex}
                    onSelect={setCurrentDayIndex}
                />
            </div>

            {/* Active Day Content - fills remaining space */}
            <div className="flex-1 flex flex-col items-center justify-center relative min-h-0 -mt-4 overflow-hidden">
                {currentDay ? (
                    <div className="w-full max-w-sm h-full flex flex-col">
                        {/* Card Stack Container */}
                        <div className="w-full h-[420px] relative flex items-center justify-center px-4">
                            <Stack
                                cards={exerciseCards}
                                sensitivity={150}
                                randomRotation={true}
                                animationConfig={{ stiffness: 300, damping: 25 }}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="text-center p-8 text-ios-gray">
                        <p>No hay rutina programada para hoy.</p>
                    </div>
                )}
            </div>

            {/* Exercise Modal */}
            {selectedExercise && (
                <ExerciseModal
                    exercise={selectedExercise}
                    pr={prByExercise.get(selectedExercise.name.toLowerCase())}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSaveSeries}
                />
            )}
        </div>
    );
}
