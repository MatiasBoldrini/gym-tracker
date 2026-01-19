"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { saveExerciseSets, fetchExerciseSets, fetchExerciseSetsBulk, fetchWeekData, fetchWeeksList, saveSessionRating, setupSpreadsheet, completeOnboarding, dismissOnboarding } from "@/lib/sheets-client";
import type { Week, PersonalRecord, Exercise, Set } from "@/types";
import { ExerciseCard } from "@/components/ui/ExerciseCard";
import Stack from "@/components/ui/Stack";
import { ExerciseModal } from "@/components/ui/ExerciseModal";
import { DaySelector } from "@/components/ui/DaySelector";
import { SessionRatingModal } from "@/components/ui/SessionRatingModal";
import { useAuth } from "@/lib/hooks/useAuth";
import { EyeOff, Loader2, Sparkles } from "lucide-react";
import { OnboardingWizard } from "@/components/screens/OnboardingWizard";
import { normalizeExerciseKey } from "@/lib/normalize";
import { cacheUrls } from "@/lib/pwa";

type WeekListItem = { id: number; name: string };

type HomeScreenProps = {
    initialWeek: Week;
    initialWeeks: WeekListItem[];
    initialPrs: PersonalRecord[];
    initialSetupError?: { message: string; code?: string } | null;
};

