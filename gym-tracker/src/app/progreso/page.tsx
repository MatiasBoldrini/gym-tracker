import { ProgresoScreen } from "@/components/screens/ProgresoScreen";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";
import { parsePRData } from "@/lib/sheets-parse";

export const dynamic = "force-dynamic";

async function readPrSheet(accessToken: string, spreadsheetId: string) {
    const sheetNames = ["RM A,B,C", "RM"];
    for (const name of sheetNames) {
        try {
            const values = await readSheetValues(accessToken, spreadsheetId, `'${name}'!A:E`);
            if (Array.isArray(values) && values.length > 0) return values;
        } catch {
            // Intentamos la siguiente opción si falla
        }
    }
    return [];
}

export default async function ProgresoPage() {
    try {
        const supabase = await createClient();
        
        // Check if user is authenticated
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return <ProgresoScreen initialPrs={[]} />;
        }

        // Get user integration from DB
        const { data: integration, error: dbError } = await supabase
            .from("user_integrations")
            .select("*")
            .eq("user_id", user.id)
            .single();

        if (dbError || !integration || !integration.spreadsheet_id || !integration.google_refresh_token_enc) {
            return <ProgresoScreen initialPrs={[]} />;
        }

        // Decrypt refresh token
        const refreshToken = await decrypt(integration.google_refresh_token_enc);
        const accessToken = await refreshAccessToken(refreshToken);
        const values = await readPrSheet(accessToken, integration.spreadsheet_id);
        const prs = parsePRData(values);

        return <ProgresoScreen initialPrs={prs} />;
    } catch (error) {
        console.error("Error loading Progreso page:", error);
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                <h2 className="text-xl font-bold mb-2">Error al cargar progreso</h2>
                <p className="text-ios-gray text-sm mb-6 max-w-xs">
                    No se pudo leer la hoja <span className="font-bold">RM A,B,C</span> (ni la de respaldo
                    <span className="font-bold"> RM</span>) desde Google Sheets.
                </p>
                <div className="text-xs bg-gray-100 p-3 rounded-lg text-left w-full max-w-sm overflow-auto">
                    {String(error)}
                </div>
            </div>
        );
    }
}
