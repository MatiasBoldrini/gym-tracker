"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient, GOOGLE_SCOPES } from "@/lib/supabase/client";
import { DEMO_MODE } from "@/lib/demo-data";

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

function useAuthState() {
    const [state, setState] = useState<AuthState>(
        DEMO_MODE
            ? demoAuthState
            : {
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
            const response = await fetch("/api/auth/me", {
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            });
            const data = await response.json();

            setState({
                isLoading: false,
                isAuthenticated: data.authenticated ?? false,
                hasSpreadsheet: data.hasSpreadsheet ?? false,
                spreadsheetId: data.spreadsheetId ?? null,
                userId: data.userId ?? null,
                email: data.email ?? null,
                onboarding: data.onboarding ?? defaultOnboarding,
            });
        } catch (error) {
            console.error("Error fetching auth state:", error);
            setState({
                isLoading: false,
                isAuthenticated: false,
                hasSpreadsheet: false,
                spreadsheetId: null,
                userId: null,
                email: null,
                onboarding: defaultOnboarding,
            });
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
