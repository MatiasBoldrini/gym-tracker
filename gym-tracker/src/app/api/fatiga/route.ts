import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/supabase/auth-helper";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";
import { computeFatigaFromSheet } from "@/lib/fatiga";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";
import { DEMO_MODE, getDemoFatigaData } from "@/lib/demo-data";

export async function GET() {
    try {
        if (DEMO_MODE) {
            return NextResponse.json(getDemoFatigaData());
        }
        // Get auth context from Supabase + DB
        const auth = await getAuthContext();
        
        if (!auth) {
            return NextResponse.json({
                muscleRows: [],
                daySummary: [],
                calendarDays: [],
                intensityByGroupId: {},
            });
        }

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const data = await readSheetValues(
            accessToken,
            auth.spreadsheetId,
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
