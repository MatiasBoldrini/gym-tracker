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
function TABLA_PRS() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojas = ss.getSheets().filter((h) => h.getName().startsWith("Semana"));

    const prs = {};

    hojas.forEach((hoja) => {
        const nombreHoja = hoja.getName();
        // Extraer número de semana (ej: "Semana 1" -> 1)
        const matchSemana = nombreHoja.match(/Semana\s*(\d+)/i);
        const numSemana = matchSemana ? parseInt(matchSemana[1]) : 0;

        const datos = hoja.getDataRange().getValues();
        if (datos.length < 2) return;

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

            for (let col = 1; col < fila.length - 1; col++) {
                const valor1 = fila[col];
                const valor2 = fila[col + 1];

                if (
                    typeof valor1 === "number" &&
                    typeof valor2 === "number" &&
                    valor1 > 0 &&
                    valor2 > 0 &&
                    valor1 <= 30
                ) {
                    const reps = valor1;
                    const peso = valor2;
                    const rm1 = reps === 1 ? peso : peso / (1.0278 - 0.0278 * reps);

                    if (!prs[ejercicio] || rm1 > prs[ejercicio].rm1) {
                        // Guardar fecha en formato S1D2
                        const fecha = `S${numSemana}D${diaActual}`;
                        prs[ejercicio] = { peso: peso, reps: reps, rm1: rm1, fecha: fecha };
                    }
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

