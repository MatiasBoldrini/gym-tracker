import { google } from "googleapis";
import { refreshAccessToken, getAuthenticatedClient } from "./oauth";

// Template ID (server-only, not NEXT_PUBLIC_*)
const TEMPLATE_ID =
    process.env.SHEETS_TEMPLATE_ID ||
    "1XMFq-Twxtoa_Fs2_6kOWjB65mMqEgzFJ8ujzyZN7iCo";

// App properties used to identify copies created by this app
const APP_PROPERTY_KEY = "gymTrackerApp";
const APP_PROPERTY_VALUE = "true";

/**
 * Searches the user's Drive for an existing copy of the template
 * that was created by this app (identified by appProperties).
 */
export async function findExistingTemplateCopy(
    accessToken: string
): Promise<string | null> {
    const auth = getAuthenticatedClient(accessToken);
    const drive = google.drive({ version: "v3", auth });

    const query = [
        "mimeType='application/vnd.google-apps.spreadsheet'",
        `appProperties has { key='${APP_PROPERTY_KEY}' and value='${APP_PROPERTY_VALUE}' }`,
        "trashed=false",
    ].join(" and ");

    const res = await drive.files.list({
        q: query,
        // Tomamos la más reciente para que sea determinístico si existen múltiples copias.
        orderBy: "modifiedTime desc",
        fields: "files(id, name, modifiedTime)",
        pageSize: 10,
    });

    const files = res.data.files;
    if (files && files.length > 0 && files[0].id) {
        return files[0].id;
    }

    return null;
}

/**
 * Creates a copy of the template spreadsheet in the user's Drive.
 * The copy is marked with appProperties so we can find it later.
 */
export async function copyTemplate(accessToken: string): Promise<string> {
    const auth = getAuthenticatedClient(accessToken);
    const drive = google.drive({ version: "v3", auth });

    const res = await drive.files.copy({
        fileId: TEMPLATE_ID,
        requestBody: {
            name: "Rutina Gym - Gym Tracker",
            appProperties: {
                [APP_PROPERTY_KEY]: APP_PROPERTY_VALUE,
            },
        },
        fields: "id",
    });

    const newFileId = res.data.id;
    if (!newFileId) {
        throw new Error("Failed to copy template: no file ID returned");
    }

    return newFileId;
}

async function canAccessSpreadsheet(accessToken: string, spreadsheetId: string): Promise<boolean> {
    try {
        const auth = getAuthenticatedClient(accessToken);
        const sheets = google.sheets({ version: "v4", auth });
        await sheets.spreadsheets.get({
            spreadsheetId,
            fields: "spreadsheetId",
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * Ensures the user has a spreadsheet:
 * 1. Searches for an existing copy in their Drive
 * 2. If not found, creates a new copy from the template
 * 3. Returns the spreadsheetId
 */
export async function ensureSpreadsheetForUser(
    refreshToken: string,
    opts?: { knownSpreadsheetId?: string }
): Promise<string> {
    const accessToken = await refreshAccessToken(refreshToken);

    // Si ya tenemos un spreadsheetId “conocido” (p.ej. del store), lo preferimos
    // siempre que sea accesible con esta cuenta.
    if (opts?.knownSpreadsheetId) {
        const ok = await canAccessSpreadsheet(accessToken, opts.knownSpreadsheetId);
        if (ok) return opts.knownSpreadsheetId;
    }

    // First, try to find an existing copy
    let spreadsheetId = await findExistingTemplateCopy(accessToken);

    // If not found, create a new copy
    if (!spreadsheetId) {
        spreadsheetId = await copyTemplate(accessToken);
    }

    return spreadsheetId;
}
