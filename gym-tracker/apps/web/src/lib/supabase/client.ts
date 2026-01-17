import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createClient() {
    return createSupabaseClient(
        import.meta.env.VITE_SUPABASE_URL!,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
            },
        }
    );
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
