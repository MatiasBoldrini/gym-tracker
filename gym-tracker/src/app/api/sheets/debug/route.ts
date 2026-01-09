import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getUserStore, isUserAuthenticated, updateUserStore } from "@/lib/user-store";
import { refreshAccessToken, getAuthenticatedClient } from "@/lib/google/oauth";
import { ensureSpreadsheetForUser } from "@/lib/google/drive";

export async function GET() {
    try {
        const store = await getUserStore();
        if (!isUserAuthenticated(store) || !store.refreshToken) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const refreshToken = store.refreshToken;

        // Garantiza que haya spreadsheetId y lo persiste si faltaba.
        let spreadsheetId = store.spreadsheetId;
        if (!spreadsheetId) {
            spreadsheetId = await ensureSpreadsheetForUser(refreshToken);
            await updateUserStore({ spreadsheetId });
        }

        const accessToken = await refreshAccessToken(refreshToken);
        const auth = getAuthenticatedClient(accessToken);

        // 1) Metadata del archivo (Drive)
        const drive = google.drive({ version: "v3", auth });
        const file = await drive.files.get({
            fileId: spreadsheetId,
            fields: "id,name,modifiedTime,owners(emailAddress),webViewLink",
        });

        // 2) Confirmación de acceso a Sheets
        const sheets = google.sheets({ version: "v4", auth });
        const ss = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: "spreadsheetId,properties.title",
        });

        return NextResponse.json({
            ok: true,
            spreadsheetId,
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

