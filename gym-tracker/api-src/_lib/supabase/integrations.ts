import type { SupabaseClient } from "@supabase/supabase-js";

export type UserIntegration = {
    user_id: string;
    email: string | null;
    spreadsheet_id: string | null;
    google_refresh_token_enc: string | null;
    created_at: string;
    updated_at: string;
};

export async function getUserIntegration(
    supabase: SupabaseClient,
    userId: string
): Promise<UserIntegration | null> {
    const { data, error } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", userId)
        .single();

    if (error || !data) {
        return null;
    }

    return data as UserIntegration;
}

export async function upsertUserIntegration(
    supabase: SupabaseClient,
    userId: string,
    data: Partial<Omit<UserIntegration, "user_id" | "created_at" | "updated_at">>
): Promise<UserIntegration | null> {
    const { data: result, error } = await supabase
        .from("user_integrations")
        .upsert(
            {
                user_id: userId,
                ...data,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        )
        .select()
        .single();

    if (error) {
        console.error("Error upserting user integration:", error);
        return null;
    }

    return result as UserIntegration;
}
