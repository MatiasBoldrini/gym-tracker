/**
 * Client-side functions for interacting with Google Sheets via our API routes.
 * This replaces the previous Apps Script approach with proper server-side handling.
 */
import { DEMO_MODE, getDemoWeeksMap, demoPrs, getDemoExercises, getDemoSeries, cloneWeek } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/client";
import { normalizeExerciseKey } from "@/lib/normalize";
import type { Week, Set } from "@/types";

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

export async function authFetch(input: RequestInfo, init: RequestInit = {}, expectedUserId?: string) {
    const { data: { session } } = await createClient().auth.getSession();
    if (expectedUserId && session?.user.id !== expectedUserId) {
        throw createApiError({ message: "La sesión cambió. Volvé a intentar.", status: 401, code: "NO_AUTH" });
    }

    const headers = new Headers(init.headers);
    if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
    return fetch(input, { ...init, headers, cache: "no-store" });
}

type DemoState = {
    weeks: Map<number, Week>;
    onboardingProgress: OnboardingProgress | null;
    onboardingCompleted: boolean;
    onboardingDismissed: boolean;
};

const demoWeeksStorageKey = "gymtracker.demo.weeks.v1";

function loadDemoWeeks() {
    try {
        const saved = JSON.parse(window.localStorage.getItem(demoWeeksStorageKey) ?? "null");
        if (Array.isArray(saved) && saved.length && saved.every((week) => Number.isInteger(week?.id) && Array.isArray(week.days))) {
            return new Map<number, Week>(saved.map((week) => [week.id, week]));
        }
    } catch {
        // The demo still works when storage is unavailable.
    }
    return getDemoWeeksMap();
}

const demoState: DemoState | null = IS_DEMO
    ? {
        weeks: loadDemoWeeks(),
        onboardingProgress: null,
        onboardingCompleted: true,
        onboardingDismissed: false,
    }
    : null;

function persistDemoWeeks() {
    if (!demoState) return;
    try {
        window.localStorage.setItem(demoWeeksStorageKey, JSON.stringify([...demoState.weeks.values()]));
    } catch {
        // Keep the changes in memory when storage is unavailable.
    }
}

function demoWeekList(): WeekListItem[] {
    return [...(demoState?.weeks.keys() ?? [])].sort((a, b) => a - b).map((id) => ({ id, name: `Semana ${id}` }));
}

export function getDemoHomePayload() {
    const weeks = demoWeekList();
    const week = demoState?.weeks.get(weeks[0]?.id);
    return {
        week: week ? cloneWeek(week) : { id: 1, days: [] },
        weeks,
        prs: demoPrs,
        setupError: null,
    };
}

export async function saveExerciseSets(
    weekId: number,
    dayId: number,
    exerciseName: string,
    sets: Set[],
    userId?: string
): Promise<SaveResult> {
    if (IS_DEMO) {
        const week = demoState?.weeks.get(weekId);
        const day = week?.days.find((d) => d.id === dayId);
        const exercise = day?.exercises.find((e) => e.name === exerciseName);
        if (!exercise) return { ok: false, error: "No encontramos el ejercicio." };
        exercise.sets = structuredClone(sets);
        persistDemoWeeks();
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
        }, userId);

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
    } catch (error) {
        console.error("Error saving to Sheets:", error);
        return {
            ok: false,
            error: getErrorMessage(error),
        };
    }
}

export type SheetsError = Error & { status?: number; code?: string };

function createApiError({ message, status, code }: { message: string; status: number; code?: string }): SheetsError {
    return Object.assign(new Error(message), { status, code });
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Network error";
}

/**
 * Fetch list of weeks from the user's spreadsheet.
 */
export async function fetchWeeksList(userId?: string): Promise<WeekListItem[]> {
    if (IS_DEMO) {
        return demoWeekList();
    }
    const response = await authFetch("/api/sheets/weeks", { method: "GET" }, userId);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw createApiError({
            message: data?.error || `Error ${response.status}`,
            status: response.status,
            code: data?.code,
        });
    }
    return Array.isArray(data.weeks) ? (data.weeks as WeekListItem[]) : [];
}

