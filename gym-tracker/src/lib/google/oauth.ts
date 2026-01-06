import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

type TokenCacheEntry = {
    accessToken: string;
    expiresAt: number; // epoch ms
};

// Cache en memoria (best-effort). En serverless puede “resetearse” entre invocaciones,
// pero igual ayuda mucho dentro del mismo warm instance / en dev.
const tokenCache = new Map<string, TokenCacheEntry>();
const inFlightRefresh = new Map<string, Promise<string>>();

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
    // 1) Cache hit (con margen para evitar usarlo casi vencido)
    const cached = tokenCache.get(refreshToken);
    const now = Date.now();
    if (cached && cached.expiresAt > now + 60_000) {
        return cached.accessToken;
    }

    // 2) Dedupe: si ya hay un refresh en curso para este refreshToken, lo reutilizamos.
    const inFlight = inFlightRefresh.get(refreshToken);
    if (inFlight) return inFlight;

    const p = (async () => {
        const oauth2Client = getOAuth2Client();
        oauth2Client.setCredentials({ refresh_token: refreshToken });

        const { credentials } = await oauth2Client.refreshAccessToken();
        const accessToken = credentials.access_token;
        if (!accessToken) throw new Error("Failed to refresh access token");

        // Google suele devolver `expiry_date` (ms). Si no viene, ponemos ~55 min.
        const expiresAt =
            typeof (credentials as any).expiry_date === "number"
                ? (credentials as any).expiry_date
                : Date.now() + 55 * 60_000;

        tokenCache.set(refreshToken, { accessToken, expiresAt });
        return accessToken;
    })();

    inFlightRefresh.set(refreshToken, p);
    try {
        return await p;
    } finally {
        inFlightRefresh.delete(refreshToken);
    }
}

export function getAuthenticatedClient(accessToken: string) {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    return oauth2Client;
}






