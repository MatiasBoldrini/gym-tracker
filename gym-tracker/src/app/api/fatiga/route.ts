import { NextResponse } from "next/server";
import { getUserStore, isUserAuthenticated } from "@/lib/user-store";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";
import { computeFatigaFromSheet } from "@/lib/fatiga";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";

export async function GET() {
    try {
        const store = await getUserStore();

        if (!isUserAuthenticated(store) || !store.spreadsheetId) {
            return NextResponse.json({
                muscleRows: [],
                daySummary: [],
                calendarDays: [],
                intensityByGroupId: {},
            });
        }

        const accessToken = await refreshAccessToken(store.refreshToken!);
        const data = await readSheetValues(
            accessToken,
            store.spreadsheetId,
            `'Fatiga'!A:Z`
        );
        const { muscleRows, daySummary, calendarDays, raw } =
            computeFatigaFromSheet(data);

        return NextResponse.json({
            muscleRows,
            daySummary,
            calendarDays,
            intensityByGroupId: raw,
        });
    } catch (error) {
        console.error("Error in /api/fatiga:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}




