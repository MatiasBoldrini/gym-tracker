import { google } from "googleapis";
import { getAuthenticatedClient } from "./oauth";

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

/**
 * Finds the row for an exercise and updates/appends set data.
 * 
 * Sheet structure assumed:
 * - Multiple "Semana X" sheets
 * - Each has rows with: DIA X header, then exercise rows
 * - Columns: A=Exercise name, B=Prescribed, C=?, D=Notes, E=?, F-M=Sets (Reps/Weight pairs)
 */
export async function saveExerciseSets(params: SaveExerciseParams): Promise<void> {
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
        const cellValue = rows[i][0]?.toString().toUpperCase() || "";

        if (cellValue.startsWith("DIA ")) {
            const currentDayId = parseInt(cellValue.replace("DIA ", ""));
            inCorrectDay = currentDayId === dayId;
        } else if (inCorrectDay && rows[i][0]?.toString().toLowerCase() === exerciseName.toLowerCase()) {
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
}

/**
 * Test connection to the spreadsheet by reading sheet names
 */
export async function testSpreadsheetAccess(
    accessToken: string,
    spreadsheetId: string
): Promise<{ ok: boolean; sheetNames?: string[]; error?: string }> {
    try {
        const auth = getAuthenticatedClient(accessToken);
        const sheets = google.sheets({ version: "v4", auth });

        const response = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: "sheets.properties.title",
        });

        const sheetNames = response.data.sheets?.map(
            (s) => s.properties?.title || ""
        ).filter(Boolean) || [];

        return { ok: true, sheetNames };
    } catch (error: any) {
        return { ok: false, error: error.message };
    }
}