export async function fetchWeekData(weekId: number, opts?: { cacheBust?: string | number; userId?: string }) {
    if (IS_DEMO) {
        const week = demoState?.weeks.get(weekId);
        return { week: week ? cloneWeek(week) : { id: weekId, days: [] } };
    }
    const cacheBust = opts?.cacheBust;
    const url = `/api/sheets/week?weekId=${encodeURIComponent(String(weekId))}${cacheBust !== undefined ? `&cb=${encodeURIComponent(String(cacheBust))}` : ""}`;
    const response = await authFetch(url, {
        method: "GET",
    }, opts?.userId);
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw createApiError({
            message: data?.error || `Error ${response.status}`,
            status: response.status,
            code: data?.code,
        });
    }
    return (await response.json()) as { week: Week };
}

export async function fetchExerciseSets(params: {
    weekId: number;
    dayId: number;
    userId?: string;
    exerciseName: string;
}) {
    if (IS_DEMO) {
        const week = demoState?.weeks.get(params.weekId);
        const day = week?.days.find((d) => d.id === params.dayId);
        const exercise = day?.exercises.find((e) => e.name === params.exerciseName);
        return {
            sets: exercise?.sets?.map((s) => ({ weight: s.weight ?? 0, reps: s.reps ?? 0 })) ?? [],
        };
    }
    const { weekId, dayId, exerciseName } = params;
    const url = `/api/sheets/exercise?weekId=${encodeURIComponent(String(weekId))}&dayId=${encodeURIComponent(String(dayId))}&exerciseName=${encodeURIComponent(exerciseName)}`;
    const response = await authFetch(url, { method: "GET" }, params.userId);
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw createApiError({
            message: data?.error || `Error ${response.status}`,
            status: response.status,
            code: data?.code,
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
    userId?: string;
    exerciseNames: string[];
}): Promise<BulkExerciseSetsResult[]> {
    if (IS_DEMO) {
        const week = demoState?.weeks.get(params.weekId);
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
    }, params.userId);
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw createApiError({
            message: data?.error || `Error ${response.status}`,
            status: response.status,
            code: data?.code,
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
    stars: number,
    userId?: string
): Promise<SaveResult> {
    if (IS_DEMO) {
        const week = demoState?.weeks.get(weekId);
        const day = week?.days.find((d) => d.id === dayId);
        if (!day) return { ok: false, error: "No encontramos el día." };
        day.stars = stars;
        persistDemoWeeks();
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
        }, userId);

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
    } catch (error) {
        console.error("Error saving rating to Sheets:", error);
        return {
            ok: false,
            error: getErrorMessage(error),
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
    const data = await response.json().catch(() => ({}));
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
    const data = await response.json().catch(() => ({}));
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
    const data = await response.json().catch(() => ({}));
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
        const day = demoState?.weeks.get(1)?.days.find((item) => item.id === dayId);
        return day?.exercises.map(({ name, prescribedSeries }) => ({ name, prescribedSeries })) ?? [];
    }
    const response = await authFetch(`/api/sheets/routine?dayId=${encodeURIComponent(String(dayId))}`, {
        method: "GET",
    });
    const data = await response.json().catch(() => ({}));
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
        const week = demoState?.weeks.get(1);
        if (!week) return { ok: false, error: "No encontramos la primera semana." };
        const existing = week.days.find((day) => day.id === dayId);
        const catalog = getDemoExercises();
        const nextExercises = exercises.map((exercise) => {
            const key = normalizeExerciseKey(exercise.name);
            const match = existing?.exercises.find((previous) => normalizeExerciseKey(previous.name) === key);
            const catalogMatch = catalog.find((item) => normalizeExerciseKey(item.name) === key);
            return {
                ...match,
                ...exercise,
                muscleGroup: match?.muscleGroup ?? catalogMatch?.muscle,
                image: match?.image ?? catalogMatch?.image,
                sets: match?.sets ?? [],
            };
        });
        if (existing) existing.exercises = nextExercises;
        else week.days.push({ id: dayId, name: `DIA ${dayId}`, exercises: nextExercises });
        week.days.sort((a, b) => a.id - b.id);
        persistDemoWeeks();
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
    } catch (error) {
        console.error("Error saving routine to Sheets:", error);
        return {
            ok: false,
            error: getErrorMessage(error),
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
        const week = demoState?.weeks.get(1);
        if (!week) return [];
        return week.days.map((d) => ({
            id: d.id,
            exercisesCount: d.exercises.length,
        }));
    }
    const response = await authFetch("/api/sheets/routine/days", { method: "GET" });
    const data = await response.json().catch(() => ({}));
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
        const base = demoState?.weeks.get(1);
        if (!demoState || !base) return { ok: false, error: "No encontramos la primera semana." };
        const weeksCreated: number[] = [];
        for (let id = 2; id <= weeks; id++) {
            if (demoState.weeks.has(id)) continue;
            demoState.weeks.set(id, {
                id,
                days: base.days.map(({ id: dayId, name, exercises }) => ({
                    id: dayId,
                    name,
                    exercises: exercises.map((exercise) => ({ ...exercise, sets: [] })),
                })),
            });
            weeksCreated.push(id);
        }
        persistDemoWeeks();
        return { ok: true, weeksCreated, totalWeeks: weeks };
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
    } catch (error) {
        console.error("Error creating mesociclo:", error);
        return {
            ok: false,
            error: getErrorMessage(error),
        };
    }
}

