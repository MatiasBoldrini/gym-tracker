import { HomeScreen } from "@/components/screens/HomeScreen";
import { fetchSheetCSV, parseExerciseMapping, parsePRData, parseWeekData, SHEET_GIDS } from "@/lib/sheets";

export const revalidate = 300;

async function getHomeData() {
    const [weekDataRaw, prDataRaw, exerciseMappingRaw] = await Promise.all([
        fetchSheetCSV(SHEET_GIDS.SEMANA_1, { next: { revalidate } } as any),
        fetchSheetCSV(SHEET_GIDS.RM, { next: { revalidate } } as any),
        fetchSheetCSV(SHEET_GIDS.EJERCICIOS, { next: { revalidate } } as any),
    ]);

    const exerciseMapping = parseExerciseMapping(exerciseMappingRaw);
    const week = parseWeekData(weekDataRaw, 1, exerciseMapping);
    const prs = parsePRData(prDataRaw);

    return { week, prs };
}

export default async function Home() {
    const { week, prs } = await getHomeData();
    return <HomeScreen initialWeek={week} initialPrs={prs} />;
}
