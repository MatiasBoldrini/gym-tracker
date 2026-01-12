import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/supabase/auth-helper";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";

interface DaySummary {
    id: number;
    exercisesCount: number;
}

/**
 * GET /api/sheets/routine/days
 * Returns a summary of exercises count per day in Semana 1.
 * Useful for determining which days are "empty" vs "configured".
 */
export async function GET() {
    try {
        const auth = await getAuthContext();
        if (!auth) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const sheetName = "Semana 1";

        // Read columns A and B
        const data = await readSheetValues(accessToken, auth.spreadsheetId, `'${sheetName}'!A:B`);

        // Parse days and count exercises
        const daySummaries: DaySummary[] = [];
        let currentDayId: number | null = null;
        let currentExerciseCount = 0;

        for (const row of data) {
            const cellValue = row[0]?.toString().trim().toUpperCase() || "";

            if (cellValue.startsWith("DIA ")) {
                // If we were tracking a day, save it
                if (currentDayId !== null) {
                    daySummaries.push({
                        id: currentDayId,
                        exercisesCount: currentExerciseCount,
                    });
                }

                // Start tracking new day
                currentDayId = parseInt(cellValue.replace("DIA ", ""));
                currentExerciseCount = 0;
            } else if (currentDayId !== null && row[0]) {
                // Count non-header exercise rows
                const value = row[0].toString().trim();
                if (value && value !== "Ejercicio" && !value.toUpperCase().startsWith("DIA")) {
                    currentExerciseCount++;
                }
            }
        }

        // Don't forget the last day
        if (currentDayId !== null) {
            daySummaries.push({
                id: currentDayId,
                exercisesCount: currentExerciseCount,
            });
        }

        // Ensure we have entries for days 1-5 (even if empty in sheet)
        const dayMap = new Map<number, DaySummary>();
        for (const ds of daySummaries) {
            dayMap.set(ds.id, ds);
        }

        const result: DaySummary[] = [];
        for (let i = 1; i <= 5; i++) {
            result.push(dayMap.get(i) || { id: i, exercisesCount: 0 });
        }

        return NextResponse.json({ days: result });
    } catch (error: any) {
        console.error("Error reading routine days summary:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}
