"use client";

import { useEffect, useState } from "react";
import { Info, Activity, X } from "lucide-react";
import { BodyMapInteractive } from "../ui/BodyMapInteractive";
import { AnimatePresence, motion } from "framer-motion";
import { MUSCLE_MAPPING, MUSCLE_ALIASES, getFatigaBucket } from "@/lib/fatiga";

type FatigaScreenProps = {
    initialRows: any[][];
    intensityByGroupId: Record<string, number>;
};

export function FatigaScreen({ initialRows, intensityByGroupId }: FatigaScreenProps) {
    const [fatigaData] = useState<any[][]>(initialRows);
    const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);

    const handleMuscleClick = (muscleId: string, e: React.MouseEvent) => {
        setSelectedMuscle(muscleId);

        // Calculate position based on the clicked element
        const rect = e.currentTarget.getBoundingClientRect();
        // Center horizontally, position above visually
        const x = rect.left + rect.width / 2;
        const y = rect.top;

        setPopoverPosition({ x, y });
        setIsModalOpen(true);
    };

    const getMuscleData = (id: string) => {
        // Find the friendly canonical name for the muscle ID (e.g. "hombro")
        // MUSCLE_MAPPING is spanish -> [ids]
        const canonicalName = Object.keys(MUSCLE_MAPPING).find(key =>
            MUSCLE_MAPPING[key].includes(id)
        );

        if (!canonicalName) return { name: id, sets: 0 };

        // Aggregate sets from all rows that map to this canonical name
        // This handles cases where multiple sheet rows (aliases) map to one group (e.g. deltoids -> hombro)
        let totalSets = 0;
        fatigaData.forEach(row => {
            const rawName = row[0].toLowerCase().trim();
            const resolvedName = MUSCLE_ALIASES[rawName] || rawName;

            if (resolvedName === canonicalName) {
                totalSets += (parseInt(row[1]) || 0);
            }
        });

        // Capitalize for display if needed, but the current UI uses uppercase css classes anyway
        return { name: canonicalName, sets: totalSets };
    };

    const selectedData = selectedMuscle ? getMuscleData(selectedMuscle) : null;

    return (
        <div className="px-5 pt-8 pb-10 relative">
            <header className="mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight">Fatiga</h1>
                <p className="text-ios-gray mt-1 text-sm font-medium uppercase tracking-wider">Volumen Semanal</p>
            </header>

            {/* Body Map Section */}
            <div className="ios-card p-6 mb-8 flex flex-col items-center justify-center bg-white relative overflow-hidden">
                <div className="flex gap-4 w-full h-[400px]">
                    <div className="flex-1 flex flex-col items-center justify-center relative">
                        <BodyMapInteractive
                            view="front"
                            intensityByGroupId={intensityByGroupId}
                            onMuscleClick={handleMuscleClick}
                            className="h-full w-full"
                        />
                        <span className="absolute bottom-0 text-[10px] font-black text-gray-300 uppercase tracking-widest pointer-events-none">Frente</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center relative">
                        <BodyMapInteractive
                            view="back"
                            intensityByGroupId={intensityByGroupId}
                            onMuscleClick={handleMuscleClick}
                            className="h-full w-full"
                        />
                        <span className="absolute bottom-0 text-[10px] font-black text-gray-300 uppercase tracking-widest pointer-events-none">Espalda</span>
                    </div>
                </div>
            </div>

            {/* Muscle Contextual Popover */}
            <AnimatePresence>
                {isModalOpen && selectedData && popoverPosition && (
                    <>
                        {/* Transparent backdrop to close on click outside */}
                        <div
                            className="fixed inset-0 z-40 bg-transparent"
                            onClick={() => setIsModalOpen(false)}
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.8, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8, y: 10 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                position: 'fixed',
                                left: popoverPosition.x,
                                top: popoverPosition.y - 10, // Slight gap above
                                transform: 'translate(-50%, -100%)',
                                x: '-50%',
                                y: '-100%'
                            }}
                            className="z-50 w-48 pointer-events-none" // pointer-events-none wrapper? No, needs interaction? Actually just display.
                        >
                            <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-black/5 p-4 pointer-events-auto">
                                <div className="text-center mb-3">
                                    <h3 className="text-sm font-black uppercase tracking-tight mb-0.5">{selectedData.name}</h3>
                                    <p className="text-ios-gray text-[10px] font-bold uppercase tracking-wider">Estado actual</p>
                                </div>

                                <div className="flex flex-col items-center">
                                    <div className="text-3xl font-black text-black mb-0.5">{selectedData.sets}</div>
                                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-3">Series</div>

                                    <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${selectedData.sets <= 5 ? "bg-ios-green" :
                                                selectedData.sets <= 12 ? "bg-ios-yellow" :
                                                    selectedData.sets <= 18 ? "bg-ios-orange" : "bg-ios-red"
                                                }`}
                                            style={{ width: `${Math.min((selectedData.sets / 25) * 100, 100)}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Little arrow pointing down */}
                                <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-full">
                                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white/90 drop-shadow-sm"></div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Fatigue Table */}
            <div className="ios-card overflow-hidden">
                <div className="bg-black px-4 py-4 flex items-center justify-between">
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Carga Muscular</h2>
                    <Activity size={16} className="text-white/40" />
                </div>
                <div className="divide-y divide-black/5 bg-white">
                    {fatigaData.map((row, idx) => {
                        const muscle = row[0];
                        const series = parseInt(row[1]) || 0;
                        const maxSeries = 25;
                        const percentage = Math.min((series / maxSeries) * 100, 100);

                        const bucket = getFatigaBucket(series);
                        const barColor =
                            bucket === "low" ? "bg-ios-green" :
                                bucket === "medium" ? "bg-ios-yellow" :
                                    bucket === "high" ? "bg-ios-orange" :
                                        bucket === "extreme" ? "bg-ios-red" :
                                            "bg-gray-200";

                        return (
                            <div key={idx} className="p-4 flex items-center gap-4">
                                <div className="flex-1">
                                    <div className="flex justify-between items-baseline mb-2">
                                        <span className="font-black text-xs uppercase tracking-wider text-black">{muscle}</span>
                                        <span className="text-[10px] font-black text-ios-gray uppercase">{series} <span className="text-[8px] opacity-60">sets</span></span>
                                    </div>
                                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