export function HomeScreen({ initialWeek, initialWeeks, initialPrs, initialSetupError }: HomeScreenProps) {
    const [week, setWeek] = useState<Week>(initialWeek);
    const [prs] = useState<PersonalRecord[]>(initialPrs);
    const [currentDayIndex, setCurrentDayIndex] = useState(0);
    const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [showWeekPicker, setShowWeekPicker] = useState(false);
    // Initialize weeks from server data to avoid duplicate fetch
    const [weeks, setWeeks] = useState<WeekListItem[]>(initialWeeks);
    const [selectedWeekId, setSelectedWeekId] = useState<number>(initialWeek?.id || 1);
    const [selectedWeekName, setSelectedWeekName] = useState(initialWeek?.id ? `Semana ${initialWeek.id}` : "Semana 1");

    // Auth state
    const auth = useAuth();
    const [errorMessage, setErrorMessage] = useState<string | null>(initialSetupError?.message ?? null);

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

    // Track if we've consumed initial server data (to avoid duplicate fetches only on first mount)
    const hasConsumedInitialWeeksRef = useRef(initialWeeks.length > 0);
    const hasConsumedInitialWeekRef = useRef(initialWeek?.days?.length > 0);

    // Onboarding wizard for new users or empty routines
    const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
    const ONBOARDING_SYNC_ACTION_KEY = "onboarding_sync_action_v1";

    // Async setup state (runs in background while user does onboarding)
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [setupComplete, setSetupComplete] = useState(false);
    const [setupError, setSetupError] = useState<string | null>(null);
    const setupStartedRef = useRef(false);

    // Check if routine is empty (all days have no exercises)
    const isRoutineEmpty = useMemo(() => {
        if (!week?.days?.length) return true;
        return week.days.every((d) => d.exercises.length === 0);
    }, [week]);

    // Run setup in background (called once when setup_pending detected)
    const runSetupInBackground = useCallback(async () => {
        if (setupStartedRef.current) return;
        setupStartedRef.current = true;

        setIsSettingUp(true);
        setSetupError(null);

        try {
            const result = await setupSpreadsheet();
            if (result.ok) {
                setSetupComplete(true);
                // Refresh auth state to get new spreadsheet info
                auth.refresh();
            } else {
                setSetupError(result.error || "Error al crear la planilla");
            }
        } catch (err: any) {
            setSetupError(err?.message || "Error al crear la planilla");
        } finally {
            setIsSettingUp(false);
        }
    }, [auth]);

    // Check for new user flag in URL or empty routine
    useEffect(() => {
        if (typeof window === "undefined") return;

        const urlParams = new URLSearchParams(window.location.search);
        const forceOnboarding = urlParams.get("force_onboarding") === "true";
        const setupPending = urlParams.get("setup_pending") === "true";
        const isNewUser = urlParams.get("is_new_user") === "true";

        // Clean URL params (auth_success, setup_pending, is_new_user) without reloading
        if (urlParams.has("auth_success") || urlParams.has("setup_pending") || urlParams.has("is_new_user") || urlParams.has("force_onboarding")) {
            const newUrl = window.location.pathname;
            window.history.replaceState({}, "", newUrl);
        }

        // Start background setup if pending (new user without spreadsheet)
        if (setupPending || isNewUser) {
            runSetupInBackground();
        }

        // Force onboarding if explicitly requested (from redo)
        if (forceOnboarding) {
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
        const hasCompletedOnboarding = localStorage.getItem("onboarding_completed_v1") === "true";
        const hasDismissedOnboarding = localStorage.getItem("onboarding_dismissed_v1") === "true";
        if (hasCompletedOnboarding || hasDismissedOnboarding) return;

        // Priority 3: Show wizard if new user OR routine is empty
        if (isNewUser || isRoutineEmpty) {
            setShowOnboardingWizard(true);
        }
    }, [isRoutineEmpty, runSetupInBackground, auth.onboarding.hasCompleted, auth.onboarding.hasDismissed, auth.onboarding.hasProgress]);

    // Retry onboarding sync if we ever completed/dismissed offline or if the server write failed.
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (auth.isLoading) return;
        if (!auth.isAuthenticated) return;

        const pending = localStorage.getItem(ONBOARDING_SYNC_ACTION_KEY);
        if (!pending) return;

        let cancelled = false;

        const run = async () => {
            try {
                const res =
                    pending === "complete"
                        ? await completeOnboarding()
                        : pending === "dismiss"
                            ? await dismissOnboarding()
                            : { ok: true };

                if (cancelled) return;

                if (res.ok) {
                    localStorage.removeItem(ONBOARDING_SYNC_ACTION_KEY);
                    auth.refresh();
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
    }, [auth.isLoading, auth.isAuthenticated, auth.refresh]);

    // Backfill: if localStorage says completed/dismissed but server still says "shouldShow",
    // we persist it to Supabase so it works across devices.
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (auth.isLoading) return;
        if (!auth.isAuthenticated) return;
        if (!auth.onboarding.shouldShow) return;

        // If there is already a pending sync, let the other effect handle it.
        if (localStorage.getItem(ONBOARDING_SYNC_ACTION_KEY)) return;

        const hasCompletedLocal = localStorage.getItem("onboarding_completed_v1") === "true";
        const hasDismissedLocal = localStorage.getItem("onboarding_dismissed_v1") === "true";
        if (!hasCompletedLocal && !hasDismissedLocal) return;

        const action = hasCompletedLocal ? "complete" : "dismiss";
        localStorage.setItem(ONBOARDING_SYNC_ACTION_KEY, action);
    }, [auth.isLoading, auth.isAuthenticated, auth.onboarding.shouldShow]);

    // Si el server detectó un problema de acceso (403/404) lo mostramos
    useEffect(() => {
        const msg = initialSetupError?.message;
        if (!msg) return;
        setErrorMessage(msg);
    }, [initialSetupError?.message]);

    // Auto-trigger setup if authenticated but no spreadsheet (returning user case)
    useEffect(() => {
        if (auth.isLoading) return;
        if (!auth.isAuthenticated) return;
        if (auth.hasSpreadsheet) return;
        if (setupComplete) return;

        // User is authenticated but has no spreadsheet - run setup
        runSetupInBackground();
    }, [auth.isLoading, auth.isAuthenticated, auth.hasSpreadsheet, setupComplete, runSetupInBackground]);

    const handleSheetsError = (err: any) => {
        const code = err?.code as string | undefined;
        const status = err?.status as number | undefined;
        const message = typeof err?.message === "string" ? err.message : "";
        const messageLower = message.toLowerCase();

        const isBlocking =
            code === "SHEETS_PERMISSION" ||
            code === "SHEETS_NOT_FOUND" ||
            code === "SHEETS_BAD_RANGE" ||
            status === 403 ||
            status === 404 ||
            messageLower.includes("no tenés permiso") ||
            messageLower.includes("permission") ||
            messageLower.includes("no encontramos ese google sheet");

        if (!isBlocking) return false;

        setErrorMessage(message || "No pudimos acceder a tu Google Sheet. Probá desloguearte y volver a conectar.");
        return true;
    };

    useEffect(() => {
        // Skip fetching weeks if we already have them from the server (SSR) - only on first mount
        if (hasConsumedInitialWeeksRef.current) {
            hasConsumedInitialWeeksRef.current = false; // Consume initial data, next time we'll fetch
            return;
        }

        if (auth.isLoading) return;
        if (!auth.isAuthenticated) return;

        let cancelled = false;

        const loadWeeks = async () => {
            try {
                const fetchedWeeks = await fetchWeeksList();
                if (cancelled) return;

                const sorted = fetchedWeeks.sort((a, b) => a.id - b.id);
                setWeeks(sorted);

                const resolvedWeekId =
                    sorted.some((w) => w.id === selectedWeekId)
                        ? selectedWeekId
                        : (sorted[0]?.id ?? 1);

                setSelectedWeekId(resolvedWeekId);
                setSelectedWeekName(`Semana ${resolvedWeekId}`);
            } catch (e) {
                if (!handleSheetsError(e)) {
                    console.error("Failed to load weeks:", e);
                }
            }
        };

        loadWeeks();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth.isLoading, auth.isAuthenticated]);

    useEffect(() => {
        // Skip fetching week if we have initial data for THIS week - only on first mount
        if (hasConsumedInitialWeekRef.current && initialWeek?.id === selectedWeekId) {
            hasConsumedInitialWeekRef.current = false; // Consume initial data
            return;
        }

        if (auth.isLoading) return;
        if (!auth.isAuthenticated) return;

        let cancelled = false;

        const loadWeek = async () => {
            try {
                const data = await fetchWeekData(selectedWeekId);
                if (cancelled) return;
                setWeek(data.week);
                setCurrentDayIndex(0);
                setSelectedWeekName(`Semana ${selectedWeekId}`);
            } catch (e) {
                if (!handleSheetsError(e)) {
                    console.error("Failed to load week:", e);
                }
            }
        };

        loadWeek();

        return () => {
            cancelled = true;
        };
    }, [auth.isLoading, auth.isAuthenticated, selectedWeekId, initialWeek?.id]);

    // Cache selectivo: precachear SOLO las imágenes de la rutina cargada (toda la semana).
    useEffect(() => {
        if (!auth.isAuthenticated) return;
        if (!week?.days?.length) return;

        const urls = week.days
            .flatMap((d) => d.exercises || [])
            .map((e) => (e?.image ? `/images/exercises/${e.image}` : null))
            .filter((u): u is string => !!u);

        // Fire-and-forget: el SW cachea en background.
        void cacheUrls(urls);
    }, [auth.isAuthenticated, week]);

    const prByExercise = useMemo(() => {
        const map = new Map<string, PersonalRecord>();
        for (const pr of prs) map.set(normalizeExerciseKey(pr.exercise), pr);
        return map;
    }, [prs]);

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

    const isExerciseComplete = (exercise: Exercise) => {
        const targetSetCount = Math.max(
            1,
            parseInt(exercise.prescribedSeries?.toString().split(/[\sxX]+/)[0]) || 3
        );
        const completedSetsCount = exercise.sets?.slice(0, targetSetCount).filter(s =>
            s.weight !== null && s.weight !== undefined && s.weight >= 0 &&
            s.reps !== null && s.reps !== undefined && s.reps > 0
        ).length || 0;

        return completedSetsCount >= targetSetCount;
    };

    const visibleExercises = useMemo(() => {
        if (!currentDay) return [];
        if (!hideCompleted) return currentDay.exercises;
        return currentDay.exercises.filter((exercise) => !isExerciseComplete(exercise));
    }, [currentDay, hideCompleted]);

    const routineProgress = useMemo(() => {
        if (!currentDay) return [];

        const isValidSet = (s: Set) =>
            s.weight !== null && s.weight !== undefined && s.weight >= 0 &&
            s.reps !== null && s.reps !== undefined && s.reps > 0;

        return currentDay.exercises.map((exercise) => {
            const targetSetCount = Math.max(
                1,
                parseInt(exercise.prescribedSeries?.toString().split(/[\sxX]+/)[0]) || 3
            );
            const completedSetsCount = exercise.sets?.slice(0, targetSetCount).filter(isValidSet).length || 0;
            return {
                name: exercise.name,
                completed: completedSetsCount,
                target: targetSetCount,
                isComplete: completedSetsCount >= targetSetCount,
            };
        });
    }, [currentDay]);

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
        if (!showInfoPopover) return;
        if (auth.isLoading) return;
        if (!auth.isAuthenticated) return;
        if (!currentDay) return;

        const weekId = week.id;
        const dayId = currentDay.id;
        const exerciseNames = currentDay.exercises.map((e) => e.name);

        let cancelled = false;

        const refresh = async () => {
            setIsRefreshingInfo(true);
            try {
                // Batch fetch: single request for all exercises
                const bulkResults = await fetchExerciseSetsBulk({ weekId, dayId, exerciseNames });

                if (cancelled) return;

                // Normalize sets (0/0 -> null)
                const results = bulkResults.map((r) => ({
                    exerciseName: r.exerciseName,
                    sets: (r.sets || []).map((s): Set => ({
                        weight: (s.weight === 0 && s.reps === 0) ? null : (s.weight ?? null),
                        reps: (s.weight === 0 && s.reps === 0) ? null : (s.reps ?? null),
                    })),
                }));

                setWeek((prev) => {
                    const updated = { ...prev };
                    const dayIdx = updated.days.findIndex((d) => d.id === dayId);
                    if (dayIdx < 0) return prev;

                    const day = updated.days[dayIdx];
                    updated.days = [...updated.days];
                    updated.days[dayIdx] = { ...day, exercises: [...day.exercises] };

                    for (const r of results) {
                        const exIdx = updated.days[dayIdx].exercises.findIndex((e) => e.name === r.exerciseName);
                        if (exIdx < 0) continue;
                        updated.days[dayIdx].exercises[exIdx] = {
                            ...updated.days[dayIdx].exercises[exIdx],
                            sets: r.sets,
                        };
                    }

                    return updated;
                });
            } catch (err) {
                // Fail silently on bulk error (same UX as before per-exercise errors)
                console.error("Failed to fetch exercise sets bulk:", err);
            } finally {
                if (!cancelled) setIsRefreshingInfo(false);
            }
        };

        refresh();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showInfoPopover, auth.isLoading, auth.isAuthenticated, week.id, currentDayIndex]);

    useEffect(() => {
        return () => {
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        };
    }, []);

    const showToast = (message: string) => {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setToastMessage(message);
        toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 1800);
    };

    const exerciseCards = visibleExercises.map((exercise, idx) => {
        const pr = prByExercise.get(normalizeExerciseKey(exercise.name));
        return (
            <div
                key={idx}
                className="w-full h-full"
                onClick={async () => {
                    setSelectedExercise(exercise);
                    setIsModalOpen(true);

                    if (!auth.isAuthenticated) return;

                    try {
                        const { sets } = await fetchExerciseSets({
                            weekId: week.id,
                            dayId: currentDay.id,
                            exerciseName: exercise.name,
                        });

                        const normalizedSets: Set[] = (sets || []).map((s) => ({
                            weight: (s.weight === 0 && s.reps === 0) ? null : (s.weight ?? null),
                            reps: (s.weight === 0 && s.reps === 0) ? null : (s.reps ?? null),
                        }));

                        const hasFetchedFilled = normalizedSets.some((s) =>
                            s.weight !== null && s.weight !== undefined && s.weight >= 0 &&
                            s.reps !== null && s.reps !== undefined && s.reps > 0
                        );
                        const hasExistingFilled = (exercise.sets || []).some((s) =>
                            s.weight !== null && s.weight !== undefined && s.weight >= 0 &&
                            s.reps !== null && s.reps !== undefined && s.reps > 0
                        );

                        if (!hasFetchedFilled && hasExistingFilled) {
                            console.warn("fetchExerciseSets devolvió vacío; se mantiene el estado local:", {
                                weekId: week.id,
                                dayId: currentDay.id,
                                exerciseName: exercise.name,
                            });
                            return;
                        }

                        setWeek((prev) => {
                            const updated = { ...prev };
                            const dayIdx = updated.days.findIndex((d) => d.id === currentDay.id);
                            if (dayIdx < 0) return prev;
                            const exIdx = updated.days[dayIdx].exercises.findIndex((e) => e.name === exercise.name);
                            if (exIdx < 0) return prev;
                            updated.days = [...updated.days];
                            updated.days[dayIdx] = { ...updated.days[dayIdx] };
                            updated.days[dayIdx].exercises = [...updated.days[dayIdx].exercises];
                            updated.days[dayIdx].exercises[exIdx] = {
                                ...updated.days[dayIdx].exercises[exIdx],
                                sets: normalizedSets,
                            };
                            return updated;
                        });

                        setSelectedExercise((prev) => (prev && prev.name === exercise.name ? { ...prev, sets: normalizedSets } : prev));
                    } catch (e) {
                        if (!handleSheetsError(e)) {
                            console.error("Failed to preload sets:", e);
                        }
                    }
                }}
            >
                <ExerciseCard
                    exercise={exercise}
                    pr={pr}
                    isStacked
                    priority={idx === (visibleExercises.length - 1)}
                />
            </div>
        );
    }) || [];

    const shouldShowCompletionCard =
        hideCompleted &&
        !!currentDay &&
        currentDay.exercises.length > 0 &&
        visibleExercises.length === 0;

    const completionCard = (
        <div className="bg-white rounded-[32px] p-6 h-full flex flex-col border border-black/5 shadow-[0_10px_30px_-14px_rgba(0,0,0,0.28)]">
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-ios-green/15 text-ios-green flex items-center justify-center">
                    <Sparkles size={22} />
                </div>
                <div className="text-xl font-black text-black">
                    ¡Rutina completada!
                </div>
                <p className="text-sm font-bold text-gray-500">
                    No quedan ejercicios pendientes hoy.
                </p>
            </div>
        </div>
    );

    const cardsToRender = shouldShowCompletionCard ? [completionCard] : exerciseCards;

    const handleToggleHideCompleted = () => {
        setHideCompleted((prev) => {
            const next = !prev;
            showToast(next ? "Ejercicios completados ocultos" : "Ejercicios completados visibles");
            return next;
        });
        setShowWeekPicker(false);
        setShowInfoPopover(false);
    };

    const handleSaveSeries = async (sets: Set[]) => {
        if (!selectedExercise || !week || !currentDay) return;

        try {
            const validSets = sets
                .filter(s => s.weight !== null && s.reps !== null && !(s.weight === 0 && s.reps === 0))
                .map(s => ({ weight: s.weight!, reps: s.reps! }));

            if (validSets.length > 0) {
                const result = await saveExerciseSets(week.id, currentDay.id, selectedExercise.name, validSets);
                if (!result.ok) {
                    const err = new Error(result.error || "Error al guardar");
                    (err as any).code = result.code;
                    (err as any).status = result.status;
                    throw err;
                }
            }

            const dayId = currentDay.id;
            const exerciseName = selectedExercise.name;

            // IMPORTANT: immutable update so derived memos (routineProgress/visibleExercises)
            // recompute immediately and UI reflects the saved sets without waiting for refetch.
            setWeek((prev) => {
                const dayIdx = prev.days.findIndex((d) => d.id === dayId);
                if (dayIdx < 0) return prev;
                const exIdx = prev.days[dayIdx].exercises.findIndex((e) => e.name === exerciseName);
                if (exIdx < 0) return prev;

                const nextDays = [...prev.days];
                const nextDay = {
                    ...nextDays[dayIdx],
                    exercises: [...nextDays[dayIdx].exercises],
                };
                nextDay.exercises[exIdx] = { ...nextDay.exercises[exIdx], sets };
                nextDays[dayIdx] = nextDay;

                return { ...prev, days: nextDays };
            });

            setSelectedExercise((prev) => (prev && prev.name === exerciseName ? { ...prev, sets } : prev));

            const completedNow = isExerciseComplete({ ...selectedExercise, sets });
            if (completedNow) {
                setIsModalOpen(false);
            }

            // If the day wasn't rated yet, prompt rating after a successful save.
            if (validSets.length > 0) {
                const dayIdxForRating = week.days.findIndex((d) => d.id === dayId);
                const isUnrated = dayIdxForRating >= 0 && week.days[dayIdxForRating].stars === undefined;
                if (isUnrated) {
                    setTimeout(() => setShowRatingModal(true), 200);
                }
            }
        } catch (error) {
            if (!handleSheetsError(error)) {
                console.error("Failed to save series:", error);
                showToast("Error al guardar");
            }
        }
    };

    const handleSaveRating = async (stars: number) => {
        if (!week || !currentDay) return;

        setShowRatingModal(false);

        try {
            const result = await saveSessionRating(week.id, currentDay.id, stars);
            if (!result.ok) {
                const err = new Error(result.error || "Error al guardar calificación");
                (err as any).code = result.code;
                (err as any).status = result.status;
                throw err;
            }

            setWeek((prev) => {
                const updated = { ...prev };
                const dayIdx = updated.days.findIndex((d) => d.id === currentDay.id);
                if (dayIdx < 0) return prev;
                updated.days = [...updated.days];
                updated.days[dayIdx] = { ...updated.days[dayIdx], stars };
                return updated;
            });

            showToast("Calificación guardada");
        } catch (error) {
            if (!handleSheetsError(error)) {
                console.error("Failed to save rating:", error);
                showToast("Error al guardar calificación");
            }
        }
    };

    const handleConnectGoogle = () => {
        auth.login();
    };

    // Loading state: only show loader if we DON'T have initial server data
    // This avoids blocking SSR content while auth hydrates
    const hasInitialData = initialWeek?.days && initialWeek.days.length > 0;
    if (auth.isLoading && !hasInitialData) {
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
        localStorage.setItem("onboarding_completed_v1", "true");
        localStorage.removeItem("onboarding_dismissed_v1");
        localStorage.setItem(ONBOARDING_SYNC_ACTION_KEY, "complete");
        setShowOnboardingWizard(false);

        // Persist to server (reliable, cross-device)
        completeOnboarding()
            .then((res) => {
                if (res.ok) {
                    localStorage.removeItem(ONBOARDING_SYNC_ACTION_KEY);
                    auth.refresh();
                }
            })
            .catch((e) => console.error("Failed to persist onboarding complete:", e));

        // Refresh week data after onboarding
        try {
            const data = await fetchWeekData(selectedWeekId);
            setWeek(data.week);
            // Also refresh weeks list
            const fetchedWeeks = await fetchWeeksList();
            setWeeks(fetchedWeeks.sort((a, b) => a.id - b.id));
        } catch (e) {
            console.error("Failed to refresh data after onboarding:", e);
        }
    };

    const handleOnboardingSkip = () => {
        // Persist to localStorage (immediate, for compat/offline)
        localStorage.setItem("onboarding_dismissed_v1", "true");
        localStorage.setItem(ONBOARDING_SYNC_ACTION_KEY, "dismiss");
        setShowOnboardingWizard(false);

        // Persist to server (reliable, cross-device)
        dismissOnboarding()
            .then((res) => {
                if (res.ok) {
                    localStorage.removeItem(ONBOARDING_SYNC_ACTION_KEY);
                    auth.refresh();
                }
            })
            .catch((e) => console.error("Failed to persist onboarding dismiss:", e));
    };

    return (
        <div className="min-h-[calc(100dvh-(var(--bottom-nav-base)+env(safe-area-inset-bottom)))] w-full flex flex-col bg-[#F2F2F7] overflow-x-hidden">
            {/* Onboarding wizard for new users */}
            <OnboardingWizard
                isOpen={showOnboardingWizard}
                onComplete={handleOnboardingComplete}
                onSkip={handleOnboardingSkip}
                isSettingUp={isSettingUp}
                setupComplete={setupComplete || auth.hasSpreadsheet}
                setupError={setupError}
            />

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
                            onClick={() => setShowOnboardingWizard(true)}
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
                                        setSelectedWeekId(w.id);
                                        setSelectedWeekName(w.name);
                                        setShowWeekPicker(false);
                                        setCurrentDayIndex(0);
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
                            {/* Circular progress ring */}
                            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 40 40">
                                {/* Background circle */}
                                <circle
                                    cx="20"
                                    cy="20"
                                    r="18"
                                    fill="white"
                                    stroke="#E5E5EA"
                                    strokeWidth="2.5"
                                />
                                {/* Progress circle */}
                                <circle
                                    cx="20"
                                    cy="20"
                                    r="18"
                                    fill="none"
                                    stroke={routinePercentage === 100 ? "#34C759" : "#007AFF"}
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeDasharray={`${(routinePercentage / 100) * 113.1} 113.1`}
                                    className="transition-all duration-500"
                                />
                            </svg>
                            {/* Percentage text */}
                            <span className={`relative z-10 text-[10px] font-black tabular-nums ${routinePercentage === 100 ? "text-ios-green" : "text-black"}`}>
                                {routinePercentage}%
                            </span>
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
                                    key={item.name}
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
                        onSelect={setCurrentDayIndex}
                    />
                </div>
            )}

            {/* Active Day Content - fills remaining space */}
            <div className="flex-1 flex flex-col items-center justify-center relative min-h-0 -mt-4 overflow-hidden">
                {currentDay ? (
                    <div className="w-full max-w-sm h-full flex flex-col">
                        {/* Card Stack Container */}
                        <div className="w-full h-[420px] relative flex items-center justify-center px-4">
                            <Stack
                                cards={cardsToRender}
                                sensitivity={150}
                                randomRotation={true}
                                animationConfig={{ stiffness: 300, damping: 25 }}
                                disabled={isModalOpen || shouldShowCompletionCard}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="text-center p-8 text-ios-gray">
                        <p>No hay rutina programada para hoy.</p>
                    </div>
                )}
            </div>

            {/* Exercise Modal */}
            {selectedExercise && (
                <ExerciseModal
                    exercise={selectedExercise}
                    pr={prByExercise.get(normalizeExerciseKey(selectedExercise.name))}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSaveSeries}
                />
            )}

            {/* Session Rating Modal */}
            <SessionRatingModal
                isOpen={showRatingModal}
                onClose={() => setShowRatingModal(false)}
                onSave={handleSaveRating}
                dayName={currentDay ? `Día ${currentDay.id}` : undefined}
            />

            {/* Toast inferior */}
            {toastMessage && (
                <div className="fixed bottom-[calc(var(--bottom-nav-base)+env(safe-area-inset-bottom)+1rem)] left-1/2 -translate-x-1/2 z-50">
                    <div className="bg-black text-white px-4 py-3 rounded-full shadow-lg text-sm font-semibold">
                        {toastMessage}
                    </div>
                </div>
            )}
        </div>
    );
}
