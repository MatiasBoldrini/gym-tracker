import { HomeScreen } from "@/components/screens/HomeScreen";
import { getUserStore, isUserAuthenticated } from "@/lib/user-store";
import { refreshAccessToken } from "@/lib/google/oauth";
import { listSpreadsheetSheetTitles, readSheetValues } from "@/lib/google/sheets";
import { parseExerciseMapping, parsePRData, parseWeekData } from "@/lib/sheets";
import type { Week } from "@/types";

export const dynamic = "force-dynamic";

function parseWeekFromTitle(title: string): number | null {
    const match = title.trim().match(/^Semana\s+(\d+)$/i);
    if (!match) return null;
    const id = Number(match[1]);
    if (!Number.isFinite(id) || id < 1) return null;
    return Math.trunc(id);
}

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

async function getHomeData(): Promise<{ week: Week; prs: any[] }> {
    const store = await getUserStore();

    // Sin auth/spreadsheet, devolvemos vacío: el cliente mostrará el modal de setup.
    if (!isUserAuthenticated(store) || !store.spreadsheetId) {
        return { week: { id: 1, days: [] }, prs: [] };
    }

    const accessToken = await refreshAccessToken(store.refreshToken!);
    const spreadsheetId = store.spreadsheetId;

    // Detectar semanas disponibles por títulos reales.
    const titles = await listSpreadsheetSheetTitles(accessToken, spreadsheetId);
    const availableWeekIds = titles
        .map(parseWeekFromTitle)
        .filter((n): n is number => typeof n === "number")
        .sort((a, b) => a - b);

    const weekId = availableWeekIds[0] ?? 1;

    const [weekValues, prValues, mappingValues] = await Promise.all([
        readSheetValues(accessToken, spreadsheetId, `'Semana ${weekId}'!A:N`),
        readPrSheet(accessToken, spreadsheetId),
        readSheetValues(accessToken, spreadsheetId, `'Ejercicios'!A:D`).catch(() => []),
    ]);

    const exerciseMapping = parseExerciseMapping(mappingValues);
    const week = parseWeekData(weekValues, weekId, exerciseMapping);
    const prs = parsePRData(prValues);

    return { week, prs };
}

export default async function Home() {
    const { week, prs } = await getHomeData();
    return <HomeScreen initialWeek={week} initialPrs={prs} />;
}
