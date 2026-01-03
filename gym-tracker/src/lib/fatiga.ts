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
};

export const MUSCLE_ALIASES: Record<string, string> = {
    "deltoides anterior": "hombro",
    "deltoides lateral": "hombro",
    "deltoides posterior": "hombro",
    "trapecio": "espalda",
    "dorsal": "espalda",
    "lumbar": "espalda",
};

export function computeFatigaFromSheet(data: any[][]) {
    const rows = data.slice(1).filter((row) => row[0]);

    // Calculate intensities for Body Map
    const intensities: Record<string, number> = {};
    let maxSeries = 0;

    rows.forEach((row) => {
        const rawMuscleName = row[0].toLowerCase().trim();
        const series = parseInt(row[1]) || 0;
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

    return { rows, normalized, raw: intensities };
}
