import { useEffect, useState } from "react";
import type { PersonalRecord } from "@/types";
import { ProgresoScreen } from "@/components/screens/ProgresoScreen";
import { createClient } from "@/lib/supabase/client";
import { DEMO_MODE, demoPrs } from "@/lib/demo-data";
import { clearRuntimeDataCaches } from "@/lib/pwa";

const PRS_CACHE_KEY = "prs_cache_v1";

function readPrsCache(): PersonalRecord[] | null {
    try {
        const raw = localStorage.getItem(PRS_CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as PersonalRecord[];
    } catch {
        return null;
    }
}

function writePrsCache(prs: PersonalRecord[]) {
    try {
        localStorage.setItem(PRS_CACHE_KEY, JSON.stringify(prs));
    } catch {
        // best-effort
    }
}

export function ProgresoPage() {
    const [prs, setPrs] = useState<PersonalRecord[]>(() => {
        if (DEMO_MODE) return demoPrs;
        if (typeof window === "undefined") return [];
        return readPrsCache() ?? [];
    });

    useEffect(() => {
        if (DEMO_MODE) return;
        let cancelled = false;

        const load = async () => {
            try {
                const supabase = createClient();
                const { data } = await supabase.auth.getSession();
                const accessToken = data.session?.access_token;
                const init: RequestInit = {
                    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
                };
                let res = await fetch("/api/sheets/prs", init);
                if (res.status === 401) {
                    await clearRuntimeDataCaches();
                    res = await fetch("/api/sheets/prs", init);
                }
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
                if (cancelled) return;
                const next = Array.isArray(json.prs) ? (json.prs as PersonalRecord[]) : [];
                setPrs(next);
                writePrsCache(next);
            } catch (e) {
                if (!cancelled) console.error("Error cargando PRs:", e);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, []);

    return <ProgresoScreen initialPrs={prs} />;
}
