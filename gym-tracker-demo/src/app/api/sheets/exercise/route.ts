import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/supabase/auth-helper";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readExerciseSets } from "@/lib/google/sheets";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";

function parsePositiveInt(val: string | null): number | null {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.trunc(n);
}

export async function GET(request: NextRequest) {
    try {
        const weekId = parsePositiveInt(request.nextUrl.searchParams.get("weekId"));
        const dayId = parsePositiveInt(request.nextUrl.searchParams.get("dayId"));
        const exerciseName = request.nextUrl.searchParams.get("exerciseName")?.trim();

        if (!weekId || !dayId || !exerciseName) {
            return NextResponse.json(
                { error: "weekId, dayId and exerciseName are required" },
                { status: 400 }
            );
        }

        // Get auth context from Supabase + DB
        const auth = await getAuthContext();
        if (!auth) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const sets = await readExerciseSets({
            accessToken,
            spreadsheetId: auth.spreadsheetId,
            weekId,
            dayId,
            exerciseName,
        });

        return NextResponse.json({ sets });
    } catch (error: any) {
        console.error("Error reading exercise sets:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}
