import { google } from "googleapis";
import { getAuthenticatedClient } from "./oauth";
import { normalizeExerciseKey } from "../normalize";
import { MAX_SETS, parseRowSets, type RecordedSet } from "../set-values";
import { findDayRange } from "./workout-sheet";

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
    sets: (RecordedSet | null)[];
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

export async function readSheetValuesBatch(
    accessToken: string,
    spreadsheetId: string,
    ranges: string[]
): Promise<Record<string, any[][]>> {
    const auth = getAuthenticatedClient(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        valueRenderOption: "UNFORMATTED_VALUE",
    });

    // The API can normalize A1 ranges. It preserves the order of the requests.
    const valueRanges = response.data.valueRanges ?? [];
    return Object.fromEntries(ranges.map((range, index) => [range, valueRanges[index]?.values ?? []]));
}

function findExerciseRow(rows: any[][], dayId: number, exerciseName: string): number {
    const range = findDayRange(rows, dayId);
    if (!range) return -1;
    const exerciseKey = normalizeExerciseKey(exerciseName);
    const position = rows.slice(range.startRow, range.endRow)
        .findIndex((row) => normalizeExerciseKey(row?.[0]) === exerciseKey);
    return position < 0 ? -1 : range.startRow + position;
}

function toLegacySets(row: any[]): SetData[] {
    return parseRowSets(row).map(({ reps, weight }) => ({ reps: reps ?? 0, weight: weight ?? 0 }));
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

    const targetRow = findExerciseRow(rows, dayId, exerciseName);
    if (targetRow < 0) {
        throw new Error(`Exercise "${exerciseName}" not found in ${sheetName} Day ${dayId}`);
    }
    return toLegacySets(rows[targetRow]);
}

export interface BulkExerciseResult {
    exerciseName: string;
    sets: SetData[];
}

/**
 * Reads sets for multiple exercises in a single Sheets API call.
 * Throws if any requested exercise is not found (fail-all behavior).
 */
export async function readExerciseSetsBulk(params: {
    accessToken: string;
    spreadsheetId: string;
    weekId: number;
    dayId: number;
    exerciseNames: string[];
}): Promise<BulkExerciseResult[]> {
    const { accessToken, spreadsheetId, weekId, dayId, exerciseNames } = params;

    if (exerciseNames.length === 0) {
        return [];
    }

    const auth = getAuthenticatedClient(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const sheetName = `Semana ${weekId}`;

    // Single read for all exercises
    const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!A:M`,
        valueRenderOption: "UNFORMATTED_VALUE",
    });

    const rows = (readResponse.data.values as any[][]) || [];

    const results: BulkExerciseResult[] = [];
    const missing: string[] = [];
    for (const exerciseName of exerciseNames) {
        const row = findExerciseRow(rows, dayId, exerciseName);
        if (row < 0) {
            missing.push(exerciseName);
        } else {
            results.push({ exerciseName, sets: toLegacySets(rows[row]) });
        }
    }

    if (missing.length > 0) {
        throw new Error(
            `Exercises not found in ${sheetName} Day ${dayId}: ${missing.join(", ")}`
        );
    }

    return results;
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

    const targetRow = findExerciseRow(rows, dayId, exerciseName);
    if (targetRow < 0) {
        throw new Error(`Exercise "${exerciseName}" not found in ${sheetName} Day ${dayId}`);
    }
    const exerciseRowIndex = targetRow + 1;
    const setValues = Array.from({ length: MAX_SETS }, (_, index) => [
        sets[index]?.reps ?? "", sets[index]?.weight ?? "",
    ]).flat();

    // Update the row (columns F through M = 6th to 13th columns)
    const range = `'${sheetName}'!F${exerciseRowIndex}:M${exerciseRowIndex}`;

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
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
