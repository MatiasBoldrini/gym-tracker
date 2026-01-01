// ============================================================
// 🏋️ GYM TRACKER - Borrar Datos de un Día
// ============================================================

// ========== BORRAR DATOS DE UN DÍA ESPECÍFICO ==========
function borrarDatosDia(diaSeleccionado) {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaActual = ss.getActiveSheet();
    const nombreHoja = hojaActual.getName();

    // Verificar que es una hoja de semana
    if (!nombreHoja.startsWith("Semana")) {
        ui.alert(
            "❌ Error",
            `Esta función solo funciona en hojas de semana.\n\nEstás en: "${nombreHoja}"`,
            ui.ButtonSet.OK
        );
        return;
    }

    // Detectar los días en la hoja
    const dias = detectarDias(hojaActual);
    const diaInfo = dias.find((d) => d.numero === diaSeleccionado);

    // Verificar que el día existe
    if (!diaInfo) {
        ui.alert(
            "❌ Error",
            `El Día ${diaSeleccionado} no existe en esta hoja.\n\nDías disponibles: ${dias.map(d => d.numero).join(", ")}`,
            ui.ButtonSet.OK
        );
        return;
    }

    // Confirmar borrado
    const confirmacion = ui.alert(
        "⚠️ Confirmar borrado",
        `¿Borrar TODOS los datos del Día ${diaSeleccionado} en ${nombreHoja}?\n\n` +
        `Se borrarán: Ejercicios, Series, Notas, Reps, Pesos y Estrellas.\n\n` +
        `Esta acción NO se puede deshacer.`,
        ui.ButtonSet.YES_NO
    );

    if (confirmacion !== ui.Button.YES) {
        return;
    }

    // Calcular filas de datos (excluyendo el encabezado "DIA X")
    const filasDatos = {
        inicio: diaInfo.filaInicio + 1, // Fila después del encabezado
        fin: diaInfo.filaFin,
    };

    // Borrar datos del día
    let celdasBorradas = 0;

    for (let fila = filasDatos.inicio; fila <= filasDatos.fin; fila++) {
        // Columna A (ejercicios) - índice 1
        const celdaA = hojaActual.getRange(fila, 1);
        if (celdaA.getValue()) {
            celdaA.clearContent();
            celdasBorradas++;
        }

        // Columna B (series) - índice 2
        const celdaB = hojaActual.getRange(fila, 2);
        if (celdaB.getValue()) {
            celdaB.clearContent();
            celdasBorradas++;
        }

        // Columna D (notas) - índice 4
        const celdaD = hojaActual.getRange(fila, 4);
        if (celdaD.getValue()) {
            celdaD.clearContent();
            celdasBorradas++;
        }

        // Columnas F a M (reps, peso, estrellas) - índices 6 a 13
        for (let col = 6; col <= 13; col++) {
            const celda = hojaActual.getRange(fila, col);
            const valor = celda.getValue();

            if (
                typeof valor === "number" ||
                (typeof valor === "string" && valor.trim() !== "")
            ) {
                celda.clearContent();
                celdasBorradas++;
            }
        }
    }

    ui.alert(
        "✅ Datos borrados",
        `Se borraron los datos del Día ${diaSeleccionado}.\n\n` +
        `Celdas limpiadas: ${celdasBorradas}`,
        ui.ButtonSet.OK
    );
}

// ========== DETECTAR DÍAS EN UNA HOJA ==========
// Detecta los días y sus rangos de filas en una hoja
// Esta función es usada por múltiples archivos
function detectarDias(hoja) {
    const datos = hoja.getDataRange().getValues();
    const dias = [];
    let diaActual = null;

    datos.forEach((fila, index) => {
        const filaNum = index + 1;
        const colA = fila[0] ? fila[0].toString() : "";

        // Detectar inicio de un día
        if (colA.toUpperCase().includes("DIA")) {
            // Cerrar día anterior
            if (diaActual !== null) {
                diaActual.filaFin = filaNum - 1;
                dias.push(diaActual);
            }

            // Extraer número de día
            const match = colA.match(/\d+/);
            const numDia = match ? parseInt(match[0]) : dias.length + 1;

            diaActual = {
                numero: numDia,
                filaInicio: filaNum,
                filaFin: null,
            };
        }
    });

    // Cerrar último día
    if (diaActual !== null) {
        diaActual.filaFin = datos.length;
        dias.push(diaActual);
    }

    return dias;
}


