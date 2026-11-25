import { useState } from "react";
import { FatigaScreen } from "@/components/screens/FatigaScreen";
import { DEMO_MODE, getDemoFatigaData } from "@/lib/demo-data";
import { useAccountResource } from "@/lib/hooks/useAccountResource";

type FatigaPayload = ReturnType<typeof getDemoFatigaData>;

const emptyFatiga: FatigaPayload = { muscleRows: [], daySummary: [], calendarDays: [], intensityByGroupId: {} };

function parseFatiga(value: unknown): FatigaPayload {
    const payload = value as FatigaPayload | null;
    if (!payload || !Array.isArray(payload.muscleRows) || !Array.isArray(payload.daySummary) ||
        !Array.isArray(payload.calendarDays) || !payload.intensityByGroupId) {
        throw new Error("La respuesta de fatiga no es válida.");
    }
    return payload;
}

export function FatigaPage() {
    const { data, scope } = useAccountResource("/api/fatiga", "fatiga", parseFatiga);
    const [demo] = useState(() => DEMO_MODE ? getDemoFatigaData() : null);
    return <FatigaScreen key={scope ?? "guest"} {...(demo ?? data ?? emptyFatiga)} />;
}
