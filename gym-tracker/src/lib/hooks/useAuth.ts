"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient, GOOGLE_SCOPES } from "@/lib/supabase/client";

interface OnboardingState {
    version: number;
    completedAt: string | null;
    dismissedAt: string | null;
    hasCompleted: boolean;
    hasDismissed: boolean;
    shouldShow: boolean;
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
};

export function useAuth() {
    const [state, setState] = useState<AuthState>({
        isLoading: true,
        isAuthenticated: false,
        hasSpreadsheet: false,
        spreadsheetId: null,
        userId: null,
        email: null,
        onboarding: defaultOnboarding,
    });

    const fetchAuthState = useCallback(async () => {
        try {
            const response = await fetch("/api/auth/me");
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

    const refresh = useCallback(() => {
        setState((prev) => ({ ...prev, isLoading: true }));
        fetchAuthState();
    }, [fetchAuthState]);

    const login = useCallback(async () => {
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
        try {
            await fetch("/api/auth/logout", { method: "POST" });
            const supabase = createClient();
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

    return {
        ...state,
        refresh,
        login,
        logout,
        isSetupComplete: state.isAuthenticated && state.hasSpreadsheet,
    };
}
