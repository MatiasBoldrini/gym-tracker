import { FatigaScreen } from "@/components/screens/FatigaScreen";
import { fetchSheetCSV, SHEET_GIDS } from "@/lib/sheets";
import { computeFatigaFromSheet } from "@/lib/fatiga";

export const revalidate = 300;

export default async function FatigaPage() {
    const data = await fetchSheetCSV(SHEET_GIDS.FATIGA, { next: { revalidate } } as any);
    const { rows, normalized } = computeFatigaFromSheet(data);
    return <FatigaScreen initialRows={rows} intensityByGroupId={normalized} />;
}
