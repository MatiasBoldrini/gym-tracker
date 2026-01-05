import { NextResponse } from "next/server";
import { getUserStore, isUserAuthenticated } from "@/lib/user-store";
import { refreshAccessToken } from "@/lib/google/oauth";
import { listSpreadsheetSheetTitles } from "@/lib/google/sheets";

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
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const refreshToken = store.refreshToken;
        const spreadsheetId = store.spreadsheetId;
        if (!refreshToken) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }
        if (!spreadsheetId) {
            return NextResponse.json({ error: "No spreadsheet configured" }, { status: 403 });
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
        return NextResponse.json({ error: "Failed to list weeks" }, { status: 500 });
    }
}





