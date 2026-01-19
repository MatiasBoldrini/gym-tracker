import { Hono } from "hono";
import { handle } from "hono/vercel";
import { getUserFromRequest } from "./_lib/supabase/auth";
import { getUserIntegration, upsertUserIntegration } from "./_lib/supabase/integrations";
import { encrypt } from "./_lib/crypto";

const app = new Hono().basePath("/api/auth");

function getAuthHeader(c: any) {
    return c.req.header("Authorization") ?? null;
}

function jsonError(c: any, message: string, status = 500, code?: string) {
    return c.json({ error: message, code }, status);
}

// Endpoint de diagnóstico: no toca Supabase (sirve para aislar si el problema es el runtime/routing)
app.get("/ping", (c) => {
    return c.json({ ok: true, ts: new Date().toISOString() });
});

app.get("/me", async (c) => {
    try {
        const auth = await getUserFromRequest(getAuthHeader(c));
        if (!auth) {
            return c.json({
                authenticated: false,
                hasSpreadsheet: false,
                spreadsheetId: null,
            });
        }

        const integration = await getUserIntegration(auth.supabase, auth.user.id);

        const { data: prefs, error: prefsError } = await auth.supabase
            .from("user_preferences")
            .select("onboarding_version, onboarding_completed_at, onboarding_dismissed_at, onboarding_progress")
            .eq("user_id", auth.user.id)
            .single();

        let ensuredPrefs = prefs ?? null;
        if (prefsError?.code === "PGRST116") {
            const now = new Date().toISOString();
            const { data: created, error: createError } = await auth.supabase
                .from("user_preferences")
                .upsert(
                    {
                        user_id: auth.user.id,
                        onboarding_version: 1,
                        updated_at: now,
                    },
                    { onConflict: "user_id" }
                )
                .select("onboarding_version, onboarding_completed_at, onboarding_dismissed_at, onboarding_progress")
                .single();
            if (!createError) {
                ensuredPrefs = created ?? null;
            }
        } else if (prefsError) {
            console.error("Error fetching user_preferences:", prefsError);
        }

        return c.json({
            authenticated: true,
            hasSpreadsheet: !!integration?.spreadsheet_id,
            spreadsheetId: integration?.spreadsheet_id || null,
            email: auth.user.email || null,
            userId: auth.user.id,
            onboarding: {
                version: ensuredPrefs?.onboarding_version ?? 1,
                completedAt: ensuredPrefs?.onboarding_completed_at ?? null,
                dismissedAt: ensuredPrefs?.onboarding_dismissed_at ?? null,
                hasCompleted: !!ensuredPrefs?.onboarding_completed_at,
                hasDismissed: !!ensuredPrefs?.onboarding_dismissed_at,
                shouldShow: !ensuredPrefs?.onboarding_completed_at && !ensuredPrefs?.onboarding_dismissed_at,
                progress: ensuredPrefs?.onboarding_progress ?? null,
                hasProgress: !!ensuredPrefs?.onboarding_progress,
            },
        });
    } catch (error) {
        console.error("Error getting session:", error);
        return jsonError(c, "Failed to get session", 500);
    }
});

app.post("/logout", async (c) => {
    return c.json({ ok: true });
});

app.post("/callback", async (c) => {
    try {
        const auth = await getUserFromRequest(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);
        const body = await c.req.json();
        const providerRefreshToken = body?.providerRefreshToken;
        if (!providerRefreshToken) {
            return jsonError(c, "No provider_refresh_token recibido", 400);
        }

        const encryptedRefreshToken = await encrypt(providerRefreshToken);
        const existing = await getUserIntegration(auth.supabase, auth.user.id);
        const hasSpreadsheet = !!existing?.spreadsheet_id;

        const updated = await upsertUserIntegration(auth.supabase, auth.user.id, {
            email: auth.user.email ?? null,
            google_refresh_token_enc: encryptedRefreshToken,
            spreadsheet_id: existing?.spreadsheet_id || null,
        });
        if (!updated) {
            return jsonError(c, "Error al guardar la integración", 500);
        }

        return c.json({
            ok: true,
            setup_pending: !hasSpreadsheet,
            is_new_user: !hasSpreadsheet,
        });
    } catch (error: any) {
        console.error("Error in auth callback:", error);
        return jsonError(c, "auth_callback_failed", 500);
    }
});

export default handle(app);
