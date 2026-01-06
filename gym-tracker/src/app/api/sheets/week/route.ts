import { NextRequest, NextResponse } from "next/server";
import { getUserStore, isUserAuthenticated } from "@/lib/user-store";
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

export async function GET(request: NextRequest) {
    try {
        const weekId = getWeekIdFromRequest(request);
        if (!weekId) {
            return NextResponse.json({ error: "weekId is required" }, { status: 400 });
        }

        const store = await getUserStore();
        if (!isUserAuthenticated(store)) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const refreshToken = store.refreshToken;
        const spreadsheetId = store.spreadsheetId;
        if (!refreshToken) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }
        if (!spreadsheetId) {
            return NextResponse.json(
                {
                    error: "No hay un Google Sheet configurado. Abrí Configuración y pegá el link de tu copia.",
                    code: "NO_SPREADSHEET",
                },
                { status: 403 }
            );
        }

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










