// ============================================================
// 🏋️ GYM TRACKER - Gestión de Mesociclos
// Crear y borrar semanas del mesociclo
// ============================================================

// ========== CREAR MESOCICLO ==========
function crearMesociclo() {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Verificar que existe Semana 1
    const semana1 = ss.getSheetByName("Semana 1");
    if (!semana1) {
        ui.alert(
            "❌ Error",
            'No se encontró la hoja "Semana 1".\n\nCrea primero una hoja llamada "Semana 1" como plantilla.',
            ui.ButtonSet.OK
        );
        return;
    }

    // Contar semanas existentes
    const semanasExistentes = ss
        .getSheets()
        .filter((h) => h.getName().match(/^Semana \d+$/)).length;

    // Preguntar número de semanas
    const respuesta = ui.prompt(
        "➕ Crear Mesociclo",
        `Actualmente tienes ${semanasExistentes} semana(s).\n\n¿Hasta qué semana quieres generar?\n(Ejemplo: escribe 6 para tener Semana 1 a Semana 6)`,
        ui.ButtonSet.OK_CANCEL
    );

    if (respuesta.getSelectedButton() !== ui.Button.OK) {
        return;
    }

    const textoSemanas = respuesta.getResponseText().trim();
    const numSemanas = Number(textoSemanas);

    if (!/^\d+$/.test(textoSemanas) || numSemanas < 2) {
        ui.alert(
            "❌ Error",
            "Ingresá un número entero mayor a 1.",
            ui.ButtonSet.OK
        );
        return;
    }

    if (numSemanas > 20) {
        ui.alert(
            "❌ Error",
            "El máximo permitido es 20 semanas.",
            ui.ButtonSet.OK
        );
        return;
    }

    // Crear las semanas que faltan
    let semanasCreadas = 0;

    for (let i = 2; i <= numSemanas; i++) {
        const nombreHoja = `Semana ${i}`;

        // Si ya existe, saltar
        if (ss.getSheetByName(nombreHoja)) {
            continue;
        }

        // Duplicar Semana 1
        const nuevaHoja = semana1.copyTo(ss);
        nuevaHoja.setName(nombreHoja);

        // Limpiar datos de la nueva semana
        limpiarDatosSemana(nuevaHoja);

        semanasCreadas++;
    }

    if (semanasCreadas === 0) {
        ui.alert(
            "ℹ️ Info",
            `Ya existen todas las semanas hasta la ${numSemanas}.`,
            ui.ButtonSet.OK
        );
    } else {
        ui.alert(
            "✅ Mesociclo Creado",
            `Se crearon ${semanasCreadas} semana(s) nuevas.\n\nAhora tienes Semana 1 hasta Semana ${numSemanas}.`,
            ui.ButtonSet.OK
        );
    }
}

// ========== LIMPIAR DATOS DE UNA SEMANA ==========
// Limpia los datos de reps/peso/estrellas de una semana
function limpiarDatosSemana(hoja) {
    const datos = hoja.getDataRange().getValues();

    datos.forEach((fila, rowIndex) => {
        const filaNum = rowIndex + 1;

        // Limpiar columnas F a M (índices 6-13 en notación 1-based)
        for (let col = 6; col <= 13; col++) {
            const celda = hoja.getRange(filaNum, col);
            const valor = celda.getValue();

            // Solo limpiar números (reps/peso) o estrellas
            if (
                typeof valor === "number" ||
                (typeof valor === "string" && valor.includes("★"))
            ) {
                celda.clearContent();
            }
        }
    });
}

// ========== BORRAR MESOCICLO ==========
function borrarMesociclo() {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Encontrar hojas a borrar
    const hojasABorrar = ss.getSheets().filter((h) => {
        const nombre = h.getName();
        return nombre.match(/^Semana \d+$/) && nombre !== "Semana 1";
    });

    if (hojasABorrar.length === 0) {
        ui.alert(
            "ℹ️ Info",
            'No hay semanas para borrar.\n\nSolo existe "Semana 1".',
            ui.ButtonSet.OK
        );
        return;
    }

    // Listar hojas que se borrarán
    const nombresHojas = hojasABorrar.map((h) => h.getName()).join("\n• ");

    // Pedir confirmación
    const confirmacion = ui.alert(
        "🗑️ Borrar Mesociclo",
        `Se borrarán las siguientes ${hojasABorrar.length} hojas:\n\n• ${nombresHojas}\n\n⚠️ Esta acción NO se puede deshacer.\n\n¿Estás seguro?`,
        ui.ButtonSet.YES_NO
    );

    if (confirmacion !== ui.Button.YES) {
        ui.alert("Cancelado", "No se borró ninguna hoja.", ui.ButtonSet.OK);
        return;
    }

    // Segunda confirmación
    const confirmacion2 = ui.prompt(
        "⚠️ Confirmación Final",
        `Escribe "BORRAR" para confirmar la eliminación de ${hojasABorrar.length} semanas:`,
        ui.ButtonSet.OK_CANCEL
    );

    if (
        confirmacion2.getSelectedButton() !== ui.Button.OK ||
        confirmacion2.getResponseText().toUpperCase() !== "BORRAR"
    ) {
        ui.alert("Cancelado", "No se borró ninguna hoja.", ui.ButtonSet.OK);
        return;
    }

    // Borrar hojas
    hojasABorrar.forEach((hoja) => {
        ss.deleteSheet(hoja);
    });

    ui.alert(
        "✅ Mesociclo Borrado",
        `Se eliminaron ${hojasABorrar.length} semanas.\n\nSolo queda "Semana 1".`,
        ui.ButtonSet.OK
    );
}

