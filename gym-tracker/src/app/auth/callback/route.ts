import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { encrypt } from "@/lib/crypto";
import { copyTemplate } from "@/lib/google/drive";
import { refreshAccessToken } from "@/lib/google/oauth";

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
        // Exchange code for session
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

        let spreadsheetId = existingIntegration?.spreadsheet_id;

        // If no spreadsheet exists, create one
        if (!spreadsheetId) {
            try {
                // Get access token to create spreadsheet
                const accessToken = await refreshAccessToken(providerRefreshToken);
                spreadsheetId = await copyTemplate(accessToken);
            } catch (createError: any) {
                console.error("Failed to create spreadsheet:", createError);
                // Still save the user integration without spreadsheet
                // They can try again later
                const errorMessage = encodeURIComponent(
                    createError?.message || "No pudimos crear tu copia de la planilla"
                );
                
                // Save what we have
                await supabase.from("user_integrations").upsert(
                    {
                        user_id: user.id,
                        email: email || "",
                        google_refresh_token_enc: encryptedRefreshToken,
                        spreadsheet_id: null,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "user_id" }
                );

                return NextResponse.redirect(
                    `${origin}/?auth_success=true&setup_error=${errorMessage}`
                );
            }
        }

        // Upsert user integration with all data
        const { error: upsertError } = await supabase.from("user_integrations").upsert(
            {
                user_id: user.id,
                email: email || "",
                google_refresh_token_enc: encryptedRefreshToken,
                spreadsheet_id: spreadsheetId,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        );

        if (upsertError) {
            console.error("Error saving user integration:", upsertError);
            return NextResponse.redirect(`${origin}/?auth_error=db_error`);
        }

        // Pass is_new_user flag if this was a new user (no previous spreadsheet)
        const isNewUser = !existingIntegration?.spreadsheet_id;
        return NextResponse.redirect(`${origin}/?auth_success=true${isNewUser ? '&is_new_user=true' : ''}`);
    } catch (error) {
        console.error("Error in auth callback:", error);
        return NextResponse.redirect(`${origin}/?auth_error=callback_failed`);
    }
}
