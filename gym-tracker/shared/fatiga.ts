export const MUSCLE_MAPPING: Record<string, string[]> = {
    pecho: ["chest"],
    abdominales: ["abdominals"],
    biceps: ["biceps"],
    triceps: ["triceps"],
    antebrazos: ["forearms"],
    cuadriceps: ["quads"],
    isquiotibiales: ["hamstrings"],
    gluteos: ["glutes"],
    gemelos: ["calves"],
    espalda: ["lats", "lowerback", "traps", "traps-middle"],
    hombro: ["front-shoulders", "rear-shoulders"],
    // Categorías sin representación en el SVG (solo disponibles en tarjetas/lista)
    aductores: [],
    cuello: [],
};

// Helper inverso: dado un svgId, devuelve la categoría canónica
export function getCategoryFromSvgId(svgId: string): string | null {
    for (const [category, ids] of Object.entries(MUSCLE_MAPPING)) {
        if (ids.includes(svgId)) {
            return category;
        }
    }
    return null;
}

// Helper: parsea el número de series desde prescribedSeries (ej: "3 x 10-12" -> 3)
export function parseSeriesCount(prescribedSeries: string): number {
    if (!prescribedSeries) return 0;
    const match = prescribedSeries.toString().split(/[\sxX]+/)[0];
    const num = parseInt(match, 10);
    return Number.isFinite(num) && num > 0 ? num : 0;
}

export const MUSCLE_ALIASES: Record<string, string> = {
    "deltoides anterior": "hombro",
    "deltoides lateral": "hombro",
    "deltoides posterior": "hombro",
    "trapecio": "espalda",
    "dorsal": "espalda",
    "lumbar": "espalda",
};

// Umbrales compartidos (tabla + bodymap) para evitar duplicación de lógica.
export const FATIGA_THRESHOLDS = {
    low: 5,
    medium: 12,
    high: 18,
} as const;

export type FatigaBucket = "empty" | "low" | "medium" | "high" | "extreme";

export function getFatigaBucket(series: number): FatigaBucket {
    if (!series || series <= 0) return "empty";
    if (series <= FATIGA_THRESHOLDS.low) return "low";
    if (series <= FATIGA_THRESHOLDS.medium) return "medium";
    if (series <= FATIGA_THRESHOLDS.high) return "high";
    return "extreme";
}

export type FatigaMuscleRow = {
    muscle: string;
    series: number;
    frequency?: number | null;
    // Valores por día (Lun..Dom) cuando existan en la tabla superior.
    calendar?: Array<number | null>;
};

export type FatigaDaySummaryRow = {
    day: string;
    dayNumber?: string;
    avgStars?: number | null;
    series?: number | null;
};

