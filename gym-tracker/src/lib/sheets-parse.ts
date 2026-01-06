import { PersonalRecord, Week, Day, Exercise } from "@/types";
import { normalizeExerciseKey } from "@/lib/normalize";

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
    let currentDay: Day | null = null;

    // Pre-parse session ratings from rows F10, F20, F30, F40, F50
    // Row index is 0-based, so F10 is data[9], F20 is data[19], etc.
    const ratingsByDayId: Record<number, number> = {};
    for (let dayId = 1; dayId <= 5; dayId++) {
        const ratingRowIndex = dayId * 10 - 1; // 0-based: day 1 -> row 9, day 2 -> row 19, etc.
        if (data[ratingRowIndex]) {
            const ratingValue = data[ratingRowIndex][5]; // Column F is index 5
            if (ratingValue && typeof ratingValue === "string" && ratingValue.includes("★")) {
                ratingsByDayId[dayId] = parseStarsFromString(ratingValue);
            }
        }
    }

    data.forEach((row) => {
        const firstCol = row[0]?.toString().toUpperCase() || "";

        if (firstCol.startsWith("DIA ")) {
            if (currentDay) days.push(currentDay);
            const dayId = parseInt(firstCol.replace("DIA ", ""));
            currentDay = {
                id: dayId,
                name: firstCol,
                exercises: [],
                // Assign pre-parsed rating if exists
                stars: ratingsByDayId[dayId],
            };
        } else if (currentDay && row[0] && row[0] !== "Ejercicio" && row[0] !== "DIA") {
            const rawName = String(row[0] ?? "");
            const trimmedName = rawName.trim();
            const exercise: Exercise = {
                // Evitar que espacios al final/incipientes rompan matching (PR / Sheets read/save).
                name: trimmedName,
                prescribedSeries: row[1] || "",
                notes: row[3] || "",
                sets: [],
                muscleGroup: row[13] || "",
                image: exerciseMapping[normalizeExerciseKey(trimmedName)] || undefined,
            };

            // Extract up to 4 sets (Columns F, G, H, I, J, K, L, M)
            // F: Reps 1, G: Weight 1
            // H: Reps 2, I: Weight 2
            // J: Reps 3, K: Weight 3
            // L: Reps 4, M: Weight 4
            for (let i = 0; i < 4; i++) {
                const repCol = 5 + i * 2; // F is index 5
                const weightCol = 6 + i * 2; // G is index 6
                const reps = parseFloat(row[repCol]);
                const weight = parseFloat(row[weightCol]);

                // Solo consideramos "set" si hay reps y peso numéricos.
                // Importante: no limitamos reps a 30 porque hay ejercicios con rangos más altos.
                // Igual mantenemos límites razonables para evitar ruido de plantilla/formulas.
                // Nota: reps=0 lo tratamos como "vacío" (evita falsos positivos/plantillas).
                const repsOk = Number.isFinite(reps) && reps > 0 && reps <= 500;
                const weightOk = Number.isFinite(weight) && weight >= 0 && weight <= 500;
                if (repsOk && weightOk) {
                    exercise.sets.push({
                        reps,
                        weight,
                    });
                }
            }

            currentDay.exercises.push(exercise);
        }
    });

    if (currentDay) days.push(currentDay);

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
            date: row[3] || "",
            estimated1RM: parseFloat(row[4]) || 0,
        }))
        .filter((pr) => pr.exercise);
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


