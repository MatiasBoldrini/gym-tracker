"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
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
