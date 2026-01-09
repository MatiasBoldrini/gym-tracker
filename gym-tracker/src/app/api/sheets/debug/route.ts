import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getAuthContext } from "@/lib/supabase/auth-helper";
import { refreshAccessToken, getAuthenticatedClient } from "@/lib/google/oauth";

export async function GET() {
    try {
        // Get auth context from Supabase + DB
        const auth = await getAuthContext();
        if (!auth) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const client = getAuthenticatedClient(accessToken);

        // 1) Metadata del archivo (Drive)
        const drive = google.drive({ version: "v3", auth: client });
        const file = await drive.files.get({
            fileId: auth.spreadsheetId,
            fields: "id,name,modifiedTime,owners(emailAddress),webViewLink",
        });

        // 2) Confirmación de acceso a Sheets
        const sheets = google.sheets({ version: "v4", auth: client });
        const ss = await sheets.spreadsheets.get({
            spreadsheetId: auth.spreadsheetId,
            fields: "spreadsheetId,properties.title",
        });

        return NextResponse.json({
            ok: true,
            spreadsheetId: auth.spreadsheetId,
            driveFile: {
                id: file.data.id ?? null,
                name: file.data.name ?? null,
                modifiedTime: file.data.modifiedTime ?? null,
                ownerEmail: file.data.owners?.[0]?.emailAddress ?? null,
                webViewLink: file.data.webViewLink ?? null,
            },
            sheets: {
                spreadsheetId: ss.data.spreadsheetId ?? null,
                title: ss.data.properties?.title ?? null,
            },
        });
    } catch (error: any) {
        console.error("Error in sheets debug:", error);
        return NextResponse.json(
            { error: "No pudimos obtener la info de tu Google Sheet para debug." },
            { status: 500 }
        );
    }
}
