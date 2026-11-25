import type { PersonalRecord } from "@/types";
import { ProgresoScreen } from "@/components/screens/ProgresoScreen";
import { DEMO_MODE, demoPrs } from "@/lib/demo-data";
import { useAccountResource } from "@/lib/hooks/useAccountResource";

function parsePrs(value: unknown): PersonalRecord[] {
    const payload = value as { prs?: PersonalRecord[] } | null;
    if (!Array.isArray(payload?.prs)) throw new Error("La respuesta de marcas personales no es válida.");
    return payload.prs;
}

export function ProgresoPage() {
    const { data, scope } = useAccountResource("/api/sheets/prs", "prs", parsePrs);
    return <ProgresoScreen key={scope ?? "guest"} initialPrs={DEMO_MODE ? demoPrs : data ?? []} />;
}
