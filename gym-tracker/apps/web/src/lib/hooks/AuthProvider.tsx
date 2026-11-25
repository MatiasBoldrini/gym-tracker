"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient, GOOGLE_SCOPES } from "@/lib/supabase/client";
import { DEMO_MODE } from "@/lib/demo-data";
import { clearRuntimeDataCaches } from "@/lib/pwa";
import { clearAccountStorage, clearLegacyAccountStorage } from "@/lib/account-storage";
import { AuthContext, AUTH_CACHE_KEY, clearAuthCache, type AuthState, type OnboardingState } from "./useAuth";

const AUTH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const defaultOnboarding: OnboardingState = {
    version: 1,
    completedAt: null,
    dismissedAt: null,
    hasCompleted: false,
    hasDismissed: false,
    shouldShow: true,
    progress: null,
    hasProgress: false,
};

const signedOutState: AuthState = {
    isLoading: false,
    isAuthenticated: false,
    hasSpreadsheet: false,
    spreadsheetId: null,
    userId: null,
    email: null,
    onboarding: defaultOnboarding,
};

const demoAuthState: AuthState = {
    isLoading: false,
    isAuthenticated: true,
    hasSpreadsheet: true,
    spreadsheetId: "demo-sheet",
    userId: "demo-user",
    email: "demo@gymtracker.app",
    onboarding: {
        ...defaultOnboarding,
        shouldShow: false,
        hasCompleted: true,
        completedAt: new Date().toISOString(),
    },
};

type AuthCachePayload = Pick<AuthState, "hasSpreadsheet" | "spreadsheetId" | "userId" | "onboarding"> & { cachedAt: number };

function readAuthCache(): AuthState | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(AUTH_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<AuthCachePayload> | null;
        if (!parsed?.userId || typeof parsed.cachedAt !== "number") return null;
        if (Date.now() - parsed.cachedAt > AUTH_CACHE_TTL_MS) return null;
        return {
            isLoading: false,
            isAuthenticated: true,
            hasSpreadsheet: !!parsed.hasSpreadsheet,
            spreadsheetId: parsed.spreadsheetId ?? null,
            userId: parsed.userId ?? null,
            email: null,
            onboarding: parsed.onboarding ?? defaultOnboarding,
        };
    } catch {
        return null;
    }
}

function writeAuthCache(state: AuthState) {
    if (typeof window === "undefined") return;
    try {
        const payload: AuthCachePayload = {
            hasSpreadsheet: state.hasSpreadsheet,
            spreadsheetId: state.spreadsheetId,
            userId: state.userId,
            onboarding: { ...state.onboarding, progress: null },
            cachedAt: Date.now(),
        };
        window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(payload));
    } catch {
        // Silenciar errores de storage (modo privado, cuota, etc.)
    }
}

function useAuthState() {
    const [state, setState] = useState<AuthState>(
        DEMO_MODE ? demoAuthState : { ...signedOutState, isLoading: true }
    );
    const requestId = useRef(0);
    const invalidateAuthRequest = useCallback(() => {
        requestId.current++;
    }, []);

    const fetchAuthState = useCallback(async () => {
        if (DEMO_MODE) return;
        const currentRequest = ++requestId.current;
        let fallback = signedOutState;
        try {
            const { data: { session } } = await createClient().auth.getSession();
            if (currentRequest !== requestId.current) return;
            if (!session) {
                clearAuthCache();
                setState(signedOutState);
                return;
            }

            const cached = readAuthCache();
            const account = {
                ...signedOutState,
                isAuthenticated: true,
                userId: session.user.id,
                email: session.user.email ?? null,
            };
            if (cached?.userId === session.user.id) fallback = { ...cached, email: account.email };
            setState((previous) => previous.userId === session.user.id
                ? previous
                : { ...account, isLoading: true }
            );

            const response = await fetch("/api/auth/me", {
                cache: "no-store",
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (currentRequest !== requestId.current) return;
            if (response.status === 401 || response.status === 403) {
                clearAuthCache();
                setState(signedOutState);
                return;
            }
            if (!response.ok) throw new Error(`Error de sesión (${response.status})`);
            const data = await response.json();
            if (currentRequest !== requestId.current) return;
            if (!data.authenticated || data.userId !== session.user.id) {
                clearAuthCache();
                setState(signedOutState);
                return;
            }

            const nextState = {
                ...account,
                hasSpreadsheet: !!data.hasSpreadsheet,
                spreadsheetId: data.spreadsheetId ?? null,
                email: data.email ?? account.email,
                onboarding: data.onboarding ?? defaultOnboarding,
            };
            writeAuthCache(nextState);
            setState(nextState);
        } catch (error) {
            if (currentRequest !== requestId.current) return;
            console.error("Error fetching auth state:", error);
            setState(fallback);
        }
    }, []);

    useEffect(() => {
        if (DEMO_MODE) return;
        clearLegacyAccountStorage();
        const supabase = createClient();
        let refreshTimer: ReturnType<typeof setTimeout> | undefined;
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            clearTimeout(refreshTimer);
            if (event === "SIGNED_OUT") {
                invalidateAuthRequest();
                clearAuthCache();
                setState(signedOutState);
                return;
            }

            setState((previous) => previous.userId && previous.userId !== session?.user.id
                ? { ...signedOutState, isLoading: true }
                : previous
            );
            invalidateAuthRequest();
            // Supabase emits auth callbacks while holding its session lock.
            refreshTimer = setTimeout(() => void fetchAuthState(), 0);
        });
        return () => {
            invalidateAuthRequest();
            clearTimeout(refreshTimer);
            data.subscription.unsubscribe();
        };
    }, [fetchAuthState, invalidateAuthRequest]);

    const refresh = useCallback(() => {
        if (DEMO_MODE) {
            setState(demoAuthState);
            return;
        }
        setState((prev) => ({ ...prev, isLoading: true }));
        fetchAuthState();
    }, [fetchAuthState]);

    const login = useCallback(async () => {
        if (DEMO_MODE) {
            setState(demoAuthState);
            return;
        }
        const supabase = createClient();
        const redirectTo = `${window.location.origin}/auth/callback`;

        await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                scopes: GOOGLE_SCOPES,
                queryParams: {
                    access_type: "offline",
                    prompt: "consent",
                },
                redirectTo,
            },
        });
    }, []);

    const logout = useCallback(async () => {
        if (DEMO_MODE) {
            setState(demoAuthState);
            return;
        }
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            requestId.current++;
            clearAuthCache();
            if (session?.user.id) clearAccountStorage(session.user.id);
            setState(signedOutState);
            void clearRuntimeDataCaches();
        } catch (error) {
            console.error("Error logging out:", error);
        }
    }, []);

    return useMemo(
        () => ({
            ...state,
            refresh,
            login,
            logout,
            isSetupComplete: state.isAuthenticated && state.hasSpreadsheet,
        }),
        [state, refresh, login, logout]
    );
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const value = useAuthState();
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

