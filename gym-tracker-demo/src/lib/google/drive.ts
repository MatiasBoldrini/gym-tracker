import { google } from "googleapis";
import { getAuthenticatedClient } from "./oauth";

// Template ID (server-only, not NEXT_PUBLIC_*)
const TEMPLATE_ID =
    process.env.SHEETS_TEMPLATE_ID ||
    "1XMFq-Twxtoa_Fs2_6kOWjB65mMqEgzFJ8ujzyZN7iCo";

// App properties used to identify copies created by this app
const APP_PROPERTY_KEY = "gymTrackerApp";
const APP_PROPERTY_VALUE = "true";

/**
 * Creates a copy of the template spreadsheet in the user's Drive.
 * The copy is marked with appProperties so we can identify it.
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
