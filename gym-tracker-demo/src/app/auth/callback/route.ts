import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { encrypt } from "@/lib/crypto";

/**
 * Fast OAuth callback: only exchanges code for session and saves refresh token.
 * Spreadsheet creation is deferred to /api/sheets/setup (called from client).
 */
export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const error = requestUrl.searchParams.get("error");
    const origin = requestUrl.origin;

    if (error) {
        console.error("OAuth error:", error);
        return NextResponse.redirect(`${origin}/?auth_error=${error}`);
    }

    if (!code) {
        return NextResponse.redirect(`${origin}/?auth_error=no_code`);
    }

    const cookieStore = await cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options)
                    );
                },
            },
        }
    );

    try {
        // Exchange code for session (fast)
        const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

        if (sessionError || !sessionData.session) {
            console.error("Session exchange error:", sessionError);
            return NextResponse.redirect(`${origin}/?auth_error=session_failed`);
        }

        const session = sessionData.session;
        const user = session.user;
        const email = user.email;

        // Get provider refresh token from session
        const providerRefreshToken = session.provider_refresh_token;
        
        if (!providerRefreshToken) {
            console.error("No provider_refresh_token received from Google");
            return NextResponse.redirect(`${origin}/?auth_error=no_refresh_token`);
        }

        // Encrypt the refresh token for storage
        const encryptedRefreshToken = await encrypt(providerRefreshToken);

        // Check if user already has an integration (returning user)
        const { data: existingIntegration } = await supabase
            .from("user_integrations")
            .select("spreadsheet_id")
            .eq("user_id", user.id)
            .single();

        const hasSpreadsheet = !!existingIntegration?.spreadsheet_id;

        // Upsert user integration with refresh token (preserve existing spreadsheet_id if any)
        const { error: upsertError } = await supabase.from("user_integrations").upsert(
            {
                user_id: user.id,
                email: email || "",
                google_refresh_token_enc: encryptedRefreshToken,
                spreadsheet_id: existingIntegration?.spreadsheet_id || null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        );

        if (upsertError) {
            console.error("Error saving user integration:", upsertError);
            return NextResponse.redirect(`${origin}/?auth_error=db_error`);
        }

        // Build redirect URL with flags
        const params = new URLSearchParams();
        params.set("auth_success", "true");

        if (!hasSpreadsheet) {
            // New user or user without spreadsheet: needs setup
            params.set("setup_pending", "true");
            params.set("is_new_user", "true");
        }

        return NextResponse.redirect(`${origin}/?${params.toString()}`);
    } catch (error) {
        console.error("Error in auth callback:", error);
        return NextResponse.redirect(`${origin}/?auth_error=callback_failed`);
    }
}
