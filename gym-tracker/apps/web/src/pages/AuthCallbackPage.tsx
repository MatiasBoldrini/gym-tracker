import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";

export function AuthCallbackPage() {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        let cancelled = false;
        let didRedirect = false;
        const run = async () => {
            try {
                const supabase = createClient();
                // Supabase usa ?code=... en el redirect OAuth (PKCE)
                const params = new URLSearchParams(location.search);
                const code = params.get("code");
                if (code) {
                    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
                    if (error) throw error;
                    const session = data.session;
                    const providerRefreshToken = session?.provider_refresh_token;
                    if (providerRefreshToken) {
                        const accessToken = session?.access_token;
                        const res = await fetch("/api/auth/callback", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                            },
                            body: JSON.stringify({ providerRefreshToken }),
                        });
                        const json = await res.json().catch(() => ({}));
                        const paramsOut = new URLSearchParams();
                        paramsOut.set("auth_success", "true");
                        if (json?.setup_pending) {
                            paramsOut.set("setup_pending", "true");
                            paramsOut.set("is_new_user", "true");
                        }
                        if (!cancelled) {
                            didRedirect = true;
                            navigate(`/?${paramsOut.toString()}`, { replace: true });
                        }
                        return;
                    }
                }
            } catch (e) {
                console.error("Auth callback error:", e);
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
    }, [location.search, navigate]);

    return (
        <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#F2F2F7]">
            <div className="w-10 h-10 border-4 border-ios-blue/20 border-t-ios-blue rounded-full animate-spin" />
            <p className="mt-4 text-sm font-bold text-gray-400">Conectando...</p>
        </div>
    );
}
