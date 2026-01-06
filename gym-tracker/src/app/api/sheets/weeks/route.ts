import { NextResponse } from "next/server";
import { getUserStore, isUserAuthenticated } from "@/lib/user-store";
import { refreshAccessToken } from "@/lib/google/oauth";
import { listSpreadsheetSheetTitles } from "@/lib/google/sheets";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";

function parseWeekFromTitle(title: string): { id: number; name: string } | null {
    const match = title.trim().match(/^Semana\s+(\d+)$/i);
    if (!match) return null;
    const id = Number(match[1]);
    if (!Number.isFinite(id) || id < 1) return null;
    return { id, name: `Semana ${id}` };
}

export async function GET() {
    try {
        const store = await getUserStore();
        if (!isUserAuthenticated(store)) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const refreshToken = store.refreshToken;
        const spreadsheetId = store.spreadsheetId;
        if (!refreshToken) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }
        if (!spreadsheetId) {
            return NextResponse.json(
                {
                    error: "No hay un Google Sheet configurado. Abrí Configuración y pegá el link de tu copia.",
                    code: "NO_SPREADSHEET",
                },
                { status: 403 }
            );
        }

        const accessToken = await refreshAccessToken(refreshToken);
        const titles = await listSpreadsheetSheetTitles(accessToken, spreadsheetId);

        const weeks = titles
            .map(parseWeekFromTitle)
            .filter((w): w is { id: number; name: string } => !!w)
            .sort((a, b) => a.id - b.id);

        return NextResponse.json({ weeks });
    } catch (error: any) {
        console.error("Error listing weeks:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}










