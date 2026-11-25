import { google } from "googleapis";

export function blockGoogleAuth(env = process.env) {
    if (env.GOOGLE_REFRESH_TOKEN) {
        if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
            throw new Error("El refresh token requiere GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.");
        const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
        auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
        return auth;
    }
    let credentials;
    if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        try { credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON); }
        catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON debe contener el JSON de la cuenta de servicio."); }
        if (credentials?.type !== "service_account" || !credentials.client_email || !credentials.private_key)
            throw new Error("Revisá las credenciales de la cuenta de servicio de Google.");
    }
    return new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
}
