import { NextRequest, NextResponse } from "next/server";
import { getUserStore, isUserAuthenticated, updateUserStore } from "@/lib/user-store";
import { refreshAccessToken } from "@/lib/google/oauth";
import { listSpreadsheetSheetTitles } from "@/lib/google/sheets";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";

// Extract spreadsheet ID from various URL formats
function extractSpreadsheetId(input: string): string | null {
    // If it's already just an ID (no slashes, reasonable length)
    if (/^[a-zA-Z0-9_-]{20,50}$/.test(input.trim())) {
        return input.trim();
    }

    // Try to extract from URL
    // Formats:
    // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
    // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

export async function GET() {
    try {
        const store = await getUserStore();
        if (!isUserAuthenticated(store)) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        return NextResponse.json({ spreadsheetId: store.spreadsheetId || null });
    } catch (error) {
        console.error("Error getting spreadsheet ID:", error);
        return NextResponse.json({ error: "Failed to get spreadsheet" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const store = await getUserStore();
        if (!isUserAuthenticated(store)) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const body = await request.json();
        const { spreadsheetUrl } = body;

        if (!spreadsheetUrl || typeof spreadsheetUrl !== "string") {
            return NextResponse.json(
                { error: "Tenés que enviar `spreadsheetUrl`" },
                { status: 400 }
            );
        }

        const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
        if (!spreadsheetId) {
            return NextResponse.json(
                { error: "El link/ID del spreadsheet no es válido. Pegá la URL completa de Google Sheets." },
                { status: 400 }
            );
        }

        // Validar que el usuario realmente tenga acceso al Sheet ANTES de guardarlo,
        // para no dejarlo “bloqueado” con una config inválida.
        const refreshToken = store.refreshToken;
        if (!refreshToken) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        try {
            const accessToken = await refreshAccessToken(refreshToken);
            // Con listar pestañas alcanza como health check (permiso + existencia).
            await listSpreadsheetSheetTitles(accessToken, spreadsheetId);
        } catch (err: any) {
            const normalized = normalizeSheetsError(err);
            return NextResponse.json(
                { error: normalized.message, code: normalized.code },
                { status: normalized.status }
            );
        }

        await updateUserStore({ spreadsheetId });

        return NextResponse.json({ ok: true, spreadsheetId });
    } catch (error) {
        console.error("Error saving spreadsheet ID:", error);
        return NextResponse.json({ error: "Failed to save spreadsheet" }, { status: 500 });
    }
}

