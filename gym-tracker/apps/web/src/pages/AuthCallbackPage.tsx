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

                console.log("[AuthCallback] code:", code);
                console.log("[AuthCallback] accessToken:", accessToken ? "present" : "none");
                console.log("[AuthCallback] providerRefreshToken:", providerRefreshToken ? "present" : "none");

                let session = null;

                if (code) {
                    // PKCE flow: exchange code for session
                    console.log("[AuthCallback] Using PKCE flow...");
                    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
                    if (error) throw error;
                    session = data.session;
                } else if (accessToken && refreshToken) {
                    // Implicit flow: set session from hash tokens
                    console.log("[AuthCallback] Using implicit flow, setting session...");
                    const { data, error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                    });
                    if (error) throw error;
                    session = data.session;
                }

                if (session) {
                    console.log("[AuthCallback] Session established:", session.user?.email);

                    // Evita que el SW devuelva 401 cacheados (pre-login) o datos de otro usuario.
                    await clearRuntimeDataCaches();

                    // Get provider refresh token (from session or hash)
                    const googleRefreshToken = session.provider_refresh_token || providerRefreshToken;

                    if (googleRefreshToken) {
                        console.log("[AuthCallback] Saving provider refresh token...");
                        const res = await fetch("/api/auth/callback", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${session.access_token}`,
                            },
                            body: JSON.stringify({ providerRefreshToken: googleRefreshToken }),
                        });
                        const json = await res.json().catch(() => ({}));
                        console.log("[AuthCallback] Callback response:", json);

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
                    } else {
                        // No provider refresh token, just redirect
                        console.log("[AuthCallback] No provider refresh token, redirecting...");
                        if (!cancelled) {
                            didRedirect = true;
                            auth.refresh();
                            navigate("/?auth_success=true", { replace: true });
                        }
                        return;
                    }
                }

                console.log("[AuthCallback] No code or tokens found");
            } catch (e) {
                console.error("[AuthCallback] Error:", e);
            } finally {
                if (!cancelled && !didRedirect) {
                    navigate("/?auth_success=true", { replace: true });
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
