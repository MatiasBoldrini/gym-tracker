// ============================================================
// 🏋️ GYM TRACKER - Fórmulas Personalizadas para Celdas
// TABLA_PRS, PROMEDIO_ESTRELLAS, FRECUENCIA_MUSCULO
// ============================================================

// ========== TABLA DE PRs ==========
/**
 * Genera una tabla con todos los ejercicios y sus récords personales
 * Busca en todas las hojas que empiecen con "Semana"
 *
 * @return {Array} Tabla con columnas: Ejercicio, Peso PR, Reps, Fecha, 1RM Estimado
 * @customfunction
 */
function TABLA_PRS(tick) {
    // `tick` existe solo para que la fórmula tenga una dependencia y se recalcule
    // cuando el script actualiza el named range `TABLA_PRS_TICK`.

    // Camino rápido: si existe la hoja cache, devolverla (mucho más rápido que re-escanear todas las semanas).
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cache = ss.getSheetByName("Tabla PRs");
    if (cache) {
        const lastRow = cache.getLastRow();
        const lastCol = Math.min(cache.getLastColumn(), 5);
        if (lastRow >= 1 && lastCol >= 1) {
            return cache.getRange(1, 1, lastRow, lastCol).getValues();
        }
    }

    // Fallback (sin cache): cálculo optimizado leyendo solo A:M y solo pares reps/peso (F-G, H-I, J-K, L-M).
    const hojas = ss.getSheets().filter((h) => /^Semana\s*\d+$/i.test(h.getName()));
    const prs = {};

    hojas.forEach((hoja) => {
        const nombreHoja = hoja.getName();
        const matchSemana = nombreHoja.match(/Semana\s*(\d+)/i);
        const numSemana = matchSemana ? parseInt(matchSemana[1], 10) : 0;

        const lastRow = hoja.getLastRow();
        if (lastRow < 2) return;

        const datos = hoja.getRange(1, 1, lastRow, 13).getValues(); // A:M
        let diaActual = 0;

        datos.forEach((fila) => {
            const colA = fila[0];
            const ejercicioRaw = colA ? colA.toString() : "";

            if (ejercicioRaw && ejercicioRaw.toUpperCase().includes("DIA")) {
                const m = ejercicioRaw.match(/\d+/);
                diaActual = m ? parseInt(m[0], 10) : diaActual + 1;
                return;
            }

            const ejercicio = ejercicioRaw.trim();
            if (!ejercicio) return;
            const ejercicioLc = ejercicio.toLowerCase();
            if (ejercicioLc.includes("series") || ejercicioLc.includes("notas")) return;
            if (diaActual <= 0) return;

            for (let setIdx = 0; setIdx < 4; setIdx++) {
                const reps = fila[5 + setIdx * 2]; // F, H, J, L (0-based)
                const peso = fila[6 + setIdx * 2]; // G, I, K, M
                if (
                    typeof reps !== "number" ||
                    typeof peso !== "number" ||
                    reps <= 0 ||
                    peso <= 0 ||
                    reps > 30
                ) {
                    continue;
                }

                const rm1 = reps === 1 ? peso : peso / (1.0278 - 0.0278 * reps);
                if (!prs[ejercicio] || rm1 > prs[ejercicio].rm1) {
                    const fecha = `S${numSemana}D${diaActual}`;
                    prs[ejercicio] = { peso: peso, reps: reps, rm1: rm1, fecha: fecha };
                }
            }
        });
    });

    const resultado = [["Ejercicio", "Peso PR", "Reps", "Fecha", "1RM Estimado"]];
    Object.keys(prs)
        .sort((a, b) => prs[b].rm1 - prs[a].rm1)
        .forEach((ejercicio) => {
            resultado.push([
                ejercicio,
                prs[ejercicio].peso,
                prs[ejercicio].reps,
                prs[ejercicio].fecha,
                Math.round(prs[ejercicio].rm1 * 10) / 10,
            ]);
        });

    return resultado;
}

// ========== PROMEDIO ESTRELLAS ==========
/**
 * Calcula el promedio de estrellas de una celda en todas las semanas
 *
 * @param {string} celda La celda a buscar (ej: "F10")
 * @return {number} El promedio de estrellas (1-3)
 * @customfunction
 */
function PROMEDIO_ESTRELLAS(celda) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojas = ss.getSheets();

    let suma = 0;
    let conteo = 0;

    hojas.forEach((hoja) => {
        const nombre = hoja.getName();
        if (nombre.startsWith("Semana")) {
            try {
                const valor = hoja.getRange(celda).getValue();
                if (valor && typeof valor === "string") {
                    const estrellas = (valor.match(/★/g) || []).length;
                    if (estrellas > 0) {
                        suma += estrellas;
                        conteo++;
                    }
                }
            } catch (e) { }
        }
    });

    return conteo > 0 ? suma / conteo : 0;
}

// ========== FRECUENCIA DE UN MÚSCULO ==========
/**
 * Cuenta cuántos días se entrena un músculo en una semana (máx 1 por día)
 * Ideal para usar junto a la tabla de músculos existente
 *
 * @param {string} musculo Nombre del grupo muscular (ej: "Pecho")
 * @param {string} hoja Nombre de la hoja (opcional, default: "Semana 1")
 * @return {number} Número de días que se entrena ese músculo
 * @customfunction
 *
 * @example =FRECUENCIA_MUSCULO(C2) // Usa Semana 1
 * @example =FRECUENCIA_MUSCULO(C2; "Semana 2")
 */
function FRECUENCIA_MUSCULO(musculo, hoja) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const nombreHoja = hoja && hoja.trim() !== "" ? hoja : "Semana 1";
    const sheet = ss.getSheetByName(nombreHoja);

    if (!sheet || !musculo) return 0;

    const datos = sheet.getDataRange().getValues();
    const diasConMusculo = new Set();
    let diaActual = 0;

    datos.forEach((fila) => {
        const colA = fila[0] ? fila[0].toString() : "";
        const colN = fila[13] ? fila[13].toString().trim().toLowerCase() : "";

        // Detectar cambio de día
        if (colA.toUpperCase().includes("DIA")) {
            diaActual++;
        }

        // Si el músculo coincide y estamos en un día válido
        if (colN === musculo.toString().toLowerCase() && diaActual > 0) {
            diasConMusculo.add(diaActual);
        }
    });

    return diasConMusculo.size;
}


