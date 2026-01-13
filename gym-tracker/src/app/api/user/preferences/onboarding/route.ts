import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CURRENT_ONBOARDING_VERSION = 1;

export interface OnboardingPreferences {
    onboarding_version: number;
    onboarding_completed_at: string | null;
    onboarding_dismissed_at: string | null;
}

/**
 * GET /api/user/preferences/onboarding
 * Get current user's onboarding preferences
 */
export async function GET() {
    try {
        const supabase = await createClient();
        
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { error: "No autenticado" },
                { status: 401 }
            );
        }

        const { data: prefs, error } = await supabase
            .from("user_preferences")
            .select("onboarding_version, onboarding_completed_at, onboarding_dismissed_at")
            .eq("user_id", user.id)
            .single();

        if (error && error.code !== "PGRST116") {
            // PGRST116 = no rows found (not an error for us)
            console.error("Error fetching preferences:", error);
            return NextResponse.json(
                { error: "Error al obtener preferencias" },
                { status: 500 }
            );
        }

        // Return preferences or defaults
        return NextResponse.json({
            onboarding_version: prefs?.onboarding_version ?? CURRENT_ONBOARDING_VERSION,
            onboarding_completed_at: prefs?.onboarding_completed_at ?? null,
            onboarding_dismissed_at: prefs?.onboarding_dismissed_at ?? null,
            // Computed flags for convenience
            hasCompletedOnboarding: !!prefs?.onboarding_completed_at,
            hasDismissedOnboarding: !!prefs?.onboarding_dismissed_at,
            shouldShowOnboarding: !prefs?.onboarding_completed_at && !prefs?.onboarding_dismissed_at,
        });
    } catch (error) {
        console.error("Error in onboarding preferences GET:", error);
        return NextResponse.json(
            { error: "Error interno" },
            { status: 500 }
        );
    }
}

interface UpdateOnboardingBody {
    action: "complete" | "dismiss";
}

/**
 * POST /api/user/preferences/onboarding
 * Update onboarding state (complete or dismiss)
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { error: "No autenticado" },
                { status: 401 }
            );
        }

        const body: UpdateOnboardingBody = await request.json();
        const { action } = body;

        if (action !== "complete" && action !== "dismiss") {
            return NextResponse.json(
                { error: "action debe ser 'complete' o 'dismiss'" },
                { status: 400 }
            );
        }

        const now = new Date().toISOString();
        const updateData = action === "complete"
            ? { 
                onboarding_completed_at: now, 
                onboarding_dismissed_at: null,
                onboarding_version: CURRENT_ONBOARDING_VERSION,
              }
            : { 
                onboarding_dismissed_at: now,
                onboarding_version: CURRENT_ONBOARDING_VERSION,
              };

        const { error: upsertError } = await supabase
            .from("user_preferences")
            .upsert(
                {
                    user_id: user.id,
                    ...updateData,
                    updated_at: now,
                },
                { onConflict: "user_id" }
            );

        if (upsertError) {
            console.error("Error upserting onboarding preferences:", upsertError);
            return NextResponse.json(
                { error: "Error al guardar preferencias" },
                { status: 500 }
            );
        }

        return NextResponse.json({ ok: true, action });
    } catch (error) {
        console.error("Error in onboarding preferences POST:", error);
        return NextResponse.json(
            { error: "Error interno" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/user/preferences/onboarding
 * Reset onboarding state (for "redo onboarding" feature)
 */
export async function DELETE() {
    try {
        const supabase = await createClient();
        
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { error: "No autenticado" },
                { status: 401 }
            );
        }

        const { error: updateError } = await supabase
            .from("user_preferences")
            .update({
                onboarding_completed_at: null,
                onboarding_dismissed_at: null,
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.id);

        if (updateError && updateError.code !== "PGRST116") {
            console.error("Error resetting onboarding preferences:", updateError);
            return NextResponse.json(
                { error: "Error al resetear preferencias" },
                { status: 500 }
            );
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Error in onboarding preferences DELETE:", error);
        return NextResponse.json(
            { error: "Error interno" },
            { status: 500 }
        );
    }
}
