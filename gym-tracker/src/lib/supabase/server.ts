import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
    const cookieStore = await cookies();

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing user sessions.
                    }
                },
            },
        }
    );
}

export type UserIntegration = {
    user_id: string;
    email: string;
    spreadsheet_id: string | null;
    google_refresh_token_enc: string | null;
    created_at: string;
    updated_at: string;
};

/**
 * Get current user's integration data (spreadsheet_id, refresh_token, etc.)
 * Returns null if not authenticated or no integration exists.
 */
export async function getUserIntegration(): Promise<UserIntegration | null> {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return null;
    }

    const { data, error } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", user.id)
        .single();

    if (error || !data) {
        return null;
    }

    return data as UserIntegration;
}

/**
 * Upsert user integration data.
 */
export async function upsertUserIntegration(
    userId: string,
    data: Partial<Omit<UserIntegration, "user_id" | "created_at" | "updated_at">>
): Promise<UserIntegration | null> {
    const supabase = await createClient();

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
