import { google } from "googleapis";

type TokenCacheEntry = {
    accessToken: string;
    expiresAt: number; // epoch ms
};

// Cache en memoria (best-effort). En serverless puede “resetearse” entre invocaciones,
// pero igual ayuda mucho dentro del mismo warm instance / en dev.
const tokenCache = new Map<string, TokenCacheEntry>();
const inFlightRefresh = new Map<string, Promise<string>>();

export function getOAuth2Client() {
    if (!process.env.GOOGLE_CLIENT_ID) {
        throw new Error("Missing env GOOGLE_CLIENT_ID (requerido para Google OAuth)");
    }
    if (!process.env.GOOGLE_CLIENT_SECRET) {
        throw new Error("Missing env GOOGLE_CLIENT_SECRET (requerido para Google OAuth)");
    }
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
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
        const expiresAt = credentials.expiry_date ?? Date.now() + 55 * 60_000;

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
