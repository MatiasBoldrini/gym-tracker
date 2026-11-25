import { useEffect, useMemo, useState } from "react";
import { accountScope, readAccountStorage, writeAccountStorage } from "@/lib/account-storage";
import { useAuth } from "@/lib/hooks/useAuth";
import { DEMO_MODE } from "@/lib/demo-data";
import { authFetch } from "@/lib/sheets-client";

type Result<T> = {
    scope: string;
    data: T | null;
    error: string | null;
};

export function useAccountResource<T>(endpoint: string, name: string, parse: (payload: unknown) => T) {
    const { userId, spreadsheetId, isAuthenticated, isLoading, hasSpreadsheet } = useAuth();
    const scope = !DEMO_MODE && isAuthenticated && hasSpreadsheet && userId && spreadsheetId
        ? accountScope(userId, spreadsheetId)
        : null;
    const cached = useMemo(() => readAccountStorage<T>(scope, name), [scope, name]);
    const [result, setResult] = useState<Result<T> | null>(null);
    const latest = scope && result?.scope === scope ? result : null;

    useEffect(() => {
        if (!scope || !userId || isLoading) return;
        const controller = new AbortController();

        async function load(currentScope: string, currentUserId: string) {
            try {
                const response = await authFetch(endpoint, { signal: controller.signal }, currentUserId);
                if (!response.ok) {
                    const payload = await response.json().catch(() => null);
                    throw new Error(payload?.error || `Error ${response.status}`);
                }

                const data = parse(await response.json());
                if (controller.signal.aborted) return;
                writeAccountStorage(currentScope, name, data);
                setResult({ scope: currentScope, data, error: null });
            } catch (error) {
                if (controller.signal.aborted) return;
                setResult({
                    scope: currentScope,
                    data: null,
                    error: error instanceof Error ? error.message : "No pudimos cargar los datos.",
                });
            }
        }

        void load(scope, userId);
        return () => controller.abort();
    }, [endpoint, isLoading, name, parse, scope, userId]);

    return {
        scope,
        data: latest?.data ?? cached,
        error: latest?.error ?? null,
        loading: !!scope && !latest,
    };
}
