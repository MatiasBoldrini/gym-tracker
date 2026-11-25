import { useState } from "react";
import { HomeScreen } from "@/components/screens/HomeScreen";
import type { PersonalRecord, Week } from "@/types";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAccountResource } from "@/lib/hooks/useAccountResource";
import { DEMO_MODE } from "@/lib/demo-data";
import { getDemoHomePayload, type WeekListItem } from "@/lib/sheets-client";

type HomePayload = {
    week: Week;
    weeks: WeekListItem[];
    prs: PersonalRecord[];
    setupError?: { message: string; code?: string } | null;
};

const emptyHome: HomePayload = { week: { id: 1, days: [] }, weeks: [], prs: [] };

function parseHome(value: unknown): HomePayload {
    const payload = value as HomePayload | null;
    if (payload?.setupError) throw new Error(payload.setupError.message);
    if (!payload?.week || !Array.isArray(payload.week.days) || !Array.isArray(payload.weeks) || !Array.isArray(payload.prs)) {
        throw new Error("La respuesta de la rutina no es válida.");
    }
    return payload;
}

export function HomePage() {
    const { userId } = useAuth();
    const { data, error, loading } = useAccountResource("/api/sheets/home", "home", parseHome);
    const [demo] = useState(() => DEMO_MODE ? getDemoHomePayload() : null);
    const payload = demo ?? data ?? emptyHome;

    return (
        <div>
            <HomeScreen
                key={userId ?? "guest"}
                initialWeek={payload.week}
                initialWeeks={payload.weeks}
                initialPrs={payload.prs}
                initialSetupError={error ? { message: error } : null}
                initialLoaded={!!demo || !!data}
            />
            {loading && (
                <div className="fixed top-[calc(env(safe-area-inset-top)+0.75rem)] left-1/2 -translate-x-1/2 z-40 bg-white/90 border border-black/5 shadow-sm rounded-full px-3 py-1 text-[10px] font-bold text-gray-400">
                    Actualizando datos...
                </div>
            )}
        </div>
    );
}
