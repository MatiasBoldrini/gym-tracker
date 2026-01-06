"use client";

import { useEffect, useState } from "react";
import { FatigaScreen } from "@/components/screens/FatigaScreen";
import { Loader2 } from "lucide-react";
import type { FatigaDaySummaryRow, FatigaMuscleRow } from "@/lib/fatiga";

interface FatigaData {
    muscleRows: FatigaMuscleRow[];
    daySummary: FatigaDaySummaryRow[];
    calendarDays: string[];
    intensityByGroupId: Record<string, number>;
}

export default function FatigaPage() {
    const [data, setData] = useState<FatigaData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadFatiga() {
            try {
                const response = await fetch("/api/fatiga");
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error || `Error ${response.status}`);
                }
                const json: FatigaData = await response.json();
                setData(json);
            } catch (err: any) {
                console.error("Error loading fatiga:", err);
                setError(err.message || "Error al cargar datos");
            } finally {
                setIsLoading(false);
            }
        }

        loadFatiga();
    }, []);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
                <Loader2 className="w-8 h-8 animate-spin text-ios-gray" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                <div className="mb-4 text-ios-red">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold mb-2">Error al cargar datos</h2>
                <p className="text-ios-gray text-sm mb-6 max-w-xs">
                    No se pudo cargar la información de fatiga. Por favor verifica la conexión con Google Sheets.
                </p>
                <div className="text-xs bg-gray-100 p-3 rounded-lg text-left w-full max-w-sm overflow-auto">
                    {error}
                </div>
            </div>
        );
    }

    return (
        <FatigaScreen
            muscleRows={data?.muscleRows ?? []}
            daySummary={data?.daySummary ?? []}
            calendarDays={data?.calendarDays ?? []}
            intensityByGroupId={data?.intensityByGroupId ?? {}}
        />
    );
}
