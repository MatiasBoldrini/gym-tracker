import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/supabase/auth-helper";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readExerciseSetsBulk } from "@/lib/google/sheets";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";

function parsePositiveInt(val: unknown): number | null {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.trunc(n);
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
            return NextResponse.json(
                { error: "Invalid JSON body" },
                { status: 400 }
            );
        }

        const weekId = parsePositiveInt(body.weekId);
        const dayId = parsePositiveInt(body.dayId);
        const exerciseNames: string[] = Array.isArray(body.exerciseNames)
            ? body.exerciseNames.filter((n: unknown) => typeof n === "string" && n.trim())
            : [];

        if (!weekId || !dayId) {
            return NextResponse.json(
                { error: "weekId and dayId are required" },
                { status: 400 }
            );
        }

        if (exerciseNames.length === 0) {
            return NextResponse.json(
                { error: "exerciseNames array is required and must not be empty" },
                { status: 400 }
            );
        }

        const auth = await getAuthContext();
        if (!auth) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const results = await readExerciseSetsBulk({
            accessToken,
            spreadsheetId: auth.spreadsheetId,
            weekId,
            dayId,
            exerciseNames,
        });

        return NextResponse.json({ results });
    } catch (error: any) {
        console.error("Error reading exercise sets bulk:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}