function normCell(v: unknown): string {
    return String(v ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function findHeaderRow(data: unknown[][]) {
    for (let r = 0; r < data.length; r++) {
        const row = data[r] || [];
        const normalized = row.map(normCell);
        const hasMuscles = normalized.some((c) => c === "musculos" || c.includes("muscul"));
        const hasSeries = normalized.some((c) => c === "series" || c.includes("serie"));
        if (hasMuscles && hasSeries) return r;
    }
    return -1;
}

function findDayColumns(headerRow: unknown[]): { label: string; idx: number }[] {
    const days = ["lun", "mar", "mie", "mié", "jue", "vie", "sab", "sáb", "dom"];
    const normalized = headerRow.map(normCell);
    const cols: { label: string; idx: number }[] = [];
    for (let i = 0; i < normalized.length; i++) {
        const c = normalized[i];
        if (!c) continue;
        if (days.includes(c)) {
            // Usamos el texto original del header para display cuando sea posible.
            cols.push({ label: String(headerRow[i] ?? "").trim() || c, idx: i });
        }
    }
    // Orden correcto Lun..Dom aunque en la hoja estén desordenados.
    const order: Record<string, number> = { lun: 0, mar: 1, mie: 2, jue: 3, vie: 4, sab: 5, dom: 6 };
    return cols.sort((a, b) => {
        const na = normCell(a.label);
        const nb = normCell(b.label);
        const ka = order[na as keyof typeof order] ?? 999;
        const kb = order[nb as keyof typeof order] ?? 999;
        return ka - kb;
    });
}

function parseMuscleSection(data: unknown[][]) {
    const headerRowIdx = findHeaderRow(data);
    if (headerRowIdx < 0) return null;

    const header = data[headerRowIdx] || [];
    const normalized = header.map(normCell);
    const muscleCol = normalized.findIndex((c) => c === "musculos" || c.includes("muscul"));
    const seriesCol = normalized.findIndex((c) => c === "series" || c.includes("serie"));
    // Frecuencia: algunas plantillas lo ponen como "F" o "Frecuencia".
    const freqCol = normalized.findIndex((c) => c === "f" || c.includes("frecuencia"));
    const dayCols = findDayColumns(header);

    if (muscleCol < 0 || seriesCol < 0) return null;

    const muscleRows: FatigaMuscleRow[] = [];
    for (let r = headerRowIdx + 1; r < data.length; r++) {
        const row = data[r] || [];
        const muscle = String(row[muscleCol] ?? "").trim();
        const muscleNorm = normCell(muscle);
        if (!muscleNorm) break;
        // Cuando arranca el resumen (fila con "DIA"), cortamos.
        if (muscleNorm === "dia") break;

        const series = Number(row[seriesCol] ?? 0);
        const frequency = freqCol >= 0 ? Number(row[freqCol] ?? NaN) : NaN;
        const calendar =
            dayCols.length > 0
                ? dayCols.map(({ idx }) => {
                    const v = row[idx];
                    const n = Number(v);
                    return Number.isFinite(n) ? n : null;
                })
                : undefined;

        muscleRows.push({
            muscle,
            series: Number.isFinite(series) ? series : 0,
            frequency: Number.isFinite(frequency) ? frequency : null,
            calendar,
        });
    }

    return {
        headerRowIdx,
        muscleRows,
        dayCols,
    };
}

function parseDaySummarySection(data: unknown[][]): FatigaDaySummaryRow[] {
    // Buscamos la fila header del resumen (contiene DIA + PROMEDIO)
    let headerIdx = -1;
    for (let r = 0; r < data.length; r++) {
        const row = data[r] || [];
        const normalized = row.map(normCell);
        const hasDia = normalized.some((c) => c === "dia");
        const hasProm = normalized.some((c) => c.includes("promedio"));
        if (hasDia && hasProm) {
            headerIdx = r;
            break;
        }
    }
    if (headerIdx < 0) return [];

    const header = data[headerIdx] || [];
    const normalized = header.map(normCell);
    const dayCol = normalized.findIndex((c) => c === "dia");
    const nCol = normalized.findIndex((c) => c === "n" || c === "n°" || c.includes("n"));
    const avgCol = normalized.findIndex((c) => c.includes("promedio"));
    const seriesCol = normalized.findIndex((c) => c === "series" || c.includes("serie"));

    const rows: FatigaDaySummaryRow[] = [];
    for (let r = headerIdx + 1; r < data.length; r++) {
        const row = data[r] || [];
        const day = String(row[dayCol] ?? "").trim();
        if (!normCell(day)) break;

        const avg = avgCol >= 0 ? Number(row[avgCol] ?? NaN) : NaN;
        const series = seriesCol >= 0 ? Number(row[seriesCol] ?? NaN) : NaN;
        rows.push({
            day,
            dayNumber: nCol >= 0 ? String(row[nCol] ?? "").trim() : undefined,
            avgStars: Number.isFinite(avg) ? avg : null,
            series: Number.isFinite(series) ? series : null,
        });
    }
    return rows;
}

export function computeFatigaFromSheet(data: unknown[][]) {
    const parsed = parseMuscleSection(data);
    const daySummary = parseDaySummarySection(data);

    const muscleRows: FatigaMuscleRow[] = parsed?.muscleRows ?? [];
    const calendarDays = parsed?.dayCols?.map((d) => d.label) ?? [];

    // Calculate intensities for Body Map
    const intensities: Record<string, number> = {};
    let maxSeries = 0;

    muscleRows.forEach((row) => {
        const rawMuscleName = row.muscle.toLowerCase().trim();
        const series = Number(row.series) || 0;
        if (series > maxSeries) maxSeries = series;

        // Resolve canonical name using aliases or direct lookup
        const canonicalName = MUSCLE_ALIASES[rawMuscleName] || rawMuscleName;

        // Find mapping for the canonical name
        // Try exact match first, then check keys
        let targetGroups = MUSCLE_MAPPING[canonicalName];

        // If not found directly, try finding a key that "contains" the name (fallback behavior from original code?)
        // The original code didn't do fuzzy matching on KEYS, it did direct lookup.
        // But let's be safe and try to match case-insensitive keys if direct lookup fails.
        if (!targetGroups) {
            const key = Object.keys(MUSCLE_MAPPING).find(k => k.toLowerCase() === canonicalName);
            if (key) targetGroups = MUSCLE_MAPPING[key];
        }

        if (targetGroups) {
            targetGroups.forEach((group) => {
                // Determine if we should accumulate or max? 
                // Original logic was Math.max. However, if we are aliasing multiple rows (e.g. deltoid ant + post) 
                // to the same muscle group "hombro", we probably want to SUM them for the intensity...
                // BUT, 'intensities' here maps to SVG IDs (e.g. 'front-shoulders'). 
                // If I have 5 sets of ant delt and 5 sets of post delt:
                // 'hombro' -> ['front-shoulders', 'rear-shoulders']
                // If we use MAX: front-shoulders = 5, rear-shoulders = 5. Hombro total = 5? No, that's wrong.
                // The 'intensity' for the visualization usually represents the load on that SPECIFIC part.
                // If the user treats them as separate rows, they likely worked them separately.
                // So adding them might over-blow the intensity if we map both aliased rows to ALL target groups.

                // WAIT. 'deltoides anterior' -> 'hombro' -> ['front-shoulders', 'rear-shoulders'].
                // If I process 'deltoides anterior' (5 sets), I add 5 to front AND rear? 
                // That seems wrong for specific anatomy, but 'Hombro' is a general term.
                // The prompt says "deltoide anterior, lateral o posterior, todo cuenta como hombro".
                // And "quiero que el color sea acorde a que tantas series tiene el musculo".
                // This implies AGGREGATION.

                // Let's use accumulation for the 'hombro' case specifically or generally?
                // If I do back + trapezius -> 'Espalda'. 
                // If I do 10 sets lats, 10 sets traps. Total back volume is 20? Or is max 10?
                // Usually volume is per muscle group.
                // Let's stick to accumulation because the user wants to see "series count" matching the table.

                intensities[group] = (intensities[group] || 0) + series;
            });
        }
    });

    // Normalize intensities relative to max
    const normalized: Record<string, number> = {};
    if (maxSeries > 0) {
        Object.keys(intensities).forEach((key) => {
            normalized[key] = intensities[key] / maxSeries;
        });
    }

    return {
        muscleRows,
        daySummary,
        calendarDays,
        normalized,
        raw: intensities,
    };
}
