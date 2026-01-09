/**
 * Client-side functions for interacting with Google Sheets via our API routes.
 * This replaces the previous Apps Script approach with proper server-side handling.
 */

export interface SaveResult {
    ok: boolean;
    error?: string;
    code?: string;
    status?: number;
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
                code: data.code,
                status: response.status,
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

function createApiError(params: { message: string; status: number; code?: string }) {
    const err = new Error(params.message);
    (err as any).status = params.status;
    (err as any).code = params.code;
    return err;
}

/**
 * Fetch list of weeks from the user's spreadsheet.
 */
export async function fetchWeeksList(): Promise<WeekListItem[]> {
    const response = await fetch("/api/sheets/weeks", { method: "GET" });
    const data = await response.json().catch(() => ({} as any));
    if (!response.ok) {
        throw createApiError({
            message: data?.error || `Error ${response.status}`,
            status: response.status,
            code: data?.code,
        });
    }
    return Array.isArray(data.weeks) ? (data.weeks as WeekListItem[]) : [];
}

export async function fetchWeekData(weekId: number) {
    const response = await fetch(`/api/sheets/week?weekId=${encodeURIComponent(String(weekId))}`, {
        method: "GET",
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw createApiError({
            message: data?.error || `Error ${response.status}`,
            status: response.status,
            code: (data as any)?.code,
        });
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
        throw createApiError({
            message: data?.error || `Error ${response.status}`,
            status: response.status,
            code: (data as any)?.code,
        });
    }
    return (await response.json()) as { sets: { weight: number; reps: number }[] };
}

/**
 * Save session rating (stars) for a specific day.
 * @param weekId - The week number (e.g., 1 for "Semana 1")
 * @param dayId - The day number (1-5)
 * @param stars - The rating (1, 2, or 3)
 */
export async function saveSessionRating(
    weekId: number,
    dayId: number,
    stars: number
): Promise<SaveResult> {
    try {
        const response = await fetch("/api/sheets/rating", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                weekId,
                dayId,
                stars,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                ok: false,
                error: data.error || `Error ${response.status}`,
                code: data.code,
                status: response.status,
            };
        }

        return { ok: true };
    } catch (error: any) {
        console.error("Error saving rating to Sheets:", error);
        return {
            ok: false,
            error: error.message || "Network error",
        };
    }
}

// ============================================================================
// Routine Editor API functions
// ============================================================================

export interface ExerciseItem {
    name: string;
    muscle: string;
    categories: string;
    image: string;
}

export interface RoutineExercise {
    name: string;
    prescribedSeries: string;
}

/**
 * Fetch available exercises from the Ejercicios sheet.
 */
export async function fetchExercisesList(): Promise<ExerciseItem[]> {
    const response = await fetch("/api/sheets/exercises", { method: "GET" });
    const data = await response.json().catch(() => ({} as any));
    if (!response.ok) {
        throw createApiError({
            message: data?.error || `Error ${response.status}`,
            status: response.status,
            code: data?.code,
        });
    }
    return Array.isArray(data.exercises) ? data.exercises : [];
}

/**
 * Fetch available series options from the Series sheet.
 */
export async function fetchSeriesOptions(): Promise<string[]> {
    const response = await fetch("/api/sheets/series", { method: "GET" });
    const data = await response.json().catch(() => ({} as any));
    if (!response.ok) {
        throw createApiError({
            message: data?.error || `Error ${response.status}`,
            status: response.status,
            code: data?.code,
        });
    }
    return Array.isArray(data.series) ? data.series : [];
}

/**
 * Fetch current routine exercises for a specific day.
 */
export async function fetchDayRoutine(dayId: number): Promise<RoutineExercise[]> {
    const response = await fetch(`/api/sheets/routine?dayId=${encodeURIComponent(String(dayId))}`, {
        method: "GET",
    });
    const data = await response.json().catch(() => ({} as any));
    if (!response.ok) {
        throw createApiError({
            message: data?.error || `Error ${response.status}`,
            status: response.status,
            code: data?.code,
        });
    }
    return Array.isArray(data.exercises) ? data.exercises : [];
}

/**
 * Save routine exercises for a specific day in Semana 1.
 */
export async function saveRoutine(
    dayId: number,
    exercises: RoutineExercise[]
): Promise<SaveResult> {
    try {
        const response = await fetch("/api/sheets/routine", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                dayId,
                exercises,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                ok: false,
                error: data.error || `Error ${response.status}`,
                code: data.code,
                status: response.status,
            };
        }

        return { ok: true };
    } catch (error: any) {
        console.error("Error saving routine to Sheets:", error);
        return {
            ok: false,
            error: error.message || "Network error",
        };
    }
}
