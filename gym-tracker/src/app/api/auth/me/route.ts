import { NextResponse } from "next/server";
import { createClient, getUserIntegration } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo-data";

export async function GET() {
    try {
        if (DEMO_MODE) {
            return NextResponse.json({
                authenticated: true,
                hasSpreadsheet: true,
                spreadsheetId: "demo-sheet",
                email: "demo@gymtracker.app",
                userId: "demo-user",
                onboarding: {
                    version: 1,
                    completedAt: new Date().toISOString(),
                    dismissedAt: null,
                    hasCompleted: true,
                    hasDismissed: false,
                    shouldShow: false,
                    progress: null,
                    hasProgress: false,
                },
            });
        }
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({
                authenticated: false,
                hasSpreadsheet: false,
                spreadsheetId: null,
            });
        }

        const integration = await getUserIntegration();

        // Fetch onboarding preferences
        const { data: prefs, error: prefsError } = await supabase
            .from("user_preferences")
            .select("onboarding_version, onboarding_completed_at, onboarding_dismissed_at, onboarding_progress")
            .eq("user_id", user.id)
            .single();

        // Ensure preferences row exists (important for cross-device persistence).
        // PGRST116 = no rows found
        let ensuredPrefs = prefs ?? null;
        if (prefsError?.code === "PGRST116") {
            const now = new Date().toISOString();
            const { data: created, error: createError } = await supabase
                .from("user_preferences")
                .upsert(
                    {
                        user_id: user.id,
                        onboarding_version: 1,
                        updated_at: now,
                    },
                    { onConflict: "user_id" }
                )
                .select("onboarding_version, onboarding_completed_at, onboarding_dismissed_at, onboarding_progress")
                .single();

            if (createError) {
                console.error("Error ensuring user_preferences row:", createError);
            } else {
                ensuredPrefs = created ?? null;
            }
        } else if (prefsError) {
            console.error("Error fetching user_preferences:", prefsError);
        }

        return NextResponse.json({
            authenticated: true,
            hasSpreadsheet: !!integration?.spreadsheet_id,
            spreadsheetId: integration?.spreadsheet_id || null,
            email: user.email || null,
            userId: user.id,
            // Onboarding state from DB
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
        return NextResponse.json({ error: "Failed to get session" }, { status: 500 });
    }
}
