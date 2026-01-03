import Papa from "papaparse";
import { PersonalRecord, Week, Day, Exercise, Set } from "@/types";

const SPREADSHEET_ID = process.env.NEXT_PUBLIC_SPREADSHEET_ID || "1XMFq-Twxtoa_Fs2_6kOWjB65mMqEgzFJ8ujzyZN7iCo";

export async function fetchSheetCSV(gid: string): Promise<any[]> {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
    const response = await fetch(url);
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
            const exercise: Exercise = {
                name: row[0],
                prescribedSeries: row[1] || "",
                notes: row[3] || "",
                sets: [],
                muscleGroup: row[13] || "",
                image: exerciseMapping[row[0].toLowerCase()] || undefined,
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

                if (!isNaN(reps) || !isNaN(weight)) {
                    exercise.sets.push({
                        reps: isNaN(reps) ? null : reps,
                        weight: isNaN(weight) ? null : weight,
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
        exercise: row[0] || "",
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
            mapping[name.toLowerCase()] = image;
        }
    });
    return mapping;
}

// GIDs for sheets (these might need validation from the URL or trial)
// Typically, the first sheet is gid=0. Others need discovery.
export const SHEET_GIDS = {
    SEMANA_1: "0",
    RM: "651025325",
    FATIGA: "761571141",
    EJERCICIOS: "1847511840",
};
const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || "";

export async function saveExerciseSets(weekId: number, dayId: number, exerciseName: string, sets: { weight: number; reps: number }[]) {
    if (!APPS_SCRIPT_URL) {
        console.warn("Apps Script URL not configured. Data not saved to Sheet.");
        return;
    }

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors", // Apps Script redirects can cause CORS issues, no-cors handles the submission
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                weekId,
                dayId,
                exerciseName,
                sets,
            }),
        });
        return response;
    } catch (error) {
        console.error("Error saving to Sheets:", error);
        throw error;
    }
}
