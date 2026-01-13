import { NextResponse } from "next/server";
import { createClient, getUserIntegration, upsertUserIntegration } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { copyTemplate } from "@/lib/google/drive";
import { refreshAccessToken } from "@/lib/google/oauth";

/**
 * POST /api/sheets/setup
 * Creates the user's spreadsheet copy if it doesn't exist.
 * Called from client after auth callback redirects with setup_pending=true.
 */
export async function POST() {
    try {
        const supabase = await createClient();
        
        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { error: "No autenticado" },
                { status: 401 }
            );
        }

        // Get user integration
        const integration = await getUserIntegration();
        if (!integration) {
            return NextResponse.json(
                { error: "No se encontró la integración del usuario" },
                { status: 404 }
            );
        }

        // If already has spreadsheet, return success immediately
        if (integration.spreadsheet_id) {
            return NextResponse.json({
                ok: true,
                spreadsheetId: integration.spreadsheet_id,
                alreadyExists: true,
            });
        }

        // Need refresh token to create spreadsheet
        if (!integration.google_refresh_token_enc) {
            return NextResponse.json(
                { error: "No hay token de Google guardado. Volvé a iniciar sesión." },
                { status: 400 }
            );
        }

        // Decrypt refresh token
        let refreshToken: string;
        try {
            refreshToken = await decrypt(integration.google_refresh_token_enc);
        } catch {
            return NextResponse.json(
                { error: "Error al descifrar el token. Volvé a iniciar sesión." },
                { status: 500 }
            );
        }

        // Get access token and create spreadsheet
        const accessToken = await refreshAccessToken(refreshToken);
        const spreadsheetId = await copyTemplate(accessToken);

        // Save spreadsheet_id to user integration
        const updated = await upsertUserIntegration(user.id, {
            spreadsheet_id: spreadsheetId,
        });

        if (!updated) {
            return NextResponse.json(
                { error: "Error al guardar la planilla. Intentá de nuevo." },
                { status: 500 }
            );
        }

        return NextResponse.json({
            ok: true,
            spreadsheetId,
            alreadyExists: false,
        });
    } catch (error: any) {
        console.error("Error in sheets setup:", error);
        return NextResponse.json(
            { error: error?.message || "Error al crear la planilla" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/sheets/setup
 * Check if setup is complete (has spreadsheet_id).
 */
export async function GET() {
    try {
        const supabase = await createClient();
        
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ setupComplete: false, authenticated: false });
        }

        const integration = await getUserIntegration();
        
        return NextResponse.json({
            setupComplete: !!integration?.spreadsheet_id,
            authenticated: true,
            spreadsheetId: integration?.spreadsheet_id || null,
        });
    } catch (error) {
        console.error("Error checking setup status:", error);
        return NextResponse.json({ setupComplete: false, authenticated: false });
    }
}
