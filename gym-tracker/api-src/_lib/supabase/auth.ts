import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../crypto";

export type AuthContext = {
    userId: string;
    email: string | null;
    spreadsheetId: string;
    refreshToken: string;
};

export type AuthContextErrorCode =
    | "NO_AUTH"
    | "NO_INTEGRATION"
    | "NO_SPREADSHEET"
    | "NO_REFRESH_TOKEN"
    | "CONFIG_TOKEN_ENCRYPTION_KEY"
    | "DECRYPT_REFRESH_TOKEN_FAILED";

export type AuthContextResult =
    | { ok: true; ctx: AuthContext }
    | { ok: false; status: number; code: AuthContextErrorCode; message: string };

const SUPABASE_FETCH_TIMEOUT_MS = 10_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);

    // If caller already passed a signal, combine them (when supported)
    const signal =
        init?.signal && typeof (AbortSignal as any)?.any === "function"
            ? (AbortSignal as any).any([init.signal, controller.signal])
            : controller.signal;

    return fetch(input, { ...init, signal }).finally(() => clearTimeout(timeout));
}

function getSupabaseClient(accessToken?: string) {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
        {
            global: accessToken
                ? { headers: { Authorization: `Bearer ${accessToken}` }, fetch: fetchWithTimeout as any }
                : { fetch: fetchWithTimeout as any },
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        }
    );
}

function getBearerToken(authHeader?: string | null): string | null {
    if (!authHeader) return null;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
}

export async function getUserFromRequest(authHeader?: string | null) {
    const token = getBearerToken(authHeader);
    if (!token) return null;
    const supabase = getSupabaseClient(token);
    try {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) return null;
        return { user: data.user, token, supabase };
    } catch (e) {
        console.error("getUserFromRequest failed:", e);
        return null;
    }
}

function isTokenEncryptionKeyError(err: any): boolean {
    const msg = String(err?.message || "").toLowerCase();
    return msg.includes("token_encryption_key") && (msg.includes("at least") || msg.includes("mínimo") || msg.includes("minimum"));
}

export async function getAuthContextResult(authHeader?: string | null): Promise<AuthContextResult> {
    const auth = await getUserFromRequest(authHeader);
    if (!auth) {
        return { ok: false, status: 401, code: "NO_AUTH", message: "No autenticado" };
    }

    const { data: integration, error } = await auth.supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", auth.user.id)
        .single();

    if (error || !integration) {
        return {
            ok: false,
            status: 401,
            code: "NO_INTEGRATION",
            message: "No se encontró la integración del usuario. Volvé a iniciar sesión y reconectá Google.",
        };
    }

    if (!integration.spreadsheet_id) {
        return {
            ok: false,
            status: 401,
            code: "NO_SPREADSHEET",
            message: "Tu cuenta todavía no tiene una planilla configurada. Volvé a conectar y completá el setup.",
        };
    }

    if (!integration.google_refresh_token_enc) {
        return {
            ok: false,
            status: 401,
            code: "NO_REFRESH_TOKEN",
            message: "No hay token de Google guardado. Cerrá sesión y volvé a conectar tu cuenta de Google.",
        };
    }

    let refreshToken: string;
    try {
        refreshToken = await decrypt(integration.google_refresh_token_enc);
    } catch (e: any) {
        if (isTokenEncryptionKeyError(e)) {
            return {
                ok: false,
                status: 500,
                code: "CONFIG_TOKEN_ENCRYPTION_KEY",
                message: "Falta configurar TOKEN_ENCRYPTION_KEY en el server (mínimo 32 caracteres).",
            };
        }
        return {
            ok: false,
            status: 401,
            code: "DECRYPT_REFRESH_TOKEN_FAILED",
            message:
                "No pudimos leer tu autorización de Google. Cerrá sesión y volvé a conectar tu cuenta de Google (puede haber cambiado una configuración del servidor).",
        };
    }

    return {
        ok: true,
        ctx: {
            userId: auth.user.id,
            email: integration.email ?? auth.user.email ?? null,
            spreadsheetId: integration.spreadsheet_id,
            refreshToken,
        },
    };
}

export async function getAuthContext(authHeader?: string | null): Promise<AuthContext | null> {
    const res = await getAuthContextResult(authHeader);
    return res.ok ? res.ctx : null;
}