/**
 * Reset mesociclo by deleting all weeks except Semana 1.
 * Used when redoing the onboarding wizard.
 */
export async function resetMesociclo(userId?: string): Promise<SaveResult> {
    if (IS_DEMO) {
        if (demoState) {
            const base = demoState?.weeks.get(1);
            const days = base?.days.map(({ id, name }) => ({ id, name, exercises: [] })) ?? [];
            demoState.weeks = new Map<number, Week>([[1, { id: 1, days }]]);
            persistDemoWeeks();
        }
        return { ok: true };
    }
    try {
        const response = await authFetch("/api/sheets/mesociclo", {
            method: "DELETE",
        }, userId);

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
    } catch (error) {
        console.error("Error resetting mesociclo:", error);
        return {
            ok: false,
            error: getErrorMessage(error),
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
export async function setupSpreadsheet(userId?: string): Promise<SetupResult> {
    if (IS_DEMO) {
        return { ok: true, spreadsheetId: "demo-sheet", alreadyExists: true };
    }
    try {
        const response = await authFetch("/api/sheets/setup", {
            method: "POST",
        }, userId);

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
    } catch (error) {
        console.error("Error setting up spreadsheet:", error);
        return {
            ok: false,
            error: getErrorMessage(error),
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
export async function completeOnboarding(userId?: string): Promise<{ ok: boolean; error?: string }> {
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
        }, userId);
        const data = await response.json();
        if (!response.ok) {
            return { ok: false, error: data.error || `Error ${response.status}` };
        }
        return { ok: true };
    } catch (error) {
        console.error("Error completing onboarding:", error);
        return { ok: false, error: getErrorMessage(error) };
    }
}

/**
 * Mark onboarding as dismissed (persisted in Supabase)
 */
export async function dismissOnboarding(userId?: string): Promise<{ ok: boolean; error?: string }> {
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
        }, userId);
        const data = await response.json();
        if (!response.ok) {
            return { ok: false, error: data.error || `Error ${response.status}` };
        }
        return { ok: true };
    } catch (error) {
        console.error("Error dismissing onboarding:", error);
        return { ok: false, error: getErrorMessage(error) };
    }
}

/**
 * Reset onboarding state (for "redo onboarding" feature)
 */
export async function resetOnboarding(userId?: string): Promise<{ ok: boolean; error?: string }> {
    if (IS_DEMO) {
        if (demoState) {
            demoState.onboardingCompleted = false;
            demoState.onboardingDismissed = false;
            demoState.onboardingProgress = null;
        }
        return { ok: true };
    }
    try {
        const response = await authFetch("/api/user/preferences/onboarding", {
            method: "DELETE",
        }, userId);
        const data = await response.json();
        if (!response.ok) {
            return { ok: false, error: data.error || `Error ${response.status}` };
        }
        return { ok: true };
    } catch (error) {
        console.error("Error resetting onboarding:", error);
        return { ok: false, error: getErrorMessage(error) };
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
    } catch (error) {
        console.error("Error saving onboarding progress:", error);
        return { ok: false, error: getErrorMessage(error) };
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
