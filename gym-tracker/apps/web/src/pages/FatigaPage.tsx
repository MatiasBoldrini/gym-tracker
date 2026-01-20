import { useEffect, useState } from "react";
import { FatigaScreen } from "@/components/screens/FatigaScreen";
import { createClient } from "@/lib/supabase/client";
import { DEMO_MODE, getDemoFatigaData } from "@/lib/demo-data";
import type { FatigaDaySummaryRow, FatigaMuscleRow } from "@/lib/fatiga";
import { clearRuntimeDataCaches } from "@/lib/pwa";

type FatigaPayload = {
    muscleRows: FatigaMuscleRow[];
    daySummary: FatigaDaySummaryRow[];
    calendarDays: string[];
    intensityByGroupId: Record<string, number>;
};

const FATIGA_CACHE_KEY = "fatiga_cache_v1";

function readFatigaCache(): FatigaPayload | null {
    try {
        const raw = localStorage.getItem(FATIGA_CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as FatigaPayload;
    } catch {
        return null;
    }
}

function writeFatigaCache(payload: FatigaPayload) {
    try {
        localStorage.setItem(FATIGA_CACHE_KEY, JSON.stringify(payload));
    } catch {
        // best-effort
    }
}

export function FatigaPage() {
    const [data, setData] = useState<FatigaPayload>(() => {
        if (DEMO_MODE) return getDemoFatigaData();
        if (typeof window === "undefined") {
            return { muscleRows: [], daySummary: [], calendarDays: [], intensityByGroupId: {} };
        }
        const cached = readFatigaCache();
        if (cached) return cached;
        return { muscleRows: [], daySummary: [], calendarDays: [], intensityByGroupId: {} };
    });

    useEffect(() => {
        if (DEMO_MODE) return;
        let cancelled = false;
        const load = async () => {
            try {
                const supabase = createClient();
                const { data: sessionData } = await supabase.auth.getSession();
                const accessToken = sessionData.session?.access_token;
                const init: RequestInit = {
                    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
                };
                let res = await fetch("/api/fatiga", init);
                if (res.status === 401) {
                    await clearRuntimeDataCaches();
                    res = await fetch("/api/fatiga", init);
                }
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
                if (!cancelled) {
                    const payload = json as FatigaPayload;
                    setData(payload);
                    writeFatigaCache(payload);
                }
            } catch (e) {
                if (!cancelled) console.error("Error cargando fatiga:", e);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <FatigaScreen
            muscleRows={data.muscleRows}
            daySummary={data.daySummary}
            calendarDays={data.calendarDays}
            intensityByGroupId={data.intensityByGroupId}
        />
    );
}
