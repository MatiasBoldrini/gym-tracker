import type { sheets_v4 } from "googleapis";
import { normalizeExerciseKey } from "../normalize";

export const MAX_DAYS = 5;
export const MAX_EXERCISES_PER_DAY = 7;

export function readDayId(value: unknown): number | null {
    const match = String(value ?? "").trim().match(/^D[IÍ]A\s+(\d+)(?:\s|$)/i);
    return match ? Number(match[1]) : null;
}

export function findDayRange(rows: readonly (readonly unknown[])[], dayId: number) {
    const header = rows.findIndex((row) => readDayId(row[0]) === dayId);
    if (header === -1) return null;

    const startRow = header + 1;
    const nextHeader = rows.findIndex((row, index) => index > header && readDayId(row[0]) !== null);
    const ratingRow = dayId * 10 - 1;
    let endRow = startRow + MAX_EXERCISES_PER_DAY;
    if (nextHeader !== -1) endRow = Math.min(endRow, nextHeader);
    if (ratingRow >= startRow) endRow = Math.min(endRow, ratingRow);

    return { startRow, endRow };
}

type Cell = sheets_v4.Schema$CellData;
type SheetRequest = sheets_v4.Schema$Request;

export type RoutineExercise = { name: string; prescribedSeries: string };

export type WorkoutSheet = {
    id: number;
    rowCount: number;
    rows: Cell[][];
    exerciseNames: string[][];
};

export async function readWorkoutSheet(
    sheets: sheets_v4.Sheets,
    spreadsheetId: string,
    title: string,
): Promise<WorkoutSheet> {
    const { data } = await sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [`'${title.replace(/'/g, "''")}'!A:M`],
        fields: "sheets(properties(sheetId,gridProperties(rowCount)),data(rowData(values(userEnteredValue,effectiveValue)))",
    });
    const sheet = data.sheets?.[0];
    const id = sheet?.properties?.sheetId;
    const rowCount = sheet?.properties?.gridProperties?.rowCount;
    if (id == null || rowCount == null) throw new Error(`Faltan datos de la hoja ${title}`);

    const rows = sheet?.data?.[0]?.rowData?.map((row) => row.values ?? []) ?? [];
    const exerciseNames = rows.map((row) => [
        row[0]?.effectiveValue?.stringValue ?? row[0]?.userEnteredValue?.stringValue ?? "",
    ]);
    return { id, rowCount, rows, exerciseNames };
}

function writeCells(
    sheetId: number,
    startRowIndex: number,
    endRowIndex: number,
    startColumnIndex: number,
    endColumnIndex: number,
    rows: Cell[][] = [],
): SheetRequest {
    return {
        updateCells: {
            range: { sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex },
            rows: rows.map((values) => ({ values })),
            fields: "userEnteredValue",
        },
    };
}

function enteredValue(cell: Cell | undefined): Cell {
    return cell?.userEnteredValue ? { userEnteredValue: cell.userEnteredValue } : {};
}

function containsTraining(cell: Cell | undefined): boolean {
    const value = cell?.userEnteredValue;
    return Boolean(value?.formulaValue || value?.boolValue || value?.numberValue ||
        (value?.stringValue?.trim() && value.stringValue.trim() !== "0"));
}

function isSetInput(cell: Cell | undefined): boolean {
    const value = cell?.userEnteredValue;
    if (value?.formulaValue || value?.boolValue != null) return false;
    const text = value?.stringValue?.trim();
    return !text || /^-?\d+(?:[.,]\d+)?$/.test(text);
}

export function buildRoutineEdits(sheet: WorkoutSheet, dayId: number, exercises: RoutineExercise[]) {
    const range = findDayRange(sheet.exerciseNames, dayId);
    if (!range) return { status: 404, message: `No se encontró el DIA ${dayId} en la hoja` } as const;
    const { startRow, endRow } = range;
    if (endRow > sheet.rowCount || startRow >= endRow || exercises.length > endRow - startRow) {
        return { status: 400, message: "El día no tiene suficientes filas en la plantilla" } as const;
    }

    const originalRows = sheet.rows.slice(startRow, endRow);
    const names = sheet.exerciseNames.slice(startRow, endRow).map(([name]) => name);
    const movedRows = new Set<number>();
    const sourceRows = exercises.map(({ name }) => {
        const key = normalizeExerciseKey(name);
        const rowIndex = names.findIndex((existing, index) => !movedRows.has(index) && normalizeExerciseKey(existing) === key);
        if (rowIndex < 0) return [];
        movedRows.add(rowIndex);
        return originalRows[rowIndex] ?? [];
    });

    const orphan = originalRows.findIndex((row, index) => !movedRows.has(index) && row.slice(5, 13).some(containsTraining));
    if (orphan !== -1) {
        const name = names[orphan];
        const message = name
            ? `No se puede quitar «${name}» porque ya tiene series registradas en Semana 1.`
            : "Hay series sin ejercicio en este día. Revisá los registros en la planilla antes de editarlo.";
        return { status: 409, message } as const;
    }

    const routine = exercises.map(({ name, prescribedSeries }) => [
        { userEnteredValue: { stringValue: name } },
        { userEnteredValue: { stringValue: prescribedSeries } },
    ]);
    const notes = sourceRows.map((row) => [enteredValue(row[3])]);
    const sets = sourceRows.map((row) => Array.from({ length: 8 }, (_, index) => enteredValue(row[index + 5])));
    const requests = [
        writeCells(sheet.id, startRow, endRow, 0, 2, routine),
        writeCells(sheet.id, startRow, endRow, 3, 4, notes),
        writeCells(sheet.id, startRow, endRow, 5, 13, sets),
    ];
    return { status: 200, range: `'Semana 1'!A${startRow + 1}:B${endRow}`, requests } as const;
}

export function buildWeekClears(sheet: WorkoutSheet, sheetId: number, resetRoutine = false): SheetRequest[] {
    const requests: SheetRequest[] = [];
    for (let dayId = 1; dayId <= MAX_DAYS; dayId++) {
        const range = findDayRange(sheet.exerciseNames, dayId);
        if (!range) continue;
        const { startRow, endRow } = range;
        if (endRow > sheet.rowCount) throw new Error("El día no tiene suficientes filas en la plantilla");

        if (resetRoutine && startRow < endRow) {
            requests.push(writeCells(sheetId, startRow, endRow, 0, 2));
            requests.push(writeCells(sheetId, startRow, endRow, 3, 4));
        }

        for (let row = startRow; row < endRow; row++) {
            let startColumn: number | null = null;
            for (let column = 5; column <= 13; column++) {
                if (column < 13 && isSetInput(sheet.rows[row]?.[column])) {
                    startColumn ??= column;
                } else if (startColumn !== null) {
                    requests.push(writeCells(sheetId, row, row + 1, startColumn, column));
                    startColumn = null;
                }
            }
        }

        const ratingRow = dayId * 10 - 1;
        const ratingValue = sheet.rows[ratingRow]?.[5]?.userEnteredValue;
        if (ratingRow < sheet.rowCount && (!ratingValue || ratingValue.stringValue?.includes("★"))) {
            requests.push(writeCells(sheetId, ratingRow, ratingRow + 1, 5, 6));
        }
    }
    return requests;
}
