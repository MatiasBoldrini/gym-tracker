import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export function getOAuth2Client() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
}

export function getAuthUrl(state?: string): string {
    const oauth2Client = getOAuth2Client();
    return oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent", // Force to get refresh_token every time
        state,
    });
}

export async function exchangeCodeForTokens(code: string) {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    if (!credentials.access_token) {
        throw new Error("Failed to refresh access token");
    }
    return credentials.access_token;
}

export function getAuthenticatedClient(accessToken: string) {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    return oauth2Client;
}

