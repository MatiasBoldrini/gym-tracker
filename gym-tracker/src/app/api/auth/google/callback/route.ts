import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google/oauth";
import { getUserStore, setUserStore } from "@/lib/user-store";

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

        // Cookie-only storage (no DB): keep existing spreadsheetId if present
        const existing = await getUserStore();
        await setUserStore({
            spreadsheetId: existing.spreadsheetId,
            refreshToken: tokens.refresh_token,
        });

        // Redirect to home with success
        return NextResponse.redirect(new URL("/?auth_success=true", request.url));
    } catch (error) {
        console.error("Error in Google callback:", error);
        return NextResponse.redirect(new URL("/?auth_error=callback_failed", request.url));
    }
}

