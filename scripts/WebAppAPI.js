// ============================================================
// 🏋️ GYM TRACKER - Web App API (Persistence Layer)
// Maneja peticiones POST desde la aplicación web
// ============================================================

/**
 * Punto de entrada para peticiones POST (Web App Deployment).
 * Recibe datos de series y los escribe en la hoja correspondiente.
 */
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const result = registrarSeries_(data);

        return ContentService.createTextOutput(result)
            .setMimeType(ContentService.MimeType.TEXT);
    } catch (error) {
        return ContentService.createTextOutput("Error: " + error.message)
            .setMimeType(ContentService.MimeType.TEXT);
    }
}

/**
 * Procesa el registro de series en la hoja.
 * @param {Object} data { weekId, dayId, exerciseName, sets: [{reps, weight}] }
 * @returns {string} Resultado de la operación
 */
function registrarSeries_(data) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const nombreHoja = "Semana " + data.weekId;
    const sheet = ss.getSheetByName(nombreHoja);

    if (!sheet) return "Error: Hoja no encontrada (" + nombreHoja + ")";

    // Reutilizamos detectarDias() definido en BorrarDatosDia.js
    const dias = detectarDias(sheet);
    const diaInfo = dias.find(d => d.numero === data.dayId);

    if (!diaInfo) return "Error: Día " + data.dayId + " no encontrado en " + nombreHoja;

    const row = buscarFilaEjercicio_(sheet, diaInfo, data.exerciseName);

    if (row === -1) return "Error: Ejercicio '" + data.exerciseName + "' no encontrado en el Día " + data.dayId;

    // Escribir los sets (Máximo 4 según diseño de la hoja)
    // Columnas F, G, H, I, J, K, L, M -> índices 6, 7, 8, 9, 10, 11, 12, 13
    data.sets.forEach((set, index) => {
        if (index >= 4) return;
        const startCol = 6 + (index * 2);
        sheet.getRange(row, startCol).setValue(set.reps);
        sheet.getRange(row, startCol + 1).setValue(set.weight);
    });

    return "Success";
}

/**
 * Busca un ejercicio específico dentro del rango de filas de un día.
 * @param {Sheet} sheet
 * @param {Object} diaInfo { filaInicio, filaFin }
 * @param {string} nombreEjercicio
 * @returns {number} Número de fila o -1
 */
function buscarFilaEjercicio_(sheet, diaInfo, nombreEjercicio) {
    const range = sheet.getRange(diaInfo.filaInicio, 1, diaInfo.filaFin - diaInfo.filaInicio + 1, 1);
    const values = range.getValues();

    for (let i = 0; i < values.length; i++) {
        if (values[i][0] === nombreEjercicio) {
            return diaInfo.filaInicio + i;
        }
    }
    return -1;
}
