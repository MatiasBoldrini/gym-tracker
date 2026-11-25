import { createContext, useContext } from "react";

export const AUTH_CACHE_KEY = "gymtracker.auth.cache";

export interface OnboardingState {
    version: number;
    completedAt: string | null;
    dismissedAt: string | null;
    hasCompleted: boolean;
    hasDismissed: boolean;
    shouldShow: boolean;
    progress: unknown;
    hasProgress: boolean;
}

export interface AuthState {
    isLoading: boolean;
    isAuthenticated: boolean;
    hasSpreadsheet: boolean;
    spreadsheetId: string | null;
    userId: string | null;
    email: string | null;
    onboarding: OnboardingState;
}

type AuthContextValue = AuthState & {
    refresh: () => void;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    isSetupComplete: boolean;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function clearAuthCache() {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(AUTH_CACHE_KEY);
    } catch {
        // Silenciar errores de storage
    }
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth debe usarse dentro de AuthProvider");
    }
    return ctx;
}
