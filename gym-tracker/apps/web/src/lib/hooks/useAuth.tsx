"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient, GOOGLE_SCOPES } from "@/lib/supabase/client";
import { DEMO_MODE } from "@/lib/demo-data";
import { clearRuntimeDataCaches } from "@/lib/pwa";

interface OnboardingState {
    version: number;
    completedAt: string | null;
    dismissedAt: string | null;
    hasCompleted: boolean;
    hasDismissed: boolean;
    shouldShow: boolean;
    progress: any | null;
    hasProgress: boolean;
}

interface AuthState {
    isLoading: boolean;
    isAuthenticated: boolean;
    hasSpreadsheet: boolean;
    spreadsheetId: string | null;
    userId: string | null;
    email: string | null;
    onboarding: OnboardingState;
}

const AUTH_CACHE_KEY = "gymtracker.auth.cache";
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

type AuthContextValue = AuthState & {
    refresh: () => void;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    isSetupComplete: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthCachePayload = Omit<AuthState, "isLoading"> & { cachedAt: number };

function readAuthCache(): AuthState | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(AUTH_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<AuthCachePayload> | null;
        if (!parsed || typeof parsed.cachedAt !== "number") return null;
        if (Date.now() - parsed.cachedAt > AUTH_CACHE_TTL_MS) return null;
        return {
            isLoading: false,
            isAuthenticated: !!parsed.isAuthenticated,
            hasSpreadsheet: !!parsed.hasSpreadsheet,
            spreadsheetId: parsed.spreadsheetId ?? null,
            userId: parsed.userId ?? null,
            email: parsed.email ?? null,
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
            isAuthenticated: state.isAuthenticated,
            hasSpreadsheet: state.hasSpreadsheet,
            spreadsheetId: state.spreadsheetId,
            userId: state.userId,
            email: state.email,
            onboarding: state.onboarding,
            cachedAt: Date.now(),
        };
        window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(payload));
    } catch {
        // Silenciar errores de storage (modo privado, cuota, etc.)
    }
}

export function clearAuthCache() {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(AUTH_CACHE_KEY);
    } catch {
        // Silenciar errores de storage
    }
}

function useAuthState() {
    const [state, setState] = useState<AuthState>(
        DEMO_MODE
            ? demoAuthState
            : readAuthCache() ?? {
                isLoading: true,
                isAuthenticated: false,
                hasSpreadsheet: false,
                spreadsheetId: null,
                userId: null,
                email: null,
                onboarding: defaultOnboarding,
            }
    );

    const fetchAuthState = useCallback(async () => {
        if (DEMO_MODE) {
            setState(demoAuthState);
            return;
        }
        try {
            const supabase = createClient();
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;
            if (!accessToken) {
                clearAuthCache();
                setState({
                    isLoading: false,
                    isAuthenticated: false,
                    hasSpreadsheet: false,
                    spreadsheetId: null,
                    userId: null,
                    email: null,
                    onboarding: defaultOnboarding,
                });
                return;
            }
            setState((prev) =>
                prev.isAuthenticated
                    ? { ...prev, isLoading: false }
                    : {
                        ...prev,
                        isLoading: false,
                        isAuthenticated: true,
                    }
            );
            const response = await fetch("/api/auth/me", {
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            });
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                throw new Error("Respuesta inesperada de /api/auth/me");
            }
            const data = await response.json();

            const nextState = {
                isLoading: false,
                isAuthenticated: data.authenticated ?? false,
                hasSpreadsheet: data.hasSpreadsheet ?? false,
                spreadsheetId: data.spreadsheetId ?? null,
                userId: data.userId ?? null,
                email: data.email ?? null,
                onboarding: data.onboarding ?? defaultOnboarding,
            };
            setState(nextState);
            if (nextState.isAuthenticated) {
                writeAuthCache(nextState);
            } else {
                clearAuthCache();
            }
        } catch (error) {
            console.error("Error fetching auth state:", error);
            setState((prev) =>
                prev.isAuthenticated
                    ? { ...prev, isLoading: false }
                    : {
                        isLoading: false,
                        isAuthenticated: false,
                        hasSpreadsheet: false,
                        spreadsheetId: null,
                        userId: null,
                        email: null,
                        onboarding: defaultOnboarding,
                    }
            );
        }
    }, []);

    useEffect(() => {
        fetchAuthState();
    }, [fetchAuthState]);

    useEffect(() => {
        if (DEMO_MODE) return;
        const supabase = createClient();
        const { data } = supabase.auth.onAuthStateChange(() => {
            fetchAuthState();
        });
        return () => {
            data.subscription.unsubscribe();
        };
    }, [fetchAuthState]);

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
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;
            await fetch("/api/auth/logout", {
                method: "POST",
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            });
            await supabase.auth.signOut();
            await clearRuntimeDataCaches();
            clearAuthCache();
            setState({
                isLoading: false,
                isAuthenticated: false,
                hasSpreadsheet: false,
                spreadsheetId: null,
                userId: null,
                email: null,
                onboarding: defaultOnboarding,
            });
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

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth debe usarse dentro de AuthProvider");
    }
    return ctx;
}
