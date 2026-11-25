"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { type SheetsError, saveExerciseSets, fetchExerciseSets, fetchExerciseSetsBulk, fetchWeekData, fetchWeeksList, saveSessionRating, setupSpreadsheet, completeOnboarding, dismissOnboarding } from "@/lib/sheets-client";
import type { Week, PersonalRecord, Set } from "@/types";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { ExerciseList } from "@/components/ui/ExerciseList";
import { ClassicExerciseEditor, type ClassicExerciseTarget } from "@/components/screens/ClassicExerciseEditor";
import { DaySelector } from "@/components/ui/DaySelector";
import { SessionRatingModal } from "@/components/ui/SessionRatingModal";
import { useAuth } from "@/lib/hooks/useAuth";
import { EyeOff, Loader2 } from "lucide-react";
import { OnboardingWizard } from "@/components/screens/OnboardingWizard";
import { normalizeExerciseKey } from "@/lib/normalize";
import { accountScope, readAccountStorage, writeAccountStorage } from "@/lib/account-storage";
import { useLocation } from "react-router-dom";

type WeekListItem = { id: number; name: string };

type HomeScreenProps = {
    initialWeek: Week;
    initialWeeks: WeekListItem[];
    initialPrs: PersonalRecord[];
    initialLoaded: boolean;
    initialSetupError?: { message: string; code?: string } | null;
};

function validSet(set: Set): boolean {
    return set.reps !== null && Number.isInteger(set.reps) && set.reps > 0 && set.reps <= 500 &&
        set.weight !== null && Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 500;
}

function recordedSets(sets: Set[]): Set[] {
    const slots = sets.map((set) => validSet(set) ? { weight: set.weight, reps: set.reps } : { weight: null, reps: null });
    while (slots.length && !validSet(slots[slots.length - 1])) slots.pop();
    return slots;
}

function updateDay(week: Week, dayId: number, update: (day: Week["days"][number]) => Week["days"][number]): Week {
    return { ...week, days: week.days.map((day) => day.id === dayId ? update(day) : day) };
}

function saveKey(weekId: number, dayId: number, name: string) {
    return JSON.stringify([weekId, dayId, name]);
}

