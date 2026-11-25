import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { useAuth, clearAuthCache } from "@/lib/hooks/useAuth";
import { clearRuntimeDataCaches } from "@/lib/pwa";

async function finishCallback(search: string, hash: string): Promise<string> {
    const code = new URLSearchParams(search).get("code");
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    try {
        const supabase = createClient();
        const sessionResult = code
            ? await supabase.auth.exchangeCodeForSession(code)
            : accessToken && refreshToken
                ? await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
                : null;
        if (!sessionResult || sessionResult.error || !sessionResult.data.session) {
            return "/?auth_error=callback_failed";
        }

        clearAuthCache();
        await clearRuntimeDataCaches();

        const session = sessionResult.data.session;
        const providerRefreshToken = session.provider_refresh_token || params.get("provider_refresh_token");
        const response = await fetch("/api/auth/callback", {
            method: "POST",
            cache: "no-store",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(providerRefreshToken ? { providerRefreshToken } : {}),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload || payload.error) {
            const error = payload?.code === "NO_REFRESH_TOKEN" ? "no_refresh_token" : "callback_failed";
            return `/?auth_error=${error}`;
        }
        return payload.setup_pending
            ? "/?auth_success=true&setup_pending=true&is_new_user=true"
            : "/?auth_success=true";
    } catch {
        return "/?auth_error=callback_failed";
    }
}

export function AuthCallbackPage() {
    const navigate = useNavigate();
    const { search, hash } = useLocation();
    const { refresh } = useAuth();
    const pendingCallback = useRef<Promise<string> | null>(null);

    useEffect(() => {
        let cancelled = false;
        // Strict Mode can rerun this effect. Share the exchange so each code is consumed only once.
        pendingCallback.current ??= finishCallback(search, hash);
        void pendingCallback.current.then((destination) => {
            if (cancelled) return;
            refresh();
            navigate(destination, { replace: true });
        });
        return () => {
            cancelled = true;
        };
    }, [search, hash, navigate, refresh]);

    return (
        <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#F2F2F7]">
            <div className="w-10 h-10 border-4 border-ios-blue/20 border-t-ios-blue rounded-full animate-spin" />
            <p className="mt-4 text-sm font-bold text-gray-400">Conectando...</p>
        </div>
    );
}
