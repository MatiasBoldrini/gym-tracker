"use client";

import { useEffect, useState } from "react";
import { fetchSheetCSV, parseWeekData, parsePRData, SHEET_GIDS, saveExerciseSets } from "@/lib/sheets";
import { Week, PersonalRecord, Exercise } from "@/types";
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

                setWeek(parseWeekData(weekDataRaw, 1));
                setPrs(parsePRData(prDataRaw));
            } catch (error) {
                console.error("Failed to fetch data", error);
            } finally {
                setLoading(false);
            }
        }
        init();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-8 text-ios-gray">
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

    const handleCardClick = (index: number) => {
        if (currentDay) {
            setSelectedExercise(currentDay.exercises[index]);
            setIsModalOpen(true);
        }
    };

    const handleSaveSeries = async (sets: { weight: number; reps: number }[]) => {
        if (!selectedExercise || !week || !currentDay) return;

        console.log("Saving series for", selectedExercise.name, sets);

        try {
            await saveExerciseSets(week.id, currentDay.id, selectedExercise.name, sets);

            // Optionally update local state to show progress immediately
            const updatedWeek = { ...week };
            const dayIdx = updatedWeek.days.findIndex(d => d.id === currentDay.id);
            const exIdx = updatedWeek.days[dayIdx].exercises.findIndex(e => e.name === selectedExercise.name);

            updatedWeek.days[dayIdx].exercises[exIdx].sets = sets.map(s => ({
                weight: s.weight,
                reps: s.reps
            }));

            setWeek(updatedWeek);
        } catch (error) {
            console.error("Failed to save series:", error);
        }
    };

    return (
        <div className="px-5 pt-8 min-h-screen flex flex-col">
            <header className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Mi Rutina</h1>
                    <div className="flex items-center gap-1.5 text-ios-gray mt-1">
                        <Calendar size={14} />
                        <span className="text-sm font-semibold uppercase tracking-wider">Semana 1</span>
                    </div>
                </div>
                <div className="bg-white rounded-full p-2 shadow-ios border border-black/5">
                    <div className="w-8 h-8 rounded-full bg-ios-blue flex items-center justify-center text-white font-bold text-xs">
                        MB
                    </div>
                </div>
            </header>

            {/* Day Selector Tabs */}
            <div className="flex gap-4 overflow-x-auto pb-6 no-scrollbar -mx-5 px-5">
                {week?.days.map((day, idx) => (
                    <button
                        key={day.id}
                        onClick={() => setCurrentDayIndex(idx)}
                        className={`flex flex-col items-center min-w-[70px] transition-all ${idx === currentDayIndex ? "scale-105" : "opacity-40"
                            }`}
                    >
                        <span className={`text-[10px] font-bold uppercase mb-1 ${idx === currentDayIndex ? "text-ios-blue" : "text-gray-500"}`}>
                            Día {day.id}
                        </span>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg ${idx === currentDayIndex ? "bg-ios-blue text-white shadow-lg shadow-ios-blue/30" : "bg-white text-gray-400"
                            }`}>
                            {day.id}
                        </div>
                    </button>
                ))}
            </div>

            {/* Active Day Content */}
            <div className="flex-1 flex flex-col items-center justify-center -mt-6">
                {currentDay ? (
                    <div className="w-full max-w-sm">
                        <div className="flex justify-between items-center mb-6 px-4">
                            <h2 className="text-xl font-bold">
                                {currentDay.name}
                            </h2>
                            <div className="text-[10px] bg-black text-white px-2 py-1 rounded-full font-bold uppercase tracking-wider">
                                {currentDay.exercises.length} Ejercicios
                            </div>
                        </div>

                        <div className="h-[420px] w-full">
                            <Stack
                                cards={exerciseCards}
                                sensitivity={150}
                                randomRotation={true}
                                animationConfig={{ stiffness: 300, damping: 25 }}
                            />
                        </div>

                        <p className="text-center text-ios-gray text-[10px] font-black mt-8 uppercase tracking-[0.2em] opacity-40">
                            Toca o desliza para navegar
                        </p>
                    </div>
                ) : (
                    <div className="text-center py-20 text-ios-gray">
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
