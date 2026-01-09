import { google } from "googleapis";
import { getAuthenticatedClient } from "./oauth";
import { normalizeExerciseKey } from "@/lib/normalize";

export interface SetData {
    weight: number;
    reps: number;
}

export interface SaveExerciseParams {
    accessToken: string;
    spreadsheetId: string;
    weekId: number;
    dayId: number;
    exerciseName: string;
    sets: SetData[];
}

export async function listSpreadsheetSheetTitles(accessToken: string, spreadsheetId: string): Promise<string[]> {
    const auth = getAuthenticatedClient(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties.title",
    });

    return (
        response.data.sheets
            ?.map((s) => s.properties?.title || "")
            .filter(Boolean) || []
    );
}

export async function readSheetValues(
    accessToken: string,
    spreadsheetId: string,
    range: string
): Promise<any[][]> {
    const auth = getAuthenticatedClient(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        // Importante: evita valores formateados tipo "72,1" y devuelve números como números.
        valueRenderOption: "UNFORMATTED_VALUE",
    });

    return (response.data.values as any[][]) || [];
}

export async function readExerciseSets(params: {
    accessToken: string;
    spreadsheetId: string;
    weekId: number;
    dayId: number;
    exerciseName: string;
}): Promise<SetData[]> {
    const { accessToken, spreadsheetId, weekId, dayId, exerciseName } = params;
    const auth = getAuthenticatedClient(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const sheetName = `Semana ${weekId}`;

    // Read A:M to have exercise names + up to 4 set pairs (F..M)
    const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!A:M`,
        valueRenderOption: "UNFORMATTED_VALUE",
    });

    const rows = (readResponse.data.values as any[][]) || [];

    let inCorrectDay = false;
    let targetRow: any[] | null = null;

    for (let i = 0; i < rows.length; i++) {
        const cellValue = rows[i]?.[0]?.toString().trim().toUpperCase() || "";

        if (cellValue.startsWith("DIA ")) {
            const currentDayId = parseInt(cellValue.replace("DIA ", ""));
            inCorrectDay = currentDayId === dayId;
        } else if (inCorrectDay && normalizeExerciseKey(rows[i]?.[0]) === normalizeExerciseKey(exerciseName)) {
            targetRow = rows[i];
            break;
        }
    }

    if (!targetRow) {
        throw new Error(`Exercise "${exerciseName}" not found in ${sheetName} Day ${dayId}`);
    }

    const sets: SetData[] = [];
    for (let i = 0; i < 4; i++) {
        const repCol = 5 + i * 2; // F is index 5
        const weightCol = 6 + i * 2; // G is index 6
        const repsRaw = targetRow[repCol];
        const weightRaw = targetRow[weightCol];

        const reps = Number.parseFloat(repsRaw);
        const weight = Number.parseFloat(weightRaw);

        // No “capear” reps a 30: hay ejercicios con rangos más altos (p.ej. zancadas).
        // Igual mantenemos límites razonables para evitar ruido de plantilla/formulas.
        const repsOk = Number.isFinite(reps) && reps > 0 && reps <= 500;
        const weightOk = Number.isFinite(weight) && weight >= 0 && weight <= 500;
        // Si está incompleto (p.ej. peso sin reps), lo tratamos como vacío.
        sets.push(repsOk && weightOk ? { reps, weight } : { reps: 0, weight: 0 });
    }

    return sets;
}

/**
 * Finds the row for an exercise and updates/appends set data.
 * 
 * Sheet structure assumed:
 * - Multiple "Semana X" sheets
 * - Each has rows with: DIA X header, then exercise rows
 * - Columns: A=Exercise name, B=Prescribed, C=?, D=Notes, E=?, F-M=Sets (Reps/Weight pairs)
 */
export async function saveExerciseSets(
    params: SaveExerciseParams
): Promise<{ sheetName: string; range: string; rowIndex: number }> {
    const { accessToken, spreadsheetId, weekId, dayId, exerciseName, sets } = params;

    const auth = getAuthenticatedClient(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    // Determine sheet name (e.g., "Semana 1")
    const sheetName = `Semana ${weekId}`;

    // First, read the sheet to find the exercise row
    const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!A:A`,
    });

    const rows = readResponse.data.values || [];

    // Find the row index for this exercise within the correct day section
    let inCorrectDay = false;
    let exerciseRowIndex = -1;

    for (let i = 0; i < rows.length; i++) {
        const cellValue = rows[i][0]?.toString().trim().toUpperCase() || "";

        if (cellValue.startsWith("DIA ")) {
            const currentDayId = parseInt(cellValue.replace("DIA ", ""));
            inCorrectDay = currentDayId === dayId;
        } else if (inCorrectDay && normalizeExerciseKey(rows[i][0]) === normalizeExerciseKey(exerciseName)) {
            exerciseRowIndex = i + 1; // 1-indexed for Sheets API
            break;
        }
    }

    if (exerciseRowIndex === -1) {
        throw new Error(`Exercise "${exerciseName}" not found in ${sheetName} Day ${dayId}`);
    }

    // Build the values to write
    // Columns F-M are indices 5-12 (0-indexed)
    // F: Reps 1, G: Weight 1, H: Reps 2, I: Weight 2, etc.
    const setValues: (number | string)[] = [];
    for (let i = 0; i < 4; i++) {
        if (i < sets.length) {
            setValues.push(sets[i].reps, sets[i].weight);
        } else {
            setValues.push("", ""); // Empty if no set
        }
    }

    // Update the row (columns F through M = 6th to 13th columns)
    const range = `'${sheetName}'!F${exerciseRowIndex}:M${exerciseRowIndex}`;

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
            values: [setValues],
        },
    });

    return {
        sheetName,
        range,
        rowIndex: exerciseRowIndex,
    };
}

export interface SaveSessionRatingParams {
    accessToken: string;
    spreadsheetId: string;
    weekId: number;
    dayId: number;
    stars: number; // 1, 2, or 3
}

/**
 * Converts a star count (1-3) to the string format used in the spreadsheet.
 */
function starsToString(stars: number): string {
    switch (stars) {
        case 1:
            return "★☆☆";
        case 2:
            return "★★☆";
        case 3:
            return "★★★";
        default:
            return "★☆☆";
    }
}

/**
 * Save session rating (stars) to the spreadsheet.
 * The rating is stored in cell F10, F20, F30, etc. based on dayId.
 * Formula: ratingRow = dayId * 10
 */
export async function saveSessionRating(
    params: SaveSessionRatingParams
): Promise<{ sheetName: string; range: string; rowIndex: number; value: string }> {
    const { accessToken, spreadsheetId, weekId, dayId, stars } = params;

    const auth = getAuthenticatedClient(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const sheetName = `Semana ${weekId}`;
    const ratingRow = dayId * 10;
    const range = `'${sheetName}'!F${ratingRow}`;
    const ratingValue = starsToString(stars);

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
            values: [[ratingValue]],
        },
    });

    return {
        sheetName,
        range,
        rowIndex: ratingRow,
        value: ratingValue,
    };
}

/**
 * Test connection to the spreadsheet by reading sheet names
 */
export async function testSpreadsheetAccess(
    accessToken: string,
    spreadsheetId: string
): Promise<{ ok: boolean; sheetNames?: string[]; error?: string }> {
    try {
        const sheetNames = await listSpreadsheetSheetTitles(accessToken, spreadsheetId);

        return { ok: true, sheetNames };
    } catch (error: any) {
        return { ok: false, error: error.message };
    }
}

