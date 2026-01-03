"use client";

import { useEffect, useState } from "react";
import { Info, Activity } from "lucide-react";

type FatigaScreenProps = {
    initialRows: any[][];
    intensityByGroupId: Record<string, number>;
};

export function FatigaScreen({ initialRows, intensityByGroupId }: FatigaScreenProps) {
    const [fatigaData] = useState<any[][]>(initialRows);
    const [loadingMaps, setLoadingMaps] = useState(true);
    const [bodyMapFront, setBodyMapFront] = useState<string | null>(null);
    const [bodyMapBack, setBodyMapBack] = useState<string | null>(null);

    useEffect(() => {
        async function init() {
            try {
                // Fetch Body Map images via local proxy to avoid CORS
                const fetchMap = async (view: "front" | "back") => {
                    const response = await fetch("/api/bodymap", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ view, intensityByGroupId })
                    });
                    const blob = await response.blob();
                    return URL.createObjectURL(blob);
                };

                const [frontUrl, backUrl] = await Promise.all([
                    fetchMap("front"),
                    fetchMap("back")
                ]);

                setBodyMapFront(frontUrl);
                setBodyMapBack(backUrl);

            } catch (error) {
                console.error("Failed to fetch fatiga data", error);
            } finally {
                setLoadingMaps(false);
            }
        }
        init();
    }, [intensityByGroupId]);

    if (loadingMaps) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-8 text-ios-gray">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-blue mb-4"></div>
                <p className="font-medium">Calculando fatiga...</p>
            </div>
        );
    }

    return (
        <div className="px-5 pt-8 pb-10">
            <header className="mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight">Fatiga</h1>
                <p className="text-ios-gray mt-1 text-sm font-medium uppercase tracking-wider">Volumen Semanal</p>
            </header>

            {/* Body Map Section */}
            <div className="ios-card p-6 mb-8 flex flex-col items-center justify-center bg-white relative overflow-hidden">
                <div className="flex gap-4 w-full h-[400px]">
                    <div className="flex-1 flex items-center justify-center relative">
                        {bodyMapFront ? (
                            <img src={bodyMapFront} alt="Body Map Front" className="h-full object-contain" />
                        ) : (
                            <div className="animate-pulse w-full h-full bg-gray-100 rounded-2xl" />
                        )}
                        <span className="absolute bottom-0 text-[10px] font-black text-gray-300 uppercase tracking-widest">Frente</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center relative">
                        {bodyMapBack ? (
                            <img src={bodyMapBack} alt="Body Map Back" className="h-full object-contain" />
                        ) : (
                            <div className="animate-pulse w-full h-full bg-gray-100 rounded-2xl" />
                        )}
                        <span className="absolute bottom-0 text-[10px] font-black text-gray-300 uppercase tracking-widest">Espalda</span>
                    </div>
                </div>
            </div>

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

                        const getColor = (val: number) => {
                            if (val <= 5) return "bg-ios-green";
                            if (val <= 12) return "bg-ios-yellow";
                            if (val <= 18) return "bg-ios-orange";
                            return "bg-ios-red";
                        };

                        return (
                            <div key={idx} className="p-4 flex items-center gap-4">
                                <div className="flex-1">
                                    <div className="flex justify-between items-baseline mb-2">
                                        <span className="font-black text-xs uppercase tracking-wider text-black">{muscle}</span>
                                        <span className="text-[10px] font-black text-ios-gray uppercase">{series} <span className="text-[8px] opacity-60">sets</span></span>
                                    </div>
                                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-1000 ${getColor(series)}`}
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
