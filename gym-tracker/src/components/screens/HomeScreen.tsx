"use client";

import { useEffect, useState } from "react";
import { fetchSheetCSV, parseWeekData, parsePRData, parseExerciseMapping, SHEET_GIDS, saveExerciseSets } from "@/lib/sheets";
import { Week, PersonalRecord, Exercise, Set } from "@/types";
import { ExerciseCard } from "@/components/ui/ExerciseCard";
import Stack from "@/components/ui/Stack";
import { ExerciseModal } from "@/components/ui/ExerciseModal";
import { Calendar } from "lucide-react";

export function HomeScreen() {
    const [week, setWeek] = useState<Week | null>(null);
    const [prs, setPrs] = useState<PersonalRecord[]>([]);
    const [currentDayIndex, setCurrentDayIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        async function init() {
            try {
                const weekDataRaw = await fetchSheetCSV(SHEET_GIDS.SEMANA_1);
                const prDataRaw = await fetchSheetCSV(SHEET_GIDS.RM);
                const exerciseMappingRaw = await fetchSheetCSV(SHEET_GIDS.EJERCICIOS);

                const exerciseMapping = parseExerciseMapping(exerciseMappingRaw);
                setWeek(parseWeekData(weekDataRaw, 1, exerciseMapping));
                setPrs(parsePRData(prDataRaw));
            } catch (error) {
                console.error("Failed to fetch data", error);
            } finally {
                setLoading(false);
            }
        }
        init();
    }, []);

    const [showWeekPicker, setShowWeekPicker] = useState(false);
    const weeks = ["Semana 1", "Semana 2", "Semana 3", "Semana 4"]; // Placeholder weeks

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[100dvh] w-full p-8 text-ios-gray">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-blue mb-4"></div>
                <p className="font-medium">Cargando rutina...</p>
            </div>
        );
    }

    const currentDay = week?.days[currentDayIndex];

    const exerciseCards = currentDay?.exercises.map((exercise, idx) => {
        const pr = prs.find(p => p.exercise.toLowerCase() === exercise.name.toLowerCase());
        return (
            <div
                key={idx}
                className="w-full h-full"
                onClick={() => {
                    setSelectedExercise(exercise);
                    setIsModalOpen(true);
                }}
            >
                <ExerciseCard exercise={exercise} pr={pr} isStacked />
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
        <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-[#F2F2F7]">
            {/* Header with Week Picker */}
            <header className="flex justify-between items-center px-6 pt-12 pb-2 shrink-0 z-10 relative">
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
            <div className="flex flex-col gap-2 px-6 pb-4 shrink-0">
                <span className="text-[10px] font-black text-ios-gray uppercase tracking-[0.2em] ml-1">
                    Día
                </span>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                    {week?.days.map((day, idx) => (
                        <button
                            key={day.id}
                            onClick={() => setCurrentDayIndex(idx)}
                            className={`flex flex-col items-center justify-center transition-all duration-300 relative group
                                ${idx === currentDayIndex ? "scale-100" : "scale-95 opacity-60 hover:opacity-100"}
                            `}
                        >
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black transition-all duration-300
                                ${idx === currentDayIndex
                                    ? "bg-ios-blue text-white shadow-lg shadow-ios-blue/30 scale-110"
                                    : "bg-white text-gray-400 border border-black/5"}
                            `}>
                                {day.id}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Active Day Content - fills remaining space */}
            <div className="flex-1 flex flex-col items-center justify-center relative min-h-0 -mt-4">
                {currentDay ? (
                    <div className="w-full max-w-sm h-full flex flex-col pt-4">
                        <div className="flex justify-center items-center mb-6 shrink-0">
                            <h2 className="text-xl font-black uppercase tracking-tight text-center px-4 py-1 bg-white/50 backdrop-blur-md rounded-full border border-black/5">
                                {currentDay.name}
                            </h2>
                        </div>

                        {/* Card Stack Container */}
                        <div className="flex-1 w-full relative flex items-center justify-center max-h-[500px]">
                            <Stack
                                cards={exerciseCards}
                                sensitivity={150}
                                randomRotation={true}
                                animationConfig={{ stiffness: 300, damping: 25 }}
                            />
                        </div>

                        <div className="h-12 shrink-0 flex items-start justify-center">
                            <p className="text-center text-ios-gray text-[9px] font-black uppercase tracking-[0.2em] opacity-30 mt-2">
                                Toca o desliza para navegar
                            </p>
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
                    pr={prs.find(p => p.exercise.toLowerCase() === selectedExercise?.name.toLowerCase())}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSaveSeries}
                />
            )}
        </div>
    );
}
