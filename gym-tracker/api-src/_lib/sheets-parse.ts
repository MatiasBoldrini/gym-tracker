import type { PersonalRecord, Week, Day } from "./types";
import { normalizeExerciseKey } from "./normalize";
import { findDayRange, readDayId } from "./google/workout-sheet";
import { parseRowSets } from "./set-values";

/**
 * Helpers de parseo para datos leídos desde Google Sheets (Sheets API).
 * Nota: no incluye export/import por CSV (eso se eliminó a propósito).
 */

/**
 * Parse stars from a rating string (e.g., "★★☆" -> 2)
 */
function parseStarsFromString(starsText: string): number {
    return (starsText.match(/★/g) || []).length;
}

// Helper to parse "Semana X" sheets
export function parseWeekData(data: any[][], weekId: number, exerciseMapping: Record<string, string> = {}): Week {
    const days: Day[] = [];
    for (const row of data) {
        const dayId = readDayId(row[0]);
        if (dayId === null || days.some((day) => day.id === dayId)) continue;
        const range = findDayRange(data, dayId)!;
        const rating = data[dayId * 10 - 1]?.[5];
        const exercises = data.slice(range.startRow, range.endRow).flatMap((exerciseRow) => {
            const name = String(exerciseRow[0] ?? "").trim();
            if (!name || name.toLowerCase() === "ejercicio") return [];

            const sets = parseRowSets(exerciseRow);
            while (sets.length > 0 && sets.at(-1)?.reps === null) sets.pop();
            return [{
                name,
                prescribedSeries: String(exerciseRow[1] ?? ""),
                notes: String(exerciseRow[3] ?? ""),
                muscleGroup: String(exerciseRow[13] ?? ""),
                image: exerciseMapping[normalizeExerciseKey(name)] || undefined,
                sets,
            }];
        });
        days.push({
            id: dayId,
            name: String(row[0]).trim().toUpperCase(),
            stars: typeof rating === "string" && rating.includes("★") ? parseStarsFromString(rating) : undefined,
            exercises,
        });
    }
    return { id: weekId, days };
}

export function parsePRData(data: any[][]): PersonalRecord[] {
    // Assuming RM sheet has headers in the first row
    // Col A: Exercise, B: Weight PR, C: Reps, D: Date, E: 1RM Estimado
    return data
        .slice(1)
        .map((row) => ({
            exercise: String(row[0] ?? "").trim(),
            weight: parseFloat(row[1]) || 0,
            reps: parseFloat(row[2]) || 0,
            date: formatRecordDate(row[3]),
            estimated1RM: parseFloat(row[4]) || 0,
        }))
        .filter((pr) => pr.exercise);
}

const recordDateFormatter = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
});

function formatRecordDate(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value !== "number" || value <= 0) return "";
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return Number.isNaN(date.getTime()) ? "" : recordDateFormatter.format(date);
}

export function parseExerciseMapping(data: any[][]): Record<string, string> {
    const mapping: Record<string, string> = {};
    // Skip header row if it exists, but let's be safe and check if row[0] is "Ejercicio"
    data.forEach((row, idx) => {
        if (idx === 0 && row[0]?.toString().toLowerCase().includes("ejercicio")) return;
        const name = row[0]?.toString().trim();
        const image = row[3]?.toString().trim(); // Column D is index 3
        if (name && image) {
            mapping[normalizeExerciseKey(name)] = image;
        }
    });
    return mapping;
}



