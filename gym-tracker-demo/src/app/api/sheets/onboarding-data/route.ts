import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/supabase/auth-helper";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";
import { unstable_cache } from "next/cache";

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

async function fetchOnboardingSheetData(refreshToken: string, spreadsheetId: string) {
    const accessToken = await refreshAccessToken(refreshToken);
    
    // Batch read: exercises and series in parallel (single token refresh)
    const [exercisesData, seriesData] = await Promise.all([
        readSheetValues(accessToken, spreadsheetId, `'Ejercicios'!A:D`),
        readSheetValues(accessToken, spreadsheetId, `'Series'!A:A`),
    ]);
    
    return {
        exercises: parseExercisesList(exercisesData),
        series: parseSeriesList(seriesData),
    };
}

/**
 * GET /api/sheets/onboarding-data
 * Fetch exercises and series in a single request (batch).
 * Cached per-user for 10 minutes since this data rarely changes.
 */
export async function GET() {
    try {
        const auth = await getAuthContext();
        if (!auth) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        // Create cached version per-user
        const getCachedData = unstable_cache(
            () => fetchOnboardingSheetData(auth.refreshToken, auth.spreadsheetId),
            [`onboarding-data-${auth.userId}-${auth.spreadsheetId}`],
            {
                revalidate: 600, // 10 minutes
                tags: [`sheets-${auth.userId}`, `onboarding-${auth.userId}`],
            }
        );

        const { exercises, series } = await getCachedData();

        return NextResponse.json({ exercises, series });
    } catch (error: any) {
        console.error("Error loading onboarding data:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}
