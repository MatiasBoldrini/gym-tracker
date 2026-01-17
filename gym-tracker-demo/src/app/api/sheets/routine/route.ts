import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { google } from "googleapis";
import { getAuthContext } from "@/lib/supabase/auth-helper";
import { refreshAccessToken, getAuthenticatedClient } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";

interface RoutineExercise {
    name: string;
    prescribedSeries: string;
}

interface SaveRoutineBody {
    dayId: number;
    exercises: RoutineExercise[];
}

/**
 * Find the row range for a specific day in the Semana 1 sheet.
 * Returns { startRow, endRow } where:
 * - startRow is the row with "DIA X" header (1-indexed)
 * - endRow is the last exercise row before the next DIA or end of data
 */
function findDayRange(data: any[][], dayId: number): { startRow: number; endRow: number } | null {
    let startRow = -1;
    let endRow = -1;
    let foundDay = false;

    for (let i = 0; i < data.length; i++) {
        const cellValue = data[i]?.[0]?.toString().trim().toUpperCase() || "";
        
        if (cellValue.startsWith("DIA ")) {
            const currentDayId = parseInt(cellValue.replace("DIA ", ""));
            
            if (currentDayId === dayId) {
                startRow = i + 1; // 1-indexed
                foundDay = true;
            } else if (foundDay) {
                // Found the next day, so the previous day ends here
                endRow = i; // 1-indexed (row before this one is the last)
                break;
            }
        }
    }

    if (!foundDay) return null;

    // If we didn't find a next day, the day extends to the last non-empty row
    if (endRow === -1) {
        // Find the last row with content for this day
        for (let i = startRow; i < data.length; i++) {
            const cellValue = data[i]?.[0]?.toString().trim() || "";
            if (!cellValue) {
                endRow = i; // First empty row
                break;
            }
        }
        if (endRow === -1) {
            endRow = data.length;
        }
    }

    return { startRow, endRow };
}

/**
 * Calculate the maximum number of exercise slots available for a day.
 * Based on the pattern where DIA 1 starts at row 2, exercises go from row 3 to row 9 (7 slots).
 * Each day block seems to be 10 rows (row 10 = rating row for day 1).
 */
const MAX_EXERCISES_PER_DAY = 7;

export async function POST(request: NextRequest) {
    try {
        const body: SaveRoutineBody = await request.json();
        const { dayId, exercises } = body;

        if (!dayId || dayId < 1 || dayId > 5) {
            return NextResponse.json(
                { error: "dayId debe ser un número entre 1 y 5" },
                { status: 400 }
            );
        }

        if (!Array.isArray(exercises)) {
            return NextResponse.json(
                { error: "exercises debe ser un array" },
                { status: 400 }
            );
        }

        if (exercises.length > MAX_EXERCISES_PER_DAY) {
            return NextResponse.json(
                { error: `Máximo ${MAX_EXERCISES_PER_DAY} ejercicios por día` },
                { status: 400 }
            );
        }

        const auth = await getAuthContext();
        if (!auth) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const authClient = getAuthenticatedClient(accessToken);
        const sheets = google.sheets({ version: "v4", auth: authClient });

        const sheetName = "Semana 1";

        // Read the current sheet to find day positions
        const currentData = await readSheetValues(accessToken, auth.spreadsheetId, `'${sheetName}'!A:B`);
        const dayRange = findDayRange(currentData, dayId);

        if (!dayRange) {
            return NextResponse.json(
                { error: `No se encontró el DIA ${dayId} en la hoja` },
                { status: 404 }
            );
        }

        // Calculate the exercise rows (starting after the DIA header)
        const exerciseStartRow = dayRange.startRow + 1;
        const exerciseEndRow = exerciseStartRow + MAX_EXERCISES_PER_DAY - 1;

        // Prepare values: each exercise is [name, prescribedSeries]
        // Fill remaining slots with empty values to clear old exercises
        const values: (string | null)[][] = [];
        for (let i = 0; i < MAX_EXERCISES_PER_DAY; i++) {
            if (i < exercises.length) {
                values.push([exercises[i].name, exercises[i].prescribedSeries]);
            } else {
                values.push(["", ""]); // Clear unused slots
            }
        }

        // Write the exercises to columns A and B
        const range = `'${sheetName}'!A${exerciseStartRow}:B${exerciseEndRow}`;

        await sheets.spreadsheets.values.update({
            spreadsheetId: auth.spreadsheetId,
            range,
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values,
            },
        });

        // Invalidate cache for this user's week 1 data (routine is always in Semana 1)
        // Using "minutes" profile to match our 5min cache
        revalidateTag(`week-${auth.userId}-1`, "minutes");
        revalidateTag(`home-${auth.userId}`, "minutes");
        revalidateTag(`weeks-${auth.userId}`, "minutes");

        return NextResponse.json({
            ok: true,
            dayId,
            exercisesCount: exercises.length,
            range,
        });
    } catch (error: any) {
        console.error("Error saving routine:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}

/**
 * GET endpoint to read the current routine for a specific day.
 */
export async function GET(request: NextRequest) {
    try {
        const dayId = parseInt(request.nextUrl.searchParams.get("dayId") || "0");

        if (!dayId || dayId < 1 || dayId > 5) {
            return NextResponse.json(
                { error: "dayId debe ser un número entre 1 y 5" },
                { status: 400 }
            );
        }

        const auth = await getAuthContext();
        if (!auth) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const sheetName = "Semana 1";

        // Read columns A and B
        const data = await readSheetValues(accessToken, auth.spreadsheetId, `'${sheetName}'!A:B`);
        const dayRange = findDayRange(data, dayId);

        if (!dayRange) {
            return NextResponse.json({ exercises: [] });
        }

        // Extract exercises for this day (skip the DIA header row)
        const exercises: RoutineExercise[] = [];
        for (let i = dayRange.startRow; i < dayRange.endRow; i++) {
            const row = data[i];
            const name = row?.[0]?.toString().trim();
            if (name && !name.toUpperCase().startsWith("DIA ")) {
                exercises.push({
                    name,
                    prescribedSeries: row?.[1]?.toString().trim() || "",
                });
            }
        }

        return NextResponse.json({ exercises });
    } catch (error: any) {
        console.error("Error reading routine:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}
