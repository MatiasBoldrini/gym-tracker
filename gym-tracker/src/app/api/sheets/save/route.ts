import { NextRequest, NextResponse } from "next/server";
import { getUserStore, isUserAuthenticated } from "@/lib/user-store";
import { refreshAccessToken } from "@/lib/google/oauth";
import { saveExerciseSets, SetData } from "@/lib/google/sheets";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";
import { ensureSpreadsheetForUser } from "@/lib/google/drive";

interface SaveRequestBody {
    weekId: number;
    dayId: number;
    exerciseName: string;
    sets: SetData[];
}

function validateBody(body: unknown): body is SaveRequestBody {
    if (!body || typeof body !== "object") return false;
    const b = body as Record<string, unknown>;

    if (typeof b.weekId !== "number" || b.weekId < 1) return false;
    if (typeof b.dayId !== "number" || b.dayId < 1) return false;
    if (typeof b.exerciseName !== "string" || !b.exerciseName.trim()) return false;
    if (!Array.isArray(b.sets)) return false;

    for (const set of b.sets) {
        if (typeof set !== "object" || set === null) return false;
        if (typeof set.weight !== "number" || typeof set.reps !== "number") return false;
    }

    return true;
}

export async function POST(request: NextRequest) {
    try {
        // 1. Validate auth (cookie store)
        const store = await getUserStore();
        if (!isUserAuthenticated(store)) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        // 2. Parse and validate body
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }

        if (!validateBody(body)) {
            return NextResponse.json(
                { error: "Invalid request body. Required: weekId, dayId, exerciseName, sets" },
                { status: 400 }
            );
        }

        // 3. Get user's refresh token and spreadsheet ID from cookie store
        const refreshToken = store.refreshToken;

        if (!refreshToken) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        // Auto-bootstrap: if spreadsheetId is missing, find or create it
        let spreadsheetId = store.spreadsheetId;
        if (!spreadsheetId) {
            spreadsheetId = await ensureSpreadsheetForUser(refreshToken);
        }

        // 4. Get fresh access token
        const accessToken = await refreshAccessToken(refreshToken);

        // 5. Write to Google Sheets
        await saveExerciseSets({
            accessToken,
            spreadsheetId,
            weekId: body.weekId,
            dayId: body.dayId,
            exerciseName: body.exerciseName,
            sets: body.sets,
        });

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Error saving to Sheets:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}
