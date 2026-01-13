// ============================================================
// 🏋️ GYM TRACKER - Fórmulas Personalizadas para Celdas
// TABLA_PRS, PROMEDIO_ESTRELLAS, FRECUENCIA_MUSCULO
// ============================================================

// ========== TABLA DE PRs ==========
/**
 * Genera una tabla con todos los ejercicios y sus récords personales
 * Busca en todas las hojas que empiecen con "Semana"
 *
 * El parámetro recalcToken se ignora; se usa para forzar recálculo
 * con argumentos volátiles (ej: RAND()) sin necesidad de triggers.
 *
 * @param {*} recalcToken Token de recálculo (opcional, ignorado)
 * @return {Array} Tabla con columnas: Ejercicio, Peso PR, Reps, Fecha, 1RM Estimado
 * @customfunction
 */
function TABLA_PRS(recalcToken) {
    // recalcToken se ignora; su presencia permite usar RAND()/NOW() en la fórmula.
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojas = ss.getSheets().filter((h) => h.getName().startsWith("Semana"));

    const prs = {};

    hojas.forEach((hoja) => {
        const nombreHoja = hoja.getName();
        // Extraer número de semana (ej: "Semana 1" -> 1)
        const matchSemana = nombreHoja.match(/Semana\s*(\d+)/i);
        const numSemana = matchSemana ? parseInt(matchSemana[1]) : 0;

        const lastRow = hoja.getLastRow();
        if (lastRow < 2) return;
        // Leer solo columnas A..M (13 columnas) para cubrir ejercicio + 4 sets (reps/peso)
        const datos = hoja.getRange(1, 1, lastRow, 13).getValues();

        let diaActual = 0;

        datos.forEach((fila, rowIndex) => {
            const ejercicio = fila[0];

            // Detectar cambio de día
            if (ejercicio && typeof ejercicio === "string" && ejercicio.toUpperCase().includes("DIA")) {
                diaActual++;
                return;
            }

            if (
                !ejercicio ||
                typeof ejercicio !== "string" ||
                ejercicio.toLowerCase().includes("series") ||
                ejercicio.toLowerCase().includes("notas") ||
                ejercicio.trim() === ""
            ) {
                return;
            }

            // Columnas de sets: F-G, H-I, J-K, L-M (reps/peso)
            const sets = [
                [fila[5], fila[6]],
                [fila[7], fila[8]],
                [fila[9], fila[10]],
                [fila[11], fila[12]],
            ];

            sets.forEach(([valorReps, valorPeso]) => {
                if (
                    typeof valorReps === "number" &&
                    typeof valorPeso === "number" &&
                    valorReps > 0 &&
                    valorPeso > 0 &&
                    valorReps <= 30
                ) {
                    const reps = valorReps;
                    const peso = valorPeso;
                    const rm1 = reps === 1 ? peso : peso / (1.0278 - 0.0278 * reps);

                    if (!prs[ejercicio] || rm1 > prs[ejercicio].rm1) {
                        // Guardar fecha en formato S1D2
                        const fecha = `S${numSemana}D${diaActual}`;
                        prs[ejercicio] = { peso: peso, reps: reps, rm1: rm1, fecha: fecha };
                    }
                }
            });
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

// ========== SERIES DE UN MÚSCULO EN UN DÍA ==========
/**
 * Calcula el total de series para un músculo en un día específico
 * Extrae el número de series del texto en columna B (ej: "3 x 8-12" → 3)
 *
 * @param {string} musculo Nombre del grupo muscular (ej: "Pecho")
 * @param {number|string} numDia Número del día (1, 2, 3, etc.) o texto "DIA 1"
 * @param {string} hoja Nombre de la hoja (opcional, default: "Semana 1")
 * @return {number} Total de series para ese músculo en ese día
 * @customfunction
 *
 * @example =SERIES_MUSCULO_EN_DIA("Pecho"; 1) // Series de Pecho en Día 1
 * @example =SERIES_MUSCULO_EN_DIA(C2; BUSCARV(H$1; $C$18:$D$22; 2; FALSO))
 */
function SERIES_MUSCULO_EN_DIA(musculo, numDia, hoja) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const nombreHoja = hoja && typeof hoja === "string" && hoja.trim() !== "" ? hoja.trim() : "Semana 1";
    const sheet = ss.getSheetByName(nombreHoja);

    if (!sheet || !musculo || numDia === "" || numDia === null || numDia === undefined) return "";

    // Normalizar numDia (puede venir como número, "1", "DIA 1", etc.)
    let diaObjetivo = 0;
    if (typeof numDia === "number") {
        diaObjetivo = numDia;
    } else if (typeof numDia === "string") {
        const match = numDia.match(/\d+/);
        diaObjetivo = match ? parseInt(match[0]) : 0;
    }

    if (diaObjetivo <= 0) return "";

    const datos = sheet.getDataRange().getValues();
    let diaActual = 0;
    let totalSeries = 0;
    const musculoNorm = musculo.toString().trim().toLowerCase();

    datos.forEach((fila) => {
        const colA = fila[0] ? fila[0].toString() : "";
        const colB = fila[1] ? fila[1].toString() : "";
        const colN = fila[13] ? fila[13].toString().trim().toLowerCase() : "";

        // Detectar cambio de día
        if (colA.toUpperCase().includes("DIA")) {
            const match = colA.match(/\d+/);
            diaActual = match ? parseInt(match[0]) : diaActual + 1;
            return;
        }

        // Si estamos en el día correcto y el músculo coincide
        if (diaActual === diaObjetivo && colN === musculoNorm && colB) {
            // Extraer número de series del texto (ej: "3 x 8-12" → 3)
            const matchSeries = colB.match(/^\s*(\d+)\s*x/i);
            if (matchSeries) {
                totalSeries += parseInt(matchSeries[1]);
            }
        }
    });

    return totalSeries > 0 ? totalSeries : "";
}

// ========== GRILLA SERIES POR MÚSCULO Y DÍA (MATRIZ) ==========
/**
 * Genera una matriz con las series por músculo (filas) y día de semana (columnas)
 * Usa el mapeo de días configurado en la hoja Fatiga (C18:D)
 *
 * @param {Range} musculos Rango con los nombres de músculos (ej: C2:C10)
 * @param {Range} diasSemana Rango con los días de la semana (ej: H1:N1)
 * @param {Range} mapeo Rango con el mapeo día→DIA n (2 columnas: día, DIA n)
 * @param {string} hoja Nombre de la hoja de semana (opcional, default: "Semana 1")
 * @param {string} modo (opcional) "numero" (default) | "barra" | "barra+numero"
 * @param {number} maxSeries (opcional) Máximo esperado de series para dibujar la barra (default: 12)
 * @return {Array} Matriz con series por músculo/día
 * @customfunction
 *
 * @example =GRILLA_SERIES_FATIGA(C2:C10; H1:N1; C18:D22)
 * @example =GRILLA_SERIES_FATIGA(C2:C10; H1:N1; C18:D22; "Semana 2"; "barra+numero"; 12)
 */
function GRILLA_SERIES_FATIGA(musculos, diasSemana, mapeo, hoja, modo, maxSeries) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const nombreHoja = hoja && typeof hoja === "string" && hoja.trim() !== "" ? hoja.trim() : "Semana 1";
    const sheet = ss.getSheetByName(nombreHoja);

    if (!sheet) return [["Error: hoja no encontrada"]];

    const modoNorm = (typeof modo === "string" && modo.trim() !== "") ? modo.trim().toLowerCase() : "numero";
    const maxNormNum = Number(maxSeries);
    const maxNorm = (Number.isFinite(maxNormNum) && maxNormNum > 0) ? Math.round(maxNormNum) : 12;

    const formatearCelda_ = (valor) => {
        if (valor === "" || valor === null || typeof valor === "undefined") return "";
        if (modoNorm === "numero") return valor;

        const n = Number(valor);
        if (!Number.isFinite(n)) return valor;

        const filled = Math.max(0, Math.min(maxNorm, Math.round(n)));
        const empty = Math.max(0, maxNorm - filled);
        const bar = "█".repeat(filled) + "░".repeat(empty);

        if (modoNorm === "barra") return bar;
        if (modoNorm === "barra+numero" || modoNorm === "barra_numero" || modoNorm === "barra y numero") return `${bar} ${n}`;

        // fallback: si el modo no es reconocido, devolver número
        return valor;
    };

    // Normalizar inputs (pueden ser arrays 2D o valores únicos)
    const musculosList = Array.isArray(musculos)
        ? musculos.flat().filter(m => m && m.toString().trim() !== "")
        : [musculos];

    const diasList = Array.isArray(diasSemana)
        ? diasSemana.flat().filter(d => d && d.toString().trim() !== "")
        : [diasSemana];

    // Construir mapeo día → número de día
    const mapeoDict = {};
    if (Array.isArray(mapeo)) {
        mapeo.forEach(fila => {
            if (fila.length >= 2 && fila[0] && fila[1]) {
                const diaSem = fila[0].toString().trim().toUpperCase().substring(0, 3);
                const diaNum = fila[1].toString().match(/\d+/);
                if (diaNum) {
                    mapeoDict[diaSem] = parseInt(diaNum[0]);
                }
            }
        });
    }

    // Leer datos de la hoja de semana una sola vez
    const datos = sheet.getDataRange().getValues();

    // Preprocesar: crear índice de series por día y músculo
    const seriesPorDiaMusculo = {};
    let diaActual = 0;

    datos.forEach((fila) => {
        const colA = fila[0] ? fila[0].toString() : "";
        const colB = fila[1] ? fila[1].toString() : "";
        const colN = fila[13] ? fila[13].toString().trim().toLowerCase() : "";

        // Detectar cambio de día
        if (colA.toUpperCase().includes("DIA")) {
            const match = colA.match(/\d+/);
            diaActual = match ? parseInt(match[0]) : diaActual + 1;
            return;
        }

        // Acumular series
        if (diaActual > 0 && colN && colB) {
            const matchSeries = colB.match(/^\s*(\d+)\s*x/i);
            if (matchSeries) {
                const key = `${diaActual}|${colN}`;
                seriesPorDiaMusculo[key] = (seriesPorDiaMusculo[key] || 0) + parseInt(matchSeries[1]);
            }
        }
    });

    // Generar matriz de resultado
    const resultado = [];

    musculosList.forEach(musculo => {
        const fila = [];
        const musculoNorm = musculo.toString().trim().toLowerCase();

        diasList.forEach(diaSem => {
            const diaNorm = diaSem.toString().trim().toUpperCase().substring(0, 3);
            const numDia = mapeoDict[diaNorm];

            if (numDia) {
                const key = `${numDia}|${musculoNorm}`;
                const series = seriesPorDiaMusculo[key];
                fila.push(formatearCelda_(series || ""));
            } else {
                fila.push("");
            }
        });

        resultado.push(fila);
    });

    return resultado;
}


