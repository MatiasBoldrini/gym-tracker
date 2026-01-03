import { ProgresoScreen } from "@/components/screens/ProgresoScreen";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";
import { parsePRData } from "@/lib/sheets";
import { getUserStore, isUserAuthenticated } from "@/lib/user-store";

export const dynamic = "force-dynamic";

export default async function ProgresoPage() {
    try {
        const store = await getUserStore();
        if (!isUserAuthenticated(store) || !store.spreadsheetId) {
            return <ProgresoScreen initialPrs={[]} />;
        }

        const accessToken = await refreshAccessToken(store.refreshToken!);
        const values = await readSheetValues(accessToken, store.spreadsheetId, `'RM'!A:E`).catch(() => []);
        const prs = parsePRData(values);

        return <ProgresoScreen initialPrs={prs} />;
    } catch (error) {
        console.error("Error loading Progreso page:", error);
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                <h2 className="text-xl font-bold mb-2">Error al cargar progreso</h2>
                <p className="text-ios-gray text-sm mb-6 max-w-xs">
                    No se pudo leer la hoja <span className="font-bold">RM</span> desde Google Sheets.
                </p>
                <div className="text-xs bg-gray-100 p-3 rounded-lg text-left w-full max-w-sm overflow-auto">
                    {String(error)}
                </div>
            </div>
        );
    }
}


