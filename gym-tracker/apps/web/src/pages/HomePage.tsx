import { useEffect, useMemo, useState } from "react";
import { HomeScreen } from "@/components/screens/HomeScreen";
import type { Week } from "@/types";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { DEMO_MODE, getDemoHomeData } from "@/lib/demo-data";
import { clearRuntimeDataCaches } from "@/lib/pwa";

type WeekListItem = { id: number; name: string };
type HomePayload = {
    week: Week;
    weeks: WeekListItem[];
    prs: any[];
    setupError?: { message: string; code?: string } | null;
};

const HOME_CACHE_KEY = "home_cache_v1";

function readHomeCache(): HomePayload | null {
    try {
        const raw = localStorage.getItem(HOME_CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as HomePayload;
    } catch {
        return null;
    }
}

function writeHomeCache(payload: HomePayload) {
    try {
        localStorage.setItem(HOME_CACHE_KEY, JSON.stringify(payload));
    } catch {
        // best-effort cache
    }
}

export function HomePage() {
    const auth = useAuth();
    const [cached] = useState<HomePayload | null>(() => {
        if (typeof window === "undefined") return null;
        return readHomeCache();
    });
    const [latest, setLatest] = useState<HomePayload | null>(null);
    const [isFetching, setIsFetching] = useState(false);

    const fallbackPayload = useMemo<HomePayload>(() => {
        if (DEMO_MODE) return getDemoHomeData();
        return {
            week: { id: 1, days: [] },
            weeks: [],
            prs: [],
            setupError: null,
        };
    }, []);

    useEffect(() => {
        if (DEMO_MODE) return;
        if (auth.isLoading) return;
        if (!auth.isAuthenticated) return;

        let cancelled = false;
        const load = async () => {
            setIsFetching(true);
            try {
                const supabase = createClient();
                const { data: sessionData } = await supabase.auth.getSession();
                const accessToken = sessionData.session?.access_token;
                const init: RequestInit = {
                    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
                };
                let res = await fetch("/api/sheets/home", init);
                if (res.status === 401) {
                    await clearRuntimeDataCaches();
                    res = await fetch("/api/sheets/home", init);
                }

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data?.error || `Error ${res.status}`);
                }
                if (cancelled) return;
                setLatest(data as HomePayload);
                writeHomeCache(data as HomePayload);
            } catch (e) {
                if (!cancelled) {
                    console.error("Error loading home data:", e);
                }
            } finally {
                if (!cancelled) setIsFetching(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [auth.isAuthenticated, auth.isLoading]);

    const data = latest || cached || fallbackPayload;

    return (
        <div>
            <HomeScreen
                initialWeek={data.week}
                initialWeeks={data.weeks}
                initialPrs={data.prs}
                initialSetupError={data.setupError ?? null}
            />
            {isFetching && !latest && (
                <div className="fixed top-[calc(env(safe-area-inset-top)+0.75rem)] left-1/2 -translate-x-1/2 z-40 bg-white/90 border border-black/5 shadow-sm rounded-full px-3 py-1 text-[10px] font-bold text-gray-400">
                    Actualizando datos...
                </div>
            )}
        </div>
    );
}
