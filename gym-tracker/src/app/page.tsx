import { HomeScreen } from "@/components/screens/HomeScreen";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";
import { parsePRData, parseWeekData } from "@/lib/sheets-parse";
import { unstable_cache } from "next/cache";
import type { Week } from "@/types";
import { DEMO_MODE, getDemoHomeData } from "@/lib/demo-data";

async function readPrSheet(accessToken: string, spreadsheetId: string) {
    const sheetNames = ["RM A,B,C", "RM"];
    for (const name of sheetNames) {
        try {
            const values = await readSheetValues(accessToken, spreadsheetId, `'${name}'!A:E`);
            if (Array.isArray(values) && values.length > 0) return values;
        } catch {
            // Intentamos la siguiente opción si falla
        }
    }
    return [];
}

type WeekListItem = { id: number; name: string };

// Cached function to fetch all home data from Sheets (per-user, 5 min TTL)
async function fetchHomeSheetData(refreshToken: string, spreadsheetId: string) {
    const accessToken = await refreshAccessToken(refreshToken);
    const weekId = 1;
    const weeks: WeekListItem[] = [{ id: 1, name: "Semana 1" }];

    // Keep the critical path minimal: load the week + PRs.
    // Images are enriched client-side (cached endpoint) so first paint isn't blocked by 'Ejercicios' sheet.
    const [weekValues, prValues] = await Promise.all([
        readSheetValues(accessToken, spreadsheetId, `'Semana ${weekId}'!A:N`),
        readPrSheet(accessToken, spreadsheetId),
    ]);

    const week = parseWeekData(weekValues, weekId);
    const prs = parsePRData(prValues);

    return { week, weeks, prs };
}

async function getHomeData(): Promise<{
    week: Week;
    weeks: WeekListItem[];
    prs: any[];
    setupError?: { message: string; code?: string } | null;
}> {
    if (DEMO_MODE) {
        return getDemoHomeData();
    }
    const supabase = await createClient();
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return { week: { id: 1, days: [] }, weeks: [], prs: [], setupError: null };
    }

    // Get user integration from DB
    const { data: integration, error: dbError } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", user.id)
        .single();

    if (dbError || !integration || !integration.spreadsheet_id || !integration.google_refresh_token_enc) {
        return { week: { id: 1, days: [] }, weeks: [], prs: [], setupError: null };
    }

    try {
        // Decrypt refresh token
        const refreshToken = await decrypt(integration.google_refresh_token_enc);

        // Create a cached version of the fetch function per-user
        const getCachedHomeData = unstable_cache(
            () => fetchHomeSheetData(refreshToken, integration.spreadsheet_id),
            [`home-${user.id}-${integration.spreadsheet_id}`],
            {
                revalidate: 300, // 5 minutes
                tags: [`sheets-${user.id}`, `home-${user.id}`],
            }
        );

        const { week, weeks, prs } = await getCachedHomeData();

        return { week, weeks, prs, setupError: null };
    } catch (err: any) {
        // IMPORTANT: si esto revienta, el usuario queda sin UI para corregir el link/permisos.
        // Así que devolvemos data vacía + un mensaje claro para que el cliente abra Setup.
        const normalized = normalizeSheetsError(err);
        return {
            week: { id: 1, days: [] },
            weeks: [],
            prs: [],
            setupError: { message: normalized.message, code: normalized.code },
        };
    }
}

export default async function Home() {
    const { week, weeks, prs, setupError } = await getHomeData();
    return <HomeScreen initialWeek={week} initialWeeks={weeks} initialPrs={prs} initialSetupError={setupError} />;
}
