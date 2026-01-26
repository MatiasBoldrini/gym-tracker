import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { clearRuntimeDataCaches } from "@/lib/pwa";

function parseHashParams(hash: string): Record<string, string> {
    if (!hash || hash.length <= 1) return {};
    const params = new URLSearchParams(hash.substring(1)); // remove leading #
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}

export function AuthCallbackPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const auth = useAuth();

    useEffect(() => {
        let cancelled = false;
        let didRedirect = false;
        let hadError = false;

        const run = async () => {
            try {
                const supabase = createClient();

                // Check for PKCE flow (code in query string)
                const queryParams = new URLSearchParams(location.search);
                const code = queryParams.get("code");

                // Check for implicit flow (tokens in hash)
                const hashParams = parseHashParams(location.hash);
                const accessToken = hashParams.access_token;
                const refreshToken = hashParams.refresh_token;
                const providerRefreshToken = hashParams.provider_refresh_token;

                let session = null;

                if (code) {
                    // PKCE flow: exchange code for session
                    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
                    if (error) throw error;
                    session = data.session;
                } else if (accessToken && refreshToken) {
                    // Implicit flow: set session from hash tokens
                    const { data, error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                    });
                    if (error) throw error;
                    session = data.session;
                }

                if (session) {
                    // Evita que el SW devuelva 401 cacheados (pre-login) o datos de otro usuario.
                    await clearRuntimeDataCaches();

                    // Get provider refresh token (from session or hash)
                    const googleRefreshToken = session.provider_refresh_token || providerRefreshToken;

                    // Intentamos siempre llamar al callback del backend. Si Google no devuelve refresh token
                    // (común en logins repetidos), el backend lo tolera si ya hay uno guardado.
                    const res = await fetch("/api/auth/callback", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify(googleRefreshToken ? { providerRefreshToken: googleRefreshToken } : {}),
                    });
                    const json = await res.json().catch(() => ({}));

                    // Verificar que el callback fue exitoso
                    if (!res.ok || json?.error) {
                        const code = json?.code;
                        const errParam = code === "NO_REFRESH_TOKEN" ? "no_refresh_token" : "callback_failed";
                        if (!cancelled) {
                            didRedirect = true;
                            auth.refresh();
                            navigate(`/?auth_error=${errParam}`, { replace: true });
                        }
                        return;
                    }

                    const paramsOut = new URLSearchParams();
                    paramsOut.set("auth_success", "true");
                    if (json?.setup_pending) {
                        paramsOut.set("setup_pending", "true");
                        paramsOut.set("is_new_user", "true");
                    }

                    if (!cancelled) {
                        didRedirect = true;
                        auth.refresh();
                        navigate(`/?${paramsOut.toString()}`, { replace: true });
                    }
                    return;
                }

                hadError = true;
            } catch (e) {
                hadError = true;
                console.error("[AuthCallback] Error:", e);
            } finally {
                if (!cancelled && !didRedirect) {
                    navigate(hadError ? "/?auth_error=callback_failed" : "/?auth_success=true", { replace: true });
                }
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [location.search, location.hash, navigate, auth]);

    return (
        <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#F2F2F7]">
            <div className="w-10 h-10 border-4 border-ios-blue/20 border-t-ios-blue rounded-full animate-spin" />
            <p className="mt-4 text-sm font-bold text-gray-400">Conectando...</p>
        </div>
    );
}
