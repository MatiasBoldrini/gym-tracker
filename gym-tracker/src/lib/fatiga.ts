const MUSCLE_MAPPING: Record<string, string[]> = {
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
    "deltoides anterior": ["front-shoulders"],
    "deltoides lateral": ["front-shoulders"],
    "deltoides posterior": ["rear-shoulders"],
};

export function computeFatigaFromSheet(data: any[][]) {
    const rows = data.slice(1).filter((row) => row[0]);

    // Calculate intensities for Body Map
    const intensities: Record<string, number> = {};
    let maxSeries = 0;

    rows.forEach((row) => {
        const muscle = row[0].toLowerCase();
        const series = parseInt(row[1]) || 0;
        if (series > maxSeries) maxSeries = series;

        const targetGroups = MUSCLE_MAPPING[muscle];
        if (targetGroups) {
            targetGroups.forEach((group) => {
                intensities[group] = Math.max(intensities[group] || 0, series);
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

    return { rows, normalized };
}


