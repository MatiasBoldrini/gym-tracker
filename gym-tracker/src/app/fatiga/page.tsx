import { FatigaScreen } from "@/components/screens/FatigaScreen";
import { computeFatigaFromSheet } from "@/lib/fatiga";
import { getUserStore, isUserAuthenticated } from "@/lib/user-store";
import { refreshAccessToken } from "@/lib/google/oauth";
import { readSheetValues } from "@/lib/google/sheets";

export const dynamic = "force-dynamic";

export default async function FatigaPage() {
    try {
        const store = await getUserStore();
        if (!isUserAuthenticated(store) || !store.spreadsheetId) {
            return <FatigaScreen initialRows={[]} intensityByGroupId={{}} />;
        }

        const accessToken = await refreshAccessToken(store.refreshToken!);
        const data = await readSheetValues(accessToken, store.spreadsheetId, `'Fatiga'!A:Z`);
        const { rows, raw } = computeFatigaFromSheet(data);
        return <FatigaScreen initialRows={rows} intensityByGroupId={raw} />;
    } catch (error) {
        console.error("Error loading Fatiga page:", error);
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                <div className="mb-4 text-ios-red">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold mb-2">Error al cargar datos</h2>
                <p className="text-ios-gray text-sm mb-6 max-w-xs">
                    No se pudo cargar la información de fatiga. Por favor verifica la conexión con Google Sheets.
                </p>
                <div className="text-xs bg-gray-100 p-3 rounded-lg text-left w-full max-w-sm overflow-auto">
                    {String(error)}
                </div>
            </div>
        );
    }
}
