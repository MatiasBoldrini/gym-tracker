import { NextResponse } from "next/server";
import { getUserStore, isUserAuthenticated } from "@/lib/user-store";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";
import { computeFatigaFromSheet } from "@/lib/fatiga";

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
        return NextResponse.json(
            { error: "Failed to load fatiga data" },
            { status: 500 }
        );
    }
}



