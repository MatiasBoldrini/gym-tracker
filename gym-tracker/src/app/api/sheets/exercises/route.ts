import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/supabase/auth-helper";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";

export interface ExerciseItem {
    name: string;
    muscle: string;
    categories: string;
    image: string;
}

function parseExercisesList(data: any[][]): ExerciseItem[] {
    const exercises: ExerciseItem[] = [];
    
    data.forEach((row, idx) => {
        // Skip header row
        if (idx === 0 && row[0]?.toString().toLowerCase().includes("ejercicio")) return;
        
        const name = row[0]?.toString().trim();
        if (!name) return;
        
        exercises.push({
            name,
            muscle: row[1]?.toString().trim() || "",
            categories: row[2]?.toString().trim() || "",
            image: row[3]?.toString().trim() || "",
        });
    });
    
    return exercises;
}

export async function GET() {
    try {
        const auth = await getAuthContext();
        if (!auth) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const accessToken = await refreshAccessToken(auth.refreshToken);
        
        // Read columns A-D from Ejercicios sheet
        const values = await readSheetValues(accessToken, auth.spreadsheetId, `'Ejercicios'!A:D`);
        const exercises = parseExercisesList(values);

        return NextResponse.json({ exercises });
    } catch (error: any) {
        console.error("Error loading exercises:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}
