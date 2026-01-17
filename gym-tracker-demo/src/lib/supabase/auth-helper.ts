import { createClient, getUserIntegration } from "./server";
import { decrypt } from "@/lib/crypto";

export type AuthContext = {
    userId: string;
    email: string;
    spreadsheetId: string;
    refreshToken: string;
};

/**
 * Get auth context for API routes.
 * Returns user info + spreadsheet credentials, or throws/returns null if not authenticated.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return null;
    }

    const integration = await getUserIntegration();
    if (!integration) {
        return null;
    }

    if (!integration.google_refresh_token_enc) {
        return null;
    }

    if (!integration.spreadsheet_id) {
        return null;
    }

    // Decrypt refresh token
    let refreshToken: string;
    try {
        refreshToken = await decrypt(integration.google_refresh_token_enc);
    } catch {
        console.error("Failed to decrypt refresh token");
        return null;
    }

    return {
        userId: user.id,
        email: integration.email,
        spreadsheetId: integration.spreadsheet_id,
        refreshToken,
    };
}

/**
 * Check if user is authenticated (has valid Supabase session).
 */
export async function isAuthenticated(): Promise<boolean> {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    return !error && !!user;
}
