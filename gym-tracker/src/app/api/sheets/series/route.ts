import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/supabase/auth-helper";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";

function parseSeriesList(data: any[][]): string[] {
    const series: string[] = [];
    
    data.forEach((row, idx) => {
        // Skip header row if it exists
        if (idx === 0 && row[0]?.toString().toLowerCase().includes("series")) return;
        
        const value = row[0]?.toString().trim();
        if (value) {
            series.push(value);
        }
    });
    
    return series;
}

export async function GET() {
    try {
        const auth = await getAuthContext();
        if (!auth) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const accessToken = await refreshAccessToken(auth.refreshToken);
        
        // Read column A from Series sheet
        const values = await readSheetValues(accessToken, auth.spreadsheetId, `'Series'!A:A`);
        const series = parseSeriesList(values);

        return NextResponse.json({ series });
    } catch (error: any) {
        console.error("Error loading series:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}
