import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../crypto";

export type AuthContext = {
    userId: string;
    email: string | null;
    spreadsheetId: string;
    refreshToken: string;
};

function getSupabaseClient(accessToken?: string) {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
        {
            global: accessToken
                ? { headers: { Authorization: `Bearer ${accessToken}` } }
                : undefined,
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
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return { user: data.user, token, supabase };
}

export async function getAuthContext(authHeader?: string | null): Promise<AuthContext | null> {
    const auth = await getUserFromRequest(authHeader);
    if (!auth) return null;

    const { data: integration, error } = await auth.supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", auth.user.id)
        .single();

    if (error || !integration) return null;
    if (!integration.spreadsheet_id || !integration.google_refresh_token_enc) return null;

    let refreshToken: string;
    try {
        refreshToken = await decrypt(integration.google_refresh_token_enc);
    } catch {
        return null;
    }

    return {
        userId: auth.user.id,
        email: integration.email ?? auth.user.email ?? null,
        spreadsheetId: integration.spreadsheet_id,
        refreshToken,
    };
}
