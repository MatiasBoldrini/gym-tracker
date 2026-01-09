"use client";

import { useState, useEffect, useCallback } from "react";

interface AuthState {
    isLoading: boolean;
    isAuthenticated: boolean;
    hasSpreadsheet: boolean;
    spreadsheetId: string | null;
    userId: string | null;
}

export function useAuth() {
    const [state, setState] = useState<AuthState>({
        isLoading: true,
        isAuthenticated: false,
        hasSpreadsheet: false,
        spreadsheetId: null,
        userId: null,
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
            });
        } catch (error) {
            console.error("Error fetching auth state:", error);
            setState({
                isLoading: false,
                isAuthenticated: false,
                hasSpreadsheet: false,
                spreadsheetId: null,
                userId: null,
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

    const logout = useCallback(async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
            setState({
                isLoading: false,
                isAuthenticated: false,
                hasSpreadsheet: false,
                spreadsheetId: null,
                userId: null,
            });
        } catch (error) {
            console.error("Error logging out:", error);
        }
    }, []);

    return {
        ...state,
        refresh,
        logout,
        isSetupComplete: state.isAuthenticated && state.hasSpreadsheet,
    };
}










