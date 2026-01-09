import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google/oauth";
import { setUserStore } from "@/lib/user-store";
import { ensureSpreadsheetForUser } from "@/lib/google/drive";

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const code = searchParams.get("code");
        const error = searchParams.get("error");

        if (error) {
            console.error("OAuth error:", error);
            return NextResponse.redirect(new URL("/?auth_error=" + error, request.url));
        }

        if (!code) {
            return NextResponse.redirect(new URL("/?auth_error=no_code", request.url));
        }

        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code);

        if (!tokens.refresh_token) {
            console.error("No refresh token received");
            return NextResponse.redirect(new URL("/?auth_error=no_refresh_token", request.url));
        }

        // Store the refresh token first
        await setUserStore({
            refreshToken: tokens.refresh_token,
        });

        // Bootstrap: find or create the spreadsheet copy automatically
        try {
            await ensureSpreadsheetForUser(tokens.refresh_token);
        } catch (setupError: any) {
            console.error("Failed to setup spreadsheet:", setupError);
            // Redirect with setup error - the user is authenticated but spreadsheet setup failed
            const errorMessage = encodeURIComponent(
                setupError?.message || "No pudimos crear tu copia de la planilla"
            );
            return NextResponse.redirect(
                new URL(`/?auth_success=true&setup_error=${errorMessage}`, request.url)
            );
        }

        // Redirect to home with success
        return NextResponse.redirect(new URL("/?auth_success=true", request.url));
    } catch (error) {
        console.error("Error in Google callback:", error);
        return NextResponse.redirect(new URL("/?auth_error=callback_failed", request.url));
    }
}
