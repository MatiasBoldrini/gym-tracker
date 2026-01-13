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

export interface BulkExerciseSetsResult {
    exerciseName: string;
    sets: { weight: number; reps: number }[];
}

/**
 * Fetch sets for multiple exercises in a single request.
 */
export async function fetchExerciseSetsBulk(params: {
    weekId: number;
    dayId: number;
    exerciseNames: string[];
}): Promise<BulkExerciseSetsResult[]> {
    const { weekId, dayId, exerciseNames } = params;
    const response = await fetch("/api/sheets/exercises-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId, dayId, exerciseNames }),
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw createApiError({
            message: data?.error || `Error ${response.status}`,
            status: response.status,
            code: (data as any)?.code,
        });
    }
    const json = await response.json();
    return Array.isArray(json.results) ? json.results : [];
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
 * Fetch exercises and series in a single batched request.
 * More efficient for onboarding (1 API call instead of 2).
 */
export async function fetchOnboardingData(): Promise<{
    exercises: ExerciseItem[];
    series: string[];
}> {
    const response = await fetch("/api/sheets/onboarding-data", { method: "GET" });
    const data = await response.json().catch(() => ({} as any));
    if (!response.ok) {
        throw createApiError({
            message: data?.error || `Error ${response.status}`,
            status: response.status,
            code: data?.code,
        });
    }
    return {
        exercises: Array.isArray(data.exercises) ? data.exercises : [],
        series: Array.isArray(data.series) ? data.series : [],
    };
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

// ============================================================================
// Mesociclo & Days Summary API functions
// ============================================================================

export interface DaySummary {
    id: number;
    exercisesCount: number;
}

/**
 * Fetch summary of exercises count per day in Semana 1.
 * Useful for determining which days are configured vs empty.
 */
export async function fetchRoutineDaysSummary(): Promise<DaySummary[]> {
    const response = await fetch("/api/sheets/routine/days", { method: "GET" });
    const data = await response.json().catch(() => ({} as any));
    if (!response.ok) {
        throw createApiError({
            message: data?.error || `Error ${response.status}`,
            status: response.status,
            code: data?.code,
        });
    }
    return Array.isArray(data.days) ? data.days : [];
}

export interface CreateMesocicloResult {
    ok: boolean;
    weeksCreated?: number[];
    totalWeeks?: number;
    error?: string;
    code?: string;
    status?: number;
}

/**
 * Create a mesociclo by duplicating Semana 1 to Semana 2..N.
 * Cleans reps/weight/stars data from the duplicated weeks.
 */
export async function createMesociclo(weeks: number): Promise<CreateMesocicloResult> {
    try {
        const response = await fetch("/api/sheets/mesociclo", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ weeks }),
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

        return {
            ok: true,
            weeksCreated: data.weeksCreated,
            totalWeeks: data.totalWeeks,
        };
    } catch (error: any) {
        console.error("Error creating mesociclo:", error);
        return {
            ok: false,
            error: error.message || "Network error",
        };
    }
}

/**
 * Reset mesociclo by deleting all weeks except Semana 1.
 * Used when redoing the onboarding wizard.
 */
export async function resetMesociclo(): Promise<SaveResult> {
    try {
        const response = await fetch("/api/sheets/mesociclo", {
            method: "DELETE",
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
        console.error("Error resetting mesociclo:", error);
        return {
            ok: false,
            error: error.message || "Network error",
        };
    }
}

// ============================================================================
// Setup API functions
// ============================================================================

export interface SetupResult {
    ok: boolean;
    spreadsheetId?: string;
    alreadyExists?: boolean;
    error?: string;
}

/**
 * Setup user's spreadsheet (create copy from template if needed).
 * Called after auth when setup_pending=true.
 */
export async function setupSpreadsheet(): Promise<SetupResult> {
    try {
        const response = await fetch("/api/sheets/setup", {
            method: "POST",
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                ok: false,
                error: data.error || `Error ${response.status}`,
            };
        }

        return {
            ok: true,
            spreadsheetId: data.spreadsheetId,
            alreadyExists: data.alreadyExists,
        };
    } catch (error: any) {
        console.error("Error setting up spreadsheet:", error);
        return {
            ok: false,
            error: error.message || "Network error",
        };
    }
}

/**
 * Check if setup is complete (has spreadsheet).
 */
export async function checkSetupStatus(): Promise<{
    setupComplete: boolean;
    authenticated: boolean;
    spreadsheetId: string | null;
}> {
    try {
        const response = await fetch("/api/sheets/setup", { method: "GET" });
        const data = await response.json();
        return {
            setupComplete: data.setupComplete ?? false,
            authenticated: data.authenticated ?? false,
            spreadsheetId: data.spreadsheetId ?? null,
        };
    } catch {
        return { setupComplete: false, authenticated: false, spreadsheetId: null };
    }
}

// ============================================================================
// Onboarding Preferences API functions
// ============================================================================

/**
 * Mark onboarding as completed (persisted in Supabase)
 */
export async function completeOnboarding(): Promise<{ ok: boolean; error?: string }> {
    try {
        const response = await fetch("/api/user/preferences/onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "complete" }),
        });
        const data = await response.json();
        if (!response.ok) {
            return { ok: false, error: data.error || `Error ${response.status}` };
        }
        return { ok: true };
    } catch (error: any) {
        console.error("Error completing onboarding:", error);
        return { ok: false, error: error.message || "Network error" };
    }
}

/**
 * Mark onboarding as dismissed (persisted in Supabase)
 */
export async function dismissOnboarding(): Promise<{ ok: boolean; error?: string }> {
    try {
        const response = await fetch("/api/user/preferences/onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "dismiss" }),
        });
        const data = await response.json();
        if (!response.ok) {
            return { ok: false, error: data.error || `Error ${response.status}` };
        }
        return { ok: true };
    } catch (error: any) {
        console.error("Error dismissing onboarding:", error);
        return { ok: false, error: error.message || "Network error" };
    }
}

/**
 * Reset onboarding state (for "redo onboarding" feature)
 */
export async function resetOnboarding(): Promise<{ ok: boolean; error?: string }> {
    try {
        const response = await fetch("/api/user/preferences/onboarding", {
            method: "DELETE",
        });
        const data = await response.json();
        if (!response.ok) {
            return { ok: false, error: data.error || `Error ${response.status}` };
        }
        return { ok: true };
    } catch (error: any) {
        console.error("Error resetting onboarding:", error);
        return { ok: false, error: error.message || "Network error" };
    }
}
