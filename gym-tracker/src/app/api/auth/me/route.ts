import { NextResponse } from "next/server";
import { createClient, getUserIntegration } from "@/lib/supabase/server";

export async function GET() {
    try {
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
        const { data: prefs } = await supabase
            .from("user_preferences")
            .select("onboarding_version, onboarding_completed_at, onboarding_dismissed_at, onboarding_progress")
            .eq("user_id", user.id)
            .single();

        return NextResponse.json({
            authenticated: true,
            hasSpreadsheet: !!integration?.spreadsheet_id,
            spreadsheetId: integration?.spreadsheet_id || null,
            email: user.email || null,
            userId: user.id,
            // Onboarding state from DB
            onboarding: {
                version: prefs?.onboarding_version ?? 1,
                completedAt: prefs?.onboarding_completed_at ?? null,
                dismissedAt: prefs?.onboarding_dismissed_at ?? null,
                hasCompleted: !!prefs?.onboarding_completed_at,
                hasDismissed: !!prefs?.onboarding_dismissed_at,
                shouldShow: !prefs?.onboarding_completed_at && !prefs?.onboarding_dismissed_at,
                progress: prefs?.onboarding_progress ?? null,
                hasProgress: !!prefs?.onboarding_progress,
            },
        });
    } catch (error) {
        console.error("Error getting session:", error);
        return NextResponse.json({ error: "Failed to get session" }, { status: 500 });
    }
}
