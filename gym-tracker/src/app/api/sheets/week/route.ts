import { NextRequest, NextResponse } from "next/server";
import { getUserStore, isUserAuthenticated } from "@/lib/user-store";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";
import { parseExerciseMapping, parseWeekData } from "@/lib/sheets";

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
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const refreshToken = store.refreshToken;
        const spreadsheetId = store.spreadsheetId;
        if (!refreshToken) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }
        if (!spreadsheetId) {
            return NextResponse.json({ error: "No spreadsheet configured" }, { status: 403 });
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
        const msg = typeof error?.message === "string" ? error.message : "";
        if (msg.includes("Unable to parse range") || msg.includes("not found")) {
            return NextResponse.json({ error: "Week sheet not found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Failed to load week" }, { status: 500 });
    }
}



