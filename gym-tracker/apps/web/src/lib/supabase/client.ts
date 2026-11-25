import { createClient as createSupabaseClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createSupabaseClient> | null = null;

export function createClient() {
    if (client) return client;
    client = createSupabaseClient(
        import.meta.env.VITE_SUPABASE_URL!,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                // AuthCallbackPage owns the exchange and registers the Google integration.
                detectSessionInUrl: false,
            },
        }
    );
    return client;
}

// Scopes needed for Google Sheets/Drive access
// - spreadsheets: read/write spreadsheet data
// - drive.readonly: needed to READ the public template for copying
// - drive.file: needed to CREATE/WRITE the user's copy
export const GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
].join(" ");
