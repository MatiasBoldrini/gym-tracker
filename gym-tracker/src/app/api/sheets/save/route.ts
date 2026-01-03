import { NextRequest, NextResponse } from "next/server";
import { getUserStore, isUserAuthenticated } from "@/lib/user-store";
import { refreshAccessToken } from "@/lib/google/oauth";
import { saveExerciseSets, SetData } from "@/lib/google/sheets";

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
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
        const spreadsheetId = store.spreadsheetId;

        if (!refreshToken) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        if (!spreadsheetId) {
            return NextResponse.json(
                { error: "No spreadsheet configured. Please set your spreadsheet URL." },
                { status: 403 }
            );
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

        // Provide meaningful error messages
        if (error.message?.includes("not found")) {
            return NextResponse.json(
                { error: error.message },
                { status: 404 }
            );
        }

        if (error.code === 403 || error.message?.includes("permission")) {
            return NextResponse.json(
                { error: "Permission denied. Make sure your Google account has access to the spreadsheet." },
                { status: 403 }
            );
        }

        return NextResponse.json(
            { error: "Failed to save data. Please try again." },
            { status: 500 }
        );
    }
}

