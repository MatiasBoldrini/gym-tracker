/**
 * Client-side functions for interacting with Google Sheets via our API routes.
 * This replaces the previous Apps Script approach with proper server-side handling.
 */

export interface SaveResult {
    ok: boolean;
    error?: string;
}

export async function saveExerciseSets(
    weekId: number,
    dayId: number,
    exerciseName: string,
    sets: { weight: number; reps: number }[]
): Promise<SaveResult> {
    try {
        const response = await fetch("/api/sheets/save", {
            method: "POST",
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

        const data = await response.json();

        if (!response.ok) {
            return {
                ok: false,
                error: data.error || `Error ${response.status}`,
            };
        }

        return { ok: true };
    } catch (error: any) {
        console.error("Error saving to Sheets:", error);
        return {
            ok: false,
            error: error.message || "Network error",
        };
    }
}

/**
 * Fetch list of weeks from the user's spreadsheet.
 * This would need a corresponding API endpoint if you want dynamic week discovery.
 * For now, returns a static list based on common conventions.
 */
export async function fetchWeeksList(): Promise<{ name: string; id: string }[]> {
    // TODO: Implement dynamic week discovery via API if needed
    // For now, return a static list
    return [
        { name: "Semana 1", id: "1" },
        { name: "Semana 2", id: "2" },
        { name: "Semana 3", id: "3" },
        { name: "Semana 4", id: "4" },
    ];
}
