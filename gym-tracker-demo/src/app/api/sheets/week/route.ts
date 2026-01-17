import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getAuthContext } from "@/lib/supabase/auth-helper";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";
import { parseExerciseMapping, parseWeekData } from "@/lib/sheets-parse";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";

function getWeekIdFromRequest(request: NextRequest): number | null {
    const weekIdRaw = request.nextUrl.searchParams.get("weekId");
    const weekId = Number(weekIdRaw);
    if (!Number.isFinite(weekId) || weekId < 1) return null;
    return Math.trunc(weekId);
}

// Cached function to fetch week data (per-user + weekId, 5 min TTL)
async function fetchWeekData(refreshToken: string, spreadsheetId: string, weekId: number) {
    const accessToken = await refreshAccessToken(refreshToken);

    // Load exercise mapping if the sheet exists; if not, fallback to empty mapping.
    let exerciseMapping: Record<string, string> = {};
    try {
        const mappingValues = await readSheetValues(accessToken, spreadsheetId, `'Ejercicios'!A:D`);
        exerciseMapping = parseExerciseMapping(mappingValues);
    } catch {
        exerciseMapping = {};
    }

    const weekValues = await readSheetValues(accessToken, spreadsheetId, `'Semana ${weekId}'!A:N`);
    const week = parseWeekData(weekValues, weekId, exerciseMapping);

    return week;
}

export async function GET(request: NextRequest) {
    try {
        const weekId = getWeekIdFromRequest(request);
        if (!weekId) {
            return NextResponse.json({ error: "weekId is required" }, { status: 400 });
        }

        // Get auth context from Supabase + DB
        const auth = await getAuthContext();
        if (!auth) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        // Create a cached version of the fetch function per-user + weekId
        const getCachedWeek = unstable_cache(
            () => fetchWeekData(auth.refreshToken, auth.spreadsheetId, weekId),
            [`week-${auth.userId}-${auth.spreadsheetId}-${weekId}`],
            {
                revalidate: 300, // 5 minutes
                tags: [`sheets-${auth.userId}`, `week-${auth.userId}-${weekId}`],
            }
        );

        const week = await getCachedWeek();

        return NextResponse.json({ week });
    } catch (error: any) {
        console.error("Error loading week:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}
