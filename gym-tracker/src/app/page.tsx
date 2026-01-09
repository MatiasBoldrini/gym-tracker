import { HomeScreen } from "@/components/screens/HomeScreen";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/google/oauth";
import { listSpreadsheetSheetTitles, readSheetValues } from "@/lib/google/sheets";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";
import { parseExerciseMapping, parsePRData, parseWeekData } from "@/lib/sheets-parse";
import type { Week } from "@/types";

export const dynamic = "force-dynamic";

function parseWeekFromTitle(title: string): number | null {
    const match = title.trim().match(/^Semana\s+(\d+)$/i);
    if (!match) return null;
    const id = Number(match[1]);
    if (!Number.isFinite(id) || id < 1) return null;
    return Math.trunc(id);
}

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

async function getHomeData(): Promise<{
    week: Week;
    prs: any[];
    setupError?: { message: string; code?: string } | null;
}> {
    const supabase = await createClient();
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return { week: { id: 1, days: [] }, prs: [], setupError: null };
    }

    // Get user integration from DB
    const { data: integration, error: dbError } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", user.id)
        .single();

    if (dbError || !integration || !integration.spreadsheet_id || !integration.google_refresh_token_enc) {
        return { week: { id: 1, days: [] }, prs: [], setupError: null };
    }

    try {
        // Decrypt refresh token
        const refreshToken = await decrypt(integration.google_refresh_token_enc);
        const accessToken = await refreshAccessToken(refreshToken);
        const spreadsheetId = integration.spreadsheet_id;

        // Detectar semanas disponibles por títulos reales.
        const titles = await listSpreadsheetSheetTitles(accessToken, spreadsheetId);
        const availableWeekIds = titles
            .map(parseWeekFromTitle)
            .filter((n): n is number => typeof n === "number")
            .sort((a, b) => a - b);

        const weekId = availableWeekIds[0] ?? 1;

        const [weekValues, prValues, mappingValues] = await Promise.all([
            readSheetValues(accessToken, spreadsheetId, `'Semana ${weekId}'!A:N`),
            readPrSheet(accessToken, spreadsheetId),
            readSheetValues(accessToken, spreadsheetId, `'Ejercicios'!A:D`).catch(() => []),
        ]);

        const exerciseMapping = parseExerciseMapping(mappingValues);
        const week = parseWeekData(weekValues, weekId, exerciseMapping);
        const prs = parsePRData(prValues);

        return { week, prs, setupError: null };
    } catch (err: any) {
        // IMPORTANT: si esto revienta, el usuario queda sin UI para corregir el link/permisos.
        // Así que devolvemos data vacía + un mensaje claro para que el cliente abra Setup.
        const normalized = normalizeSheetsError(err);
        return {
            week: { id: 1, days: [] },
            prs: [],
            setupError: { message: normalized.message, code: normalized.code },
        };
    }
}

export default async function Home() {
    const { week, prs, setupError } = await getHomeData();
    return <HomeScreen initialWeek={week} initialPrs={prs} initialSetupError={setupError} />;
}
