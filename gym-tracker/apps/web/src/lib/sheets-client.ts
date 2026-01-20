/**
 * Client-side functions for interacting with Google Sheets via our API routes.
 * This replaces the previous Apps Script approach with proper server-side handling.
 */
import { DEMO_MODE, demoWeeksList, getDemoWeeksMap, demoPrs, getDemoExercises, getDemoSeries, getDemoRoutineDay, getDemoRoutineSummary } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/client";
import { clearRuntimeDataCaches } from "@/lib/pwa";
import type { Week, PersonalRecord } from "@/types";

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

const IS_DEMO = DEMO_MODE;

async function authFetch(input: RequestInfo, init: RequestInit = {}) {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    const headers = {
        ...(init.headers || {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    };

    // Importante: el Service Worker cachea por URL (no por Authorization). Si quedó un 401 cacheado,
    // limpiamos caches de datos y reintentamos una sola vez.
    const res = await fetch(input, { ...init, headers });
    if (res.status === 401) {
        try {
            await clearRuntimeDataCaches();
        } catch {
            // best-effort
        }
        return fetch(input, { ...init, headers });
    }
    return res;
}

type DemoState = {
    weeks: Map<number, Week>;
    prs: PersonalRecord[];
    onboardingProgress: OnboardingProgress | null;
    onboardingCompleted: boolean;
    onboardingDismissed: boolean;
};

const demoState: DemoState | null = IS_DEMO
    ? {
        weeks: getDemoWeeksMap(),
        prs: demoPrs,
        onboardingProgress: null,
        onboardingCompleted: true,
        onboardingDismissed: false,
    }
    : null;

function cloneWeek(week: Week): Week {
    return structuredClone(week);
}

function ensureDemoWeek(weekId: number): Week | null {
    if (!demoState) return null;
    const existing = demoState.weeks.get(weekId);
    if (existing) return existing;
    const fallback = demoState.weeks.get(1);
    const next = fallback ? cloneWeek({ ...fallback, id: weekId }) : { id: weekId, days: [] };
    demoState.weeks.set(weekId, next);
    return next;
}

export async function saveExerciseSets(
    weekId: number,
    dayId: number,
    exerciseName: string,
    sets: { weight: number; reps: number }[]
): Promise<SaveResult> {
    if (IS_DEMO) {
        const week = ensureDemoWeek(weekId);
        if (!week) return { ok: true };
        const day = week.days.find((d) => d.id === dayId);
        if (!day) return { ok: true };
        const exercise = day.exercises.find((e) => e.name === exerciseName);
        if (exercise) {
            exercise.sets = sets.map((s) => ({ reps: s.reps, weight: s.weight }));
        }
        return { ok: true };
    }
    try {
        const response = await authFetch("/api/sheets/save", {
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
    if (IS_DEMO) {
        return demoWeeksList;
    }
    const response = await authFetch("/api/sheets/weeks", { method: "GET" });
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
    if (IS_DEMO) {
        const week = ensureDemoWeek(weekId);
        return { week: week ? cloneWeek(week) : { id: weekId, days: [] } };
    }
    const response = await authFetch(`/api/sheets/week?weekId=${encodeURIComponent(String(weekId))}`, {
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
    if (IS_DEMO) {
        const week = ensureDemoWeek(params.weekId);
        const day = week?.days.find((d) => d.id === params.dayId);
        const exercise = day?.exercises.find((e) => e.name === params.exerciseName);
        return {
            sets: exercise?.sets?.map((s) => ({ weight: s.weight ?? 0, reps: s.reps ?? 0 })) ?? [],
        };
    }
    const { weekId, dayId, exerciseName } = params;
    const url = `/api/sheets/exercise?weekId=${encodeURIComponent(String(weekId))}&dayId=${encodeURIComponent(String(dayId))}&exerciseName=${encodeURIComponent(exerciseName)}`;
    const response = await authFetch(url, { method: "GET" });
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
    if (IS_DEMO) {
        const week = ensureDemoWeek(params.weekId);
        const day = week?.days.find((d) => d.id === params.dayId);
        return (params.exerciseNames || []).map((name) => {
            const exercise = day?.exercises.find((e) => e.name === name);
            return {
                exerciseName: name,
                sets: exercise?.sets?.map((s) => ({ weight: s.weight ?? 0, reps: s.reps ?? 0 })) ?? [],
            };
        });
    }
    const { weekId, dayId, exerciseNames } = params;
    const response = await authFetch("/api/sheets/exercises-bulk", {
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
    if (IS_DEMO) {
        const week = ensureDemoWeek(weekId);
        const day = week?.days.find((d) => d.id === dayId);
        if (day) {
            day.stars = stars;
        }
        return { ok: true };
    }
    try {
        const response = await authFetch("/api/sheets/rating", {
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
    if (IS_DEMO) {
        return getDemoExercises();
    }
    const response = await authFetch("/api/sheets/exercises", { method: "GET" });
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
    if (IS_DEMO) {
        return getDemoSeries();
    }
    const response = await authFetch("/api/sheets/series", { method: "GET" });
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
    if (IS_DEMO) {
        return {
            exercises: getDemoExercises(),
            series: getDemoSeries(),
        };
    }
    const response = await authFetch("/api/sheets/onboarding-data", { method: "GET" });
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
    if (IS_DEMO) {
        return getDemoRoutineDay(dayId).map((e) => ({ ...e }));
    }
    const response = await authFetch(`/api/sheets/routine?dayId=${encodeURIComponent(String(dayId))}`, {
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
    if (IS_DEMO) {
        const week = ensureDemoWeek(1);
        if (week) {
            const dayIndex = week.days.findIndex((d) => d.id === dayId);
            if (dayIndex >= 0) {
                const setsTemplate = (week.days[dayIndex].exercises || []).map((e) => e.sets || []);
                week.days[dayIndex].exercises = exercises.map((e, idx) => ({
                    ...e,
                    sets: setsTemplate[idx] || [],
                }));
            }
        }
        return { ok: true };
    }
    try {
        const response = await authFetch("/api/sheets/routine", {
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
    if (IS_DEMO) {
        const week = ensureDemoWeek(1);
        if (!week) return getDemoRoutineSummary();
        return week.days.map((d) => ({
            id: d.id,
            exercisesCount: d.exercises.length,
        }));
    }
    const response = await authFetch("/api/sheets/routine/days", { method: "GET" });
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
    if (IS_DEMO) {
        const created: number[] = [];
        for (let i = 2; i <= weeks; i++) {
            const base = ensureDemoWeek(1);
            if (base) {
                const clone = cloneWeek({ ...base, id: i });
                demoState?.weeks.set(i, clone);
                created.push(i);
            }
        }
        return { ok: true, weeksCreated: created, totalWeeks: Math.max(weeks, 1) };
    }
    try {
        const response = await authFetch("/api/sheets/mesociclo", {
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
    if (IS_DEMO) {
        if (demoState) {
            const base = ensureDemoWeek(1);
            demoState.weeks = new Map<number, Week>([[1, base ? cloneWeek({ ...base, id: 1 }) : { id: 1, days: [] }]]);
        }
        return { ok: true };
    }
    try {
        const response = await authFetch("/api/sheets/mesociclo", {
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
    code?: string;
    status?: number;
}

/**
 * Setup user's spreadsheet (create copy from template if needed).
 * Called after auth when setup_pending=true.
 */
export async function setupSpreadsheet(): Promise<SetupResult> {
    if (IS_DEMO) {
        return { ok: true, spreadsheetId: "demo-sheet", alreadyExists: true };
    }
    try {
        const response = await authFetch("/api/sheets/setup", {
            method: "POST",
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
    if (IS_DEMO) {
        return { setupComplete: true, authenticated: true, spreadsheetId: "demo-sheet" };
    }
    try {
        const response = await authFetch("/api/sheets/setup", { method: "GET" });
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
    if (IS_DEMO) {
        if (demoState) {
            demoState.onboardingCompleted = true;
            demoState.onboardingDismissed = false;
        }
        return { ok: true };
    }
    try {
        const response = await authFetch("/api/user/preferences/onboarding", {
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
    if (IS_DEMO) {
        if (demoState) {
            demoState.onboardingCompleted = false;
            demoState.onboardingDismissed = true;
        }
        return { ok: true };
    }
    try {
        const response = await authFetch("/api/user/preferences/onboarding", {
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
    if (IS_DEMO) {
        if (demoState) {
            demoState.onboardingCompleted = false;
            demoState.onboardingDismissed = false;
        }
        return { ok: true };
    }
    try {
        const response = await authFetch("/api/user/preferences/onboarding", {
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

// ============================================================================
// Onboarding progress persistence
// ============================================================================

export interface OnboardingProgress {
    totalDays?: number;
    currentDayIndex?: number;
    step?: string;
}

export async function saveOnboardingProgress(progress: OnboardingProgress): Promise<{ ok: boolean; error?: string }> {
    if (IS_DEMO) {
        if (demoState) {
            demoState.onboardingProgress = progress;
        }
        return { ok: true };
    }
    try {
        const response = await authFetch("/api/user/preferences/onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "progress", progress }),
        });
        const data = await response.json();
        if (!response.ok) {
            return { ok: false, error: data.error || `Error ${response.status}` };
        }
        return { ok: true };
    } catch (error: any) {
        console.error("Error saving onboarding progress:", error);
        return { ok: false, error: error.message || "Network error" };
    }
}

export async function loadOnboardingProgress(): Promise<OnboardingProgress | null> {
    if (IS_DEMO) {
        return demoState?.onboardingProgress ?? null;
    }
    try {
        const response = await authFetch("/api/user/preferences/onboarding", { method: "GET" });
        const data = await response.json();
        if (!response.ok) {
            return null;
        }
        return data.onboarding_progress ?? null;
    } catch (error) {
        console.error("Error loading onboarding progress:", error);
        return null;
    }
}