export function HomeScreen({ initialWeek, initialWeeks, initialPrs, initialSetupError, initialLoaded }: HomeScreenProps) {
    const [loadedWeek, setWeek] = useState<Week | null>(null);
    const [requestedWeekId, setRequestedWeekId] = useState<number | null>(null);
    const selectedWeekId = requestedWeekId ?? initialWeek.id;
    const week = useMemo(() => {
        if (loadedWeek?.id === selectedWeekId) return loadedWeek;
        if (requestedWeekId === null) return initialWeek;
        return { id: selectedWeekId, days: [] };
    }, [initialWeek, loadedWeek, requestedWeekId, selectedWeekId]);
    const [currentDayIndex, setCurrentDayIndex] = useState(0);
    const [activeEditor, setActiveEditor] = useState<{ id: string; requestId: number } | null>(null);

    const [showWeekPicker, setShowWeekPicker] = useState(false);
    const [refreshedWeeks, setWeeks] = useState<WeekListItem[] | null>(null);
    const weeks = refreshedWeeks ?? initialWeeks;
    const selectedWeekName = weeks.find((item) => item.id === selectedWeekId)?.name ?? `Semana ${selectedWeekId}`;

    // Auth state
    const auth = useAuth();
    const userId = auth.userId ?? undefined;
    const onboardingScope = userId ? accountScope(userId) : null;
    const [localError, setErrorMessage] = useState<string | null>(null);
    const errorMessage = localError ?? initialSetupError?.message ?? null;
    const { refresh: refreshAuth } = auth;
    const location = useLocation();
    const isLoadingWeek = !errorMessage && (requestedWeekId === null
        ? auth.hasSpreadsheet && !initialLoaded
        : loadedWeek?.id !== selectedWeekId);


    // Info popover (rutina + progreso)
    const [showInfoPopover, setShowInfoPopover] = useState(false);
    const [isRefreshingInfo, setIsRefreshingInfo] = useState(false);
    const infoPopoverRef = useRef<HTMLDivElement>(null);

    // Ocultar ejercicios completados + toast
    const [hideCompleted, setHideCompleted] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Session rating modal
    const [showRatingModal, setShowRatingModal] = useState(false);

    const hasLoadedWeekData = initialLoaded || loadedWeek !== null;
    const exerciseRequestId = useRef(0);
    const weekSelectionVersion = useRef(0);
    const daySelectionVersion = useRef(0);
    const writeVersion = useRef(0);
    const pendingExerciseSaves = useRef(new Map<string, Promise<void>>());

    // Onboarding wizard for new users or empty routines
    const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
    const [onboardingStartMode, setOnboardingStartMode] = useState<"auto" | "resume" | "force">("auto");

    // Async setup state (runs in background while user does onboarding)
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [setupComplete, setSetupComplete] = useState(false);
    const [setupError, setSetupError] = useState<string | null>(null);
    const setupStartedRef = useRef(false);

    // Check if routine is empty (all days have no exercises)
    const isRoutineEmpty = useMemo(() => {
        const firstWeek = loadedWeek?.id === initialWeek.id ? loadedWeek : initialWeek;
        return firstWeek.days.every((day) => day.exercises.length === 0);
    }, [initialWeek, loadedWeek]);

    // Run setup in background (called once when setup_pending detected)
    const runSetupInBackground = useCallback(async () => {
        if (!userId || setupStartedRef.current) return;
        setupStartedRef.current = true;

        setIsSettingUp(true);
        setSetupError(null);

        try {
            const result = await setupSpreadsheet(userId);
            if (result.ok) {
                setSetupComplete(true);
                // Refresh auth state to get new spreadsheet info
                refreshAuth();
            } else {
                console.error("Setup spreadsheet failed:", result);
                setSetupError(result.error || "Error al crear la planilla");
            }
        } catch (error) {
            setSetupError(error instanceof Error ? error.message : "Error al crear la planilla");
        } finally {
            setIsSettingUp(false);
        }
    }, [refreshAuth, userId]);

    // Check for new user flag in URL or empty routine
    useEffect(() => {
        if (typeof window === "undefined") return;

        // Importante: reaccionar a cambios del querystring (por ejemplo navigate("/?force_onboarding=true"))
        // porque en SPA el componente puede NO remount-ear.
        const urlParams = new URLSearchParams(location.search);
        const forceOnboarding = urlParams.get("force_onboarding") === "true";
        const setupPending = urlParams.get("setup_pending") === "true";
        const isNewUser = urlParams.get("is_new_user") === "true";
        const authError = urlParams.get("auth_error");

        // Manejar errores de autenticación
        if (authError) {
            let errorMsg = "Hubo un error al conectar tu cuenta. Intentá de nuevo.";
            if (authError === "callback_failed") {
                errorMsg = "No pudimos guardar tu conexión con Google. Cerrá sesión e intentá de nuevo.";
            } else if (authError === "no_refresh_token") {
                errorMsg = "Google no devolvió los permisos necesarios. Cerrá sesión e intentá de nuevo, asegurate de aceptar todos los permisos.";
            }
            setErrorMessage(errorMsg);
        }

        // IMPORTANTE: No tomar decisiones de onboarding mientras auth está cargando.
        // Si no esperamos, usamos los valores default (hasCompleted: false) y abrimos
        // el wizard incorrectamente en dispositivos nuevos.
        if (auth.isLoading) {
            return;
        }

        // Clean URL params (auth_success, setup_pending, is_new_user, auth_error) without reloading
        if (urlParams.has("auth_success") || urlParams.has("setup_pending") || urlParams.has("is_new_user") || urlParams.has("force_onboarding") || urlParams.has("auth_error")) {
            const newUrl = location.pathname;
            window.history.replaceState({}, "", newUrl);
        }

        // Start background setup if pending (new user without spreadsheet)
        if (setupPending || isNewUser) {
            runSetupInBackground();
        }

        // Force onboarding if explicitly requested (from redo)
        if (forceOnboarding) {
            setOnboardingStartMode("force");
            setShowOnboardingWizard(true);
            return;
        }

        // Priority 1: Check server-side onboarding state (most reliable)
        if (auth.onboarding.hasCompleted || auth.onboarding.hasDismissed) {
            return;
        }
        // Si hay progreso guardado, no abrir automáticamente: se mostrará CTA
        if (auth.onboarding.hasProgress) {
            return;
        }

        // Priority 2: Fallback to localStorage (for compat / offline)
        const hasCompletedOnboarding = readAccountStorage<boolean>(onboardingScope, "onboardingCompleted") === true;
        const hasDismissedOnboarding = readAccountStorage<boolean>(onboardingScope, "onboardingDismissed") === true;
        if (hasCompletedOnboarding || hasDismissedOnboarding) return;

        // Priority 3: Si el usuario tiene spreadsheet, esperar a que cargue la data de la semana
        // antes de decidir si la rutina está vacía. Esto evita falsos positivos mientras
        // se carga la data en un nuevo dispositivo.
        if (auth.hasSpreadsheet && !hasLoadedWeekData) {
            // Aún no cargó la data de la semana, esperar antes de tomar decisiones.
            return;
        }

        // Priority 4: Heurística para usuarios "legacy" que completaron onboarding antes
        // de que existiera user_preferences: si tienen spreadsheet Y rutina con ejercicios,
        // asumimos que ya no necesitan onboarding (en nuevo dispositivo, no tienen localStorage).
        if (auth.hasSpreadsheet && !isRoutineEmpty) {
            // Usuario legacy con rutina configurada - no mostrar onboarding.
            // Opcionalmente podríamos persistir esto al server para que no vuelva a evaluarse.
            return;
        }

        // Priority 5: Show wizard if new user OR routine is empty
        // Solo considerar isRoutineEmpty si ya tenemos el spreadsheet configurado Y la data cargó,
        // de lo contrario la rutina aparece "vacía" porque aún no cargó la data.
        const shouldConsiderEmptyRoutine = auth.hasSpreadsheet && hasLoadedWeekData && isRoutineEmpty;
        const isMissingSpreadsheet = auth.isAuthenticated && !auth.hasSpreadsheet;
        if (isNewUser || isMissingSpreadsheet || shouldConsiderEmptyRoutine) {
            setOnboardingStartMode("auto");
            setShowOnboardingWizard(true);
        }
    }, [location.search, location.pathname, isRoutineEmpty, hasLoadedWeekData, runSetupInBackground, auth.isLoading, auth.hasSpreadsheet, auth.onboarding.hasCompleted, auth.onboarding.hasDismissed, auth.onboarding.hasProgress, auth.isAuthenticated, onboardingScope]);

    // Retry onboarding sync if we ever completed/dismissed offline or if the server write failed.
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (auth.isLoading) return;
        if (!auth.isAuthenticated) return;

        const pending = readAccountStorage<string>(onboardingScope, "onboardingSyncAction");
        if (!pending) return;

        let cancelled = false;

        const run = async () => {
            try {
                const res =
                    pending === "complete"
                        ? await completeOnboarding(userId)
                        : pending === "dismiss"
                            ? await dismissOnboarding(userId)
                            : { ok: true };

                if (cancelled) return;

                if (res.ok) {
                    writeAccountStorage(onboardingScope, "onboardingSyncAction", null);
                    refreshAuth();
                } else {
                    console.warn("Onboarding sync pending (will retry):", res.error);
                }
            } catch (e) {
                if (!cancelled) console.warn("Onboarding sync pending (will retry):", e);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [auth.isLoading, auth.isAuthenticated, refreshAuth, onboardingScope, userId]);

    // Backfill: if localStorage says completed/dismissed but server still says "shouldShow",
    // we persist it to Supabase so it works across devices.
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (auth.isLoading) return;
        if (!auth.isAuthenticated) return;
        if (!auth.onboarding.shouldShow) return;

        // If there is already a pending sync, let the other effect handle it.
        if (readAccountStorage<string>(onboardingScope, "onboardingSyncAction")) return;

        const hasCompletedLocal = readAccountStorage<boolean>(onboardingScope, "onboardingCompleted") === true;
        const hasDismissedLocal = readAccountStorage<boolean>(onboardingScope, "onboardingDismissed") === true;
        if (!hasCompletedLocal && !hasDismissedLocal) return;

        const action = hasCompletedLocal ? "complete" : "dismiss";
        writeAccountStorage(onboardingScope, "onboardingSyncAction", action);
    }, [auth.isLoading, auth.isAuthenticated, auth.onboarding.shouldShow, onboardingScope]);

    // Auto-trigger setup if authenticated but no spreadsheet (returning user case)
    useEffect(() => {
        if (auth.isLoading) return;
        if (!auth.isAuthenticated || !userId) return;
        if (auth.hasSpreadsheet) return;
        if (setupComplete) return;

        // User is authenticated but has no spreadsheet - run setup
        runSetupInBackground();
    }, [auth.isLoading, auth.isAuthenticated, auth.hasSpreadsheet, setupComplete, runSetupInBackground, userId]);

    const handleSheetsError = (error: unknown) => {
        const sheetsError = error instanceof Error ? error as SheetsError : null;
        const code = sheetsError?.code;
        const status = sheetsError?.status;
        const message = sheetsError?.message ?? "";
        const messageLower = message.toLowerCase();

        const isBlocking =
            code === "SHEETS_PERMISSION" ||
            code === "SHEETS_NOT_FOUND" ||
            code === "SHEETS_BAD_RANGE" ||
            code === "NO_INTEGRATION" ||
            code === "NO_SPREADSHEET" ||
            code === "NO_REFRESH_TOKEN" ||
            code === "DECRYPT_REFRESH_TOKEN_FAILED" ||
            code === "CONFIG_TOKEN_ENCRYPTION_KEY" ||
            status === 403 ||
            status === 404 ||
            status === 401 ||
            messageLower.includes("no tenés permiso") ||
            messageLower.includes("permission") ||
            messageLower.includes("no encontramos ese google sheet");

        if (!isBlocking) return false;

        setErrorMessage(
            message ||
                (status === 401
                    ? "Tu sesión o tu conexión con Google expiró. Probá cerrar sesión y volver a conectar."
                    : "No pudimos acceder a tu Google Sheet. Probá desloguearte y volver a conectar.")
        );
        return true;
    };

    useEffect(() => {
        if (requestedWeekId === null || auth.isLoading || !auth.isAuthenticated || !auth.hasSpreadsheet) return;
        let cancelled = false;
        const selectionVersion = weekSelectionVersion.current;

        async function loadWeek(weekId: number) {
            try {
                const data = await fetchWeekData(weekId, { userId });
                if (cancelled || selectionVersion !== weekSelectionVersion.current) return;
                if (data.week.id !== weekId) throw new Error("La respuesta pertenece a otra semana.");
                setWeek(data.week);
            } catch (error) {
                if (cancelled || selectionVersion !== weekSelectionVersion.current) return;
                if (!handleSheetsError(error)) {
                    console.error("Error loading week:", error);
                    setErrorMessage("No pudimos cargar la semana.");
                }
            }
        }

        void loadWeek(requestedWeekId);
        return () => {
            cancelled = true;
        };
    }, [auth.isLoading, auth.isAuthenticated, auth.hasSpreadsheet, requestedWeekId, userId]);

    const prByExercise = useMemo(() => {
        const map = new Map<string, PersonalRecord>();
        for (const pr of initialPrs) map.set(normalizeExerciseKey(pr.exercise), pr);
        return map;
    }, [initialPrs]);

    // Filter to only show days with exercises
    const visibleDays = useMemo(() => {
        if (!week?.days?.length) return [];
        return week.days.filter((d) => d.exercises.length > 0);
    }, [week]);

    // Get current day from visible days
    const currentDay = visibleDays[currentDayIndex] || null;

    // Adjust currentDayIndex if it's out of bounds after filtering
    useEffect(() => {
        if (visibleDays.length > 0 && currentDayIndex >= visibleDays.length) {
            setCurrentDayIndex(0);
        }
    }, [visibleDays.length, currentDayIndex]);

    const routineProgress = useMemo(() => {
        if (!currentDay) return [];

        return currentDay.exercises.map((exercise, rowIndex) => {
            const prescription = String(exercise.prescribedSeries ?? "");
            const match = prescription.match(/^\s*(\d+)\s*[x×]/i);
            const target = match ? Math.max(1, Number(match[1])) : /\b(?:min|seg|s)\b/i.test(prescription) ? 1 : 3;
            const sets = exercise.sets ?? [];
            const completed = sets.slice(0, target).filter(validSet).length;
            return {
                id: `${week.id}:${currentDay.id}:${rowIndex}`,
                rowIndex,
                name: exercise.name,
                prescription,
                notes: String(exercise.notes ?? "").trim(),
                completed,
                target,
                isComplete: completed >= target,
            };
        });
    }, [currentDay, week.id]);

    const displayedRows = routineProgress
        .filter((row) => !hideCompleted || !row.isComplete || row.id === activeEditor?.id)
        .map((row) => ({
            id: row.id,
            name: row.name,
            prescription: row.prescription,
            completed: row.isComplete,
            countLabel: `${row.completed}/${row.target}`,
        }));

    // Calcular porcentaje total de la rutina del día
    const routinePercentage = useMemo(() => {
        if (routineProgress.length === 0) return 0;
        const totalCompleted = routineProgress.reduce((sum, item) => sum + item.completed, 0);
        const totalTarget = routineProgress.reduce((sum, item) => sum + item.target, 0);
        if (totalTarget === 0) return 0;
        return Math.round((totalCompleted / totalTarget) * 100);
    }, [routineProgress]);

    useEffect(() => {
        if (!showInfoPopover) return;

        const handlePointerDown = (e: MouseEvent | TouchEvent) => {
            const el = infoPopoverRef.current;
            if (!el) return;
            if (e.target instanceof Node && !el.contains(e.target)) {
                setShowInfoPopover(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setShowInfoPopover(false);
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("touchstart", handlePointerDown, { passive: true });
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("touchstart", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [showInfoPopover]);

    useEffect(() => {
        if (!showInfoPopover || !userId || auth.isLoading || !auth.isAuthenticated || !currentDay) return;

        const weekId = week.id;
        const dayId = currentDay.id;
        const exerciseNames = currentDay.exercises.map((e) => e.name);

        let cancelled = false;

        const readVersion = writeVersion.current;
        const selectionVersion = weekSelectionVersion.current;

        const refresh = async () => {
            setIsRefreshingInfo(true);
            try {
                if (pendingExerciseSaves.current.size) return;
                const results = await fetchExerciseSetsBulk({ weekId, dayId, exerciseNames, userId });
                if (cancelled || readVersion !== writeVersion.current ||
                    selectionVersion !== weekSelectionVersion.current || pendingExerciseSaves.current.size) return;
                const byExercise = new Map(results.map((result) => [result.exerciseName, recordedSets(result.sets)]));
                setWeek((previous) => updateDay(previous?.id === weekId ? previous : week, dayId, (day) => ({
                    ...day,
                    exercises: day.exercises.map((exercise) => {
                        const sets = byExercise.get(exercise.name);
                        return sets ? { ...exercise, sets } : exercise;
                    }),
                })));
            } catch (error) {
                if (!cancelled) console.error("Failed to fetch exercise sets:", error);
            } finally {
                if (!cancelled) setIsRefreshingInfo(false);
            }
        };

        refresh();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showInfoPopover, auth.isLoading, auth.isAuthenticated, week.id, currentDayIndex, userId]);

    const invalidateTrainingView = useCallback(() => {
        exerciseRequestId.current++;
        weekSelectionVersion.current++;
        daySelectionVersion.current++;
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    }, []);

    useEffect(() => invalidateTrainingView, [invalidateTrainingView]);

    const showToast = (message: string) => {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setToastMessage(message);
        toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 1800);
    };

    const loadExerciseSets = useCallback(async (target: ClassicExerciseTarget) => {
        if (!userId) throw new Error("Volvé a iniciar sesión para cargar las series.");
        const { weekId, dayId, name } = target;
        const key = saveKey(weekId, dayId, name);
        await pendingExerciseSaves.current.get(key)?.catch(() => undefined);
        const { sets } = await fetchExerciseSets({ weekId, dayId, exerciseName: name, userId });
        return recordedSets(sets);
    }, [userId]);

    const closeExercise = (requestId: number) => {
        if (exerciseRequestId.current !== requestId) return;
        exerciseRequestId.current++;
        setActiveEditor(null);
    };

    const selectExercise = (id: string) => {
        if (!auth.isAuthenticated || !userId) return;
        if (activeEditor?.id === id) {
            closeExercise(activeEditor.requestId);
            return;
        }
        setActiveEditor({ id, requestId: ++exerciseRequestId.current });
    };

    const handleToggleHideCompleted = () => {
        setHideCompleted((prev) => {
            const next = !prev;
            showToast(next ? "Ejercicios completados ocultos" : "Ejercicios completados visibles");
            return next;
        });
        setShowWeekPicker(false);
        setShowInfoPopover(false);
    };

    const handleSaveSeries = async (target: ClassicExerciseTarget, sets: Set[]) => {
        if (!userId) throw new Error("Volvé a iniciar sesión para guardar las series.");
        const { weekId, dayId, name, rowIndex } = target;
        const key = saveKey(weekId, dayId, name);
        const pending = pendingExerciseSaves.current;
        const previousSave = pending.get(key);
        const weekVersion = weekSelectionVersion.current;
        const dayVersion = daySelectionVersion.current;
        const editorVersion = exerciseRequestId.current;
        writeVersion.current++;

        async function save() {
            await previousSave?.catch(() => undefined);
            const result = await saveExerciseSets(weekId, dayId, name, sets, userId);
            if (!result.ok) {
                const message = result.status ? result.error : null;
                throw new Error(message || "No pudimos guardar las series. Volvé a intentar.");
            }

            if (weekVersion !== weekSelectionVersion.current) return;
            setWeek((previous) => updateDay(previous?.id === weekId ? previous : week, dayId, (day) => ({
                ...day,
                exercises: day.exercises.map((item, index) => index === rowIndex && item.name === name ? { ...item, sets } : item),
            })));
            showToast("Series guardadas");

            const unrated = week.days.find((day) => day.id === dayId)?.stars === undefined;
            if (sets.some(validSet) && unrated && dayVersion === daySelectionVersion.current &&
                editorVersion === exerciseRequestId.current) {
                setShowRatingModal(true);
            }
        }

        const operation = save();
        pending.set(key, operation);
        try {
            await operation;
        } finally {
            if (pending.get(key) === operation) pending.delete(key);
        }
    };

    const handleSaveRating = async (stars: number) => {
        if (!currentDay || !userId) return;
        const dayId = currentDay.id;
        const version = weekSelectionVersion.current;
        setShowRatingModal(false);

        try {
            const result = await saveSessionRating(week.id, dayId, stars, userId);
            if (!result.ok) {
                throw Object.assign(new Error(result.error || "Error al guardar calificación"), {
                    code: result.code,
                    status: result.status,
                });
            }

            if (version !== weekSelectionVersion.current) return;
            setWeek((previous) => updateDay(previous?.id === week.id ? previous : week, dayId, (day) => ({ ...day, stars })));
            showToast("Calificación guardada");
        } catch (error) {
            if (!handleSheetsError(error)) {
                console.error("Failed to save rating:", error);
                showToast("Error al guardar calificación");
            }
        }
    };

    const changeDay = (index: number) => {
        exerciseRequestId.current++;
        daySelectionVersion.current++;
        setActiveEditor(null);
        setShowRatingModal(false);
        setCurrentDayIndex(index);
    };

    const handleConnectGoogle = () => {
        auth.login();
    };

    // Loading state: only show loader if we DON'T have initial server data
    // This avoids blocking SSR content while auth hydrates
    const hasInitialData = initialWeek?.days && initialWeek.days.length > 0;
    // Importante: si el onboarding está abierto, NO desmontar toda la UI por un refresh de auth
    // (por ejemplo cuando termina el setup y hacemos refreshAuth()) porque eso resetea el wizard.
    if (auth.isLoading && !hasInitialData && !showOnboardingWizard) {
        return (
            <div className="min-h-[calc(100dvh-(var(--bottom-nav-base)+env(safe-area-inset-bottom)))] w-full flex flex-col items-center justify-center bg-[#F2F2F7]">
                <Loader2 className="w-8 h-8 animate-spin text-ios-blue" />
            </div>
        );
    }

    // Not authenticated: show connect screen
    // Skip this check if we have initial data (means server already authenticated the user)
    if (!auth.isAuthenticated && !hasInitialData) {
        return (
            <div className="min-h-[calc(100dvh-(var(--bottom-nav-base)+env(safe-area-inset-bottom)))] w-full flex flex-col bg-[#F2F2F7]">
                <div className="flex-1 flex flex-col items-center justify-center px-8">
                    {errorMessage && (
                        <p role="alert" className="mb-5 max-w-xs text-center text-sm font-medium text-red-700">{errorMessage}</p>
                    )}
                    <div className="w-20 h-20 bg-ios-blue/10 rounded-full flex items-center justify-center mb-6">
                        <svg className="w-10 h-10" viewBox="0 0 24 24">
                            <path
                                fill="#4285F4"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                                fill="#34A853"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                                fill="#FBBC05"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                                fill="#EA4335"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-black text-black mb-2 text-center">
                        Bienvenido a Gym Tracker
                    </h1>
                    <p className="text-gray-500 text-center mb-8 max-w-xs">
                        Conectá tu cuenta de Google para empezar a registrar tus entrenamientos.
                    </p>
                    <button
                        onClick={handleConnectGoogle}
                        className="w-full max-w-xs py-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2"
                    >
                        Conectar con Google
                    </button>
                </div>
            </div>
        );
    }

    const handleOnboardingComplete = async () => {
        // Persist to localStorage (immediate, for compat/offline)
        writeAccountStorage(onboardingScope, "onboardingCompleted", true);
        writeAccountStorage(onboardingScope, "onboardingDismissed", null);
        writeAccountStorage(onboardingScope, "onboardingSyncAction", "complete");
        setShowOnboardingWizard(false);

        // Persist to server (reliable, cross-device)
        completeOnboarding(userId)
            .then((res) => {
                if (res.ok) {
                    writeAccountStorage(onboardingScope, "onboardingSyncAction", null);
                    refreshAuth();
                }
            })
            .catch((e) => console.error("Failed to persist onboarding complete:", e));

        // Refresh week data after onboarding
        try {
            const fetchedWeeks = await fetchWeeksList(userId);
            const firstWeekId = fetchedWeeks[0]?.id ?? 1;
            const { week: next } = await fetchWeekData(firstWeekId, { userId });
            setWeeks(fetchedWeeks);
            setRequestedWeekId(firstWeekId);
            setWeek(next);
        } catch (e) {
            console.error("Failed to refresh data after onboarding:", e);
        }
    };

    const handleOnboardingSkip = () => {
        // Persist to localStorage (immediate, for compat/offline)
        writeAccountStorage(onboardingScope, "onboardingDismissed", true);
        writeAccountStorage(onboardingScope, "onboardingSyncAction", "dismiss");
        setShowOnboardingWizard(false);

        // Persist to server (reliable, cross-device)
        dismissOnboarding(userId)
            .then((res) => {
                if (res.ok) {
                    writeAccountStorage(onboardingScope, "onboardingSyncAction", null);
                    refreshAuth();
                }
            })
            .catch((e) => console.error("Failed to persist onboarding dismiss:", e));
    };

    return (
        <div className="min-h-[calc(100dvh-(var(--bottom-nav-base)+env(safe-area-inset-bottom)))] w-full flex flex-col bg-[#F2F2F7] overflow-x-hidden">
            {/* Onboarding wizard for new users */}
            {showOnboardingWizard && (
                <OnboardingWizard
                    isOpen={true}
                    startMode={onboardingStartMode}
                    onComplete={handleOnboardingComplete}
                    onSkip={handleOnboardingSkip}
                    isSettingUp={isSettingUp}
                    setupComplete={setupComplete || auth.hasSpreadsheet}
                    setupError={setupError}
                />
            )}

            {/* Error banner */}
            {errorMessage && (
                <div className="px-4 py-3 bg-red-50 border-b border-red-200">
                    <p className="text-sm text-red-700 font-medium text-center">{errorMessage}</p>
                </div>
            )}

            {/* CTA para continuar onboarding (sin auto abrir) */}
            {auth.onboarding.shouldShow && auth.onboarding.hasProgress && !showOnboardingWizard && (
                <div className="px-4 pt-4">
                    <div className="p-4 rounded-2xl bg-white border border-black/5 shadow-sm flex items-center justify-between gap-3">
                        <div className="flex-1">
                            <p className="text-sm font-black text-black">Continuar onboarding</p>
                            <p className="text-xs text-gray-500">Retomá donde lo dejaste</p>
                        </div>
                        <button
                            onClick={() => {
                                setOnboardingStartMode("resume");
                                setShowOnboardingWizard(true);
                            }}
                            className="px-4 py-2 bg-black text-white rounded-xl text-sm font-bold active:translate-y-px transition"
                        >
                            Continuar
                        </button>
                    </div>
                </div>
            )}

            {/* Header with Week Picker */}
            <header className="flex justify-between items-center px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-2 shrink-0 z-30 relative">
                <div className="relative">
                    <button
                        onClick={() => setShowWeekPicker(!showWeekPicker)}
                        className="flex items-center gap-2 active:opacity-60 transition-opacity"
                    >
                        <h1 className="text-3xl font-black tracking-tight text-black">
                            {selectedWeekName}
                        </h1>
                        <div className={`text-ios-blue transition-transform ${showWeekPicker ? "rotate-180" : ""}`}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                    </button>

                    {/* Week Picker Dropdown */}
                    {showWeekPicker && (
                        <div className="absolute top-full left-0 mt-2 w-48 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-black/5 overflow-hidden origin-top-left animate-in fade-in zoom-in-95 duration-200">
                            {weeks.map((w) => (
                                <button
                                    key={String(w.id)}
                                    className="w-full text-left px-4 py-3 font-bold text-sm hover:bg-black/5 active:bg-black/10 transition-colors border-b border-black/5 last:border-0"
                                    onClick={() => {
                                        setShowWeekPicker(false);
                                        if (w.id === selectedWeekId) return;
                                        weekSelectionVersion.current++;
                                        changeDay(0);
                                        setShowInfoPopover(false);
                                        setWeek(null);
                                        setErrorMessage(null);
                                        setRequestedWeekId(w.id);
                                    }}
                                >
                                    {w.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Toggle ocultar completados */}
                    <button
                        onClick={handleToggleHideCompleted}
                        aria-pressed={hideCompleted}
                        className={`w-10 h-10 rounded-full shadow-sm border border-black/5 flex items-center justify-center active:scale-95 transition-all ${hideCompleted ? "bg-black text-white" : "bg-white text-gray-500"
                            }`}
                        aria-label={hideCompleted ? "Mostrar ejercicios completados" : "Ocultar ejercicios completados"}
                    >
                        <EyeOff size={18} />
                    </button>

                    {/* Info Popover */}
                    <div ref={infoPopoverRef} className="relative">
                        <button
                            type="button"
                            onClick={() => {
                                setShowInfoPopover((v) => !v);
                                setShowWeekPicker(false);
                            }}
                            className="w-10 h-10 relative flex items-center justify-center active:scale-95 transition-transform"
                            aria-label="Info de rutina de hoy"
                            aria-expanded={showInfoPopover}
                        >
                            <ProgressRing percent={routinePercentage} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Routine Info Modal Backdrop with Blur */}
            {showInfoPopover && (
                <div
                    className="fixed inset-0 z-40 bg-black/20 backdrop-blur-md"
                    onClick={() => setShowInfoPopover(false)}
                />
            )}

            {/* Routine Info Modal */}
            {showInfoPopover && (
                <div
                    className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-3rem)] max-w-sm bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-black/5 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                >
                    <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-black tracking-wider text-gray-400">
                                Rutina de hoy
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-lg font-black text-black">
                                    {currentDay ? `Día ${currentDay.id}` : "Sin rutina"}
                                </span>
                                {currentDay?.stars !== undefined && (
                                    <span className="text-base" style={{ color: '#FFCC00' }}>
                                        {currentDay.stars === 1 && "★☆☆"}
                                        {currentDay.stars === 2 && "★★☆"}
                                        {currentDay.stars === 3 && "★★★"}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {isRefreshingInfo && (
                                <div className="text-gray-400">
                                    <Loader2 size={16} className="animate-spin" />
                                </div>
                            )}
                            <div className={`text-xl font-black tabular-nums ${routinePercentage === 100 ? "text-ios-green" : "text-ios-blue"}`}>
                                {routinePercentage}%
                            </div>
                        </div>
                    </div>

                    {!currentDay ? (
                        <div className="px-5 py-6 text-sm font-bold text-gray-400 text-center">
                            No hay rutina programada para hoy.
                        </div>
                    ) : routineProgress.length === 0 ? (
                        <div className="px-5 py-6 text-sm font-bold text-gray-400 text-center">
                            No hay ejercicios para este día.
                        </div>
                    ) : (
                        <ul className="max-h-80 overflow-auto">
                            {routineProgress.map((item) => (
                                <li
                                    key={item.id}
                                    className="px-5 py-3.5 flex items-center justify-between gap-3 border-b border-black/5 last:border-0"
                                >
                                    <span className="text-sm font-bold text-black truncate">
                                        {item.name}
                                    </span>
                                    <span className={`text-sm font-black tabular-nums ${item.isComplete ? "text-ios-green" : "text-gray-400"}`}>
                                        {item.completed}/{item.target}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* Day Selector */}
            {visibleDays.length > 0 && (
                <div className="px-6 pb-2 shrink-0 z-20">
                    <DaySelector
                        days={visibleDays}
                        selectedIndex={currentDayIndex}
                        onSelect={(index) => {
                            if (index !== currentDayIndex) changeDay(index);
                        }}
                    />
                </div>
            )}

            <div key={`${selectedWeekId}-${currentDay?.id}`} className="workout-section flex-1">
                {currentDay && displayedRows.length > 0 ? (
                    <ExerciseList
                        rows={displayedRows}
                        activeId={activeEditor?.id}
                        onSelect={selectExercise}
                        renderEditor={(id) => {
                            const row = routineProgress.find((item) => item.id === id);
                            if (!row || activeEditor?.id !== id) return null;
                            const { requestId } = activeEditor;
                            return (
                                <ClassicExerciseEditor
                                    key={`${requestId}:${row.name}`}
                                    target={{ weekId: week.id, dayId: currentDay.id, rowIndex: row.rowIndex, name: row.name }}
                                    record={prByExercise.get(normalizeExerciseKey(row.name))}
                                    notes={row.notes}
                                    load={loadExerciseSets}
                                    save={handleSaveSeries}
                                    onClose={() => closeExercise(requestId)}
                                />
                            );
                        }}
                    />
                ) : isLoadingWeek ? (
                    <Loader2 role="status" aria-label="Cargando semana" className="mx-auto w-8 h-8 animate-spin text-ios-blue" />
                ) : (
                    <p className="p-5 text-center text-sm text-ios-gray">
                        {currentDay ? "No quedan ejercicios pendientes hoy." : "No hay rutina programada para hoy."}
                    </p>
                )}
            </div>

            {/* Session Rating Modal */}
            <SessionRatingModal
                isOpen={showRatingModal}
                onClose={() => setShowRatingModal(false)}
                onSave={handleSaveRating}
                dayName={currentDay ? `Día ${currentDay.id}` : undefined}
            />

            {/* Toast inferior */}
            {toastMessage && (
                <div role="status" className="fixed bottom-[calc(var(--bottom-nav-base)+env(safe-area-inset-bottom)+1rem)] left-1/2 -translate-x-1/2 z-50">
                    <div className="bg-black text-white px-4 py-3 rounded-full shadow-lg text-sm font-semibold">
                        {toastMessage}
                    </div>
                </div>
            )}
        </div>
    );
}
