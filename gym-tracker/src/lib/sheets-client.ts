/**
 * Client-side functions for interacting with Google Sheets via our API routes.
 * This replaces the previous Apps Script approach with proper server-side handling.
 */

export interface SaveResult {
    ok: boolean;
    error?: string;
}

export interface WeekListItem {
    id: number;
    name: string; // "Semana X"
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
 */
export async function fetchWeeksList(): Promise<WeekListItem[]> {
    const response = await fetch("/api/sheets/weeks", { method: "GET" });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.weeks) ? (data.weeks as WeekListItem[]) : [];
}

export async function fetchWeekData(weekId: number) {
    const response = await fetch(`/api/sheets/week?weekId=${encodeURIComponent(String(weekId))}`, {
        method: "GET",
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || `Error ${response.status}`);
    }
    return (await response.json()) as { week: any };
}

export async function fetchExerciseSets(params: {
    weekId: number;
    dayId: number;
    exerciseName: string;
}) {
    const { weekId, dayId, exerciseName } = params;
    const url = `/api/sheets/exercise?weekId=${encodeURIComponent(String(weekId))}&dayId=${encodeURIComponent(String(dayId))}&exerciseName=${encodeURIComponent(exerciseName)}`;
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || `Error ${response.status}`);
    }
    return (await response.json()) as { sets: { weight: number; reps: number }[] };
}
