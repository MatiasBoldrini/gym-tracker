import Papa from "papaparse";
import { PersonalRecord, Week, Day, Exercise, Set } from "@/types";
import { normalizeExerciseKey } from "@/lib/normalize";

/**
 * OJO: Export CSV por gid es frágil (el gid cambia por copia) y no sirve para modo multi-usuario.
 * Se mantiene solo para debug/demo. El modo real usa Sheets API con OAuth.
 */
export async function fetchSheetCSV(params: {
    spreadsheetId: string;
    gid: string;
    fetchOptions?: RequestInit;
}): Promise<any[]> {
    const { spreadsheetId, gid, fetchOptions } = params;
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
        throw new Error(`Failed to fetch sheet (GID: ${gid}): ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();

    return new Promise((resolve, reject) => {
        Papa.parse(csvText, {
            header: false,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data as any[][]),
            error: (error: any) => reject(error),
        });
    });
}

// Helper to parse "Semana X" sheets
export function parseWeekData(data: any[][], weekId: number, exerciseMapping: Record<string, string> = {}): Week {
    const days: Day[] = [];
    let currentDay: Day | null = null;

    data.forEach((row, index) => {
        const firstCol = row[0]?.toString().toUpperCase() || "";

        if (firstCol.startsWith("DIA ")) {
            if (currentDay) days.push(currentDay);
            currentDay = {
                id: parseInt(firstCol.replace("DIA ", "")),
                name: firstCol,
                exercises: [],
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

        // Check for stars at the end of the day or intensity
        if (currentDay && row[5]?.toString().includes("★")) {
            const starsText = row[5].toString();
            currentDay.stars = (starsText.match(/★/g) || []).length;
        }
    });

    if (currentDay) days.push(currentDay);

    return { id: weekId, days };
}

export function parsePRData(data: any[][]): PersonalRecord[] {
    // Assuming RM sheet has headers in the first row
    // Col A: Exercise, B: Weight PR, C: Reps, D: Date, E: 1RM Estimado
    return data.slice(1).map(row => ({
        exercise: String(row[0] ?? "").trim(),
        weight: parseFloat(row[1]) || 0,
        reps: parseFloat(row[2]) || 0,
        date: row[3] || "",
        estimated1RM: parseFloat(row[4]) || 0,
    })).filter(pr => pr.exercise);
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

// Nota: exportar CSV por `gid` sirve solo para debug/demo.
// No lo uses como “DB” en producción porque el `gid` cambia al copiar la plantilla.
// En modo real se usan nombres de pestañas + Google Sheets API (OAuth).
