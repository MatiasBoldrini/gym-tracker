import { NextRequest, NextResponse } from "next/server";
import { getUserStore, isUserAuthenticated, updateUserStore } from "@/lib/user-store";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues, saveSessionRating } from "@/lib/google/sheets";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";
import { ensureSpreadsheetForUser } from "@/lib/google/drive";

interface RatingRequestBody {
    weekId: number;
    dayId: number;
    stars: number; // 1, 2, or 3
}

function validateBody(body: unknown): body is RatingRequestBody {
    if (!body || typeof body !== "object") return false;
    const b = body as Record<string, unknown>;

    if (typeof b.weekId !== "number" || b.weekId < 1) return false;
    if (typeof b.dayId !== "number" || b.dayId < 1) return false;
    if (typeof b.stars !== "number" || b.stars < 1 || b.stars > 3) return false;

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
                { error: "Invalid request body. Required: weekId, dayId, stars (1-3)" },
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
            await updateUserStore({ spreadsheetId });
        }

        // 4. Get fresh access token
        const accessToken = await refreshAccessToken(refreshToken);

        // 5. Write rating to Google Sheets
        const writeMeta = await saveSessionRating({
            accessToken,
            spreadsheetId,
            weekId: body.weekId,
            dayId: body.dayId,
            stars: body.stars,
        });

        const debug = request.nextUrl.searchParams.get("debug") === "1";
        let writtenValues: any[][] | null = null;
        if (debug) {
            try {
                writtenValues = await readSheetValues(accessToken, spreadsheetId, writeMeta.range);
            } catch {
                writtenValues = null;
            }
        }

        return NextResponse.json({
            ok: true,
            spreadsheetId,
            write: writeMeta,
            ...(debug ? { writtenValues } : {}),
        });
    } catch (error: any) {
        console.error("Error saving rating to Sheets:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}
