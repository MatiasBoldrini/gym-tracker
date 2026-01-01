// ============================================================
// 🏋️ GYM TRACKER - Apps Script
// Sistema de seguimiento de rutinas de gimnasio
// ============================================================

// ========== MENÚ ==========
function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu("🏋️ Gym Tools")
        .addItem("🔄 Actualizar datos", "actualizarPRs")
        .addSeparator()
        .addSubMenu(
            SpreadsheetApp.getUi()
                .createMenu("🧹 Borrar día")
                .addItem("Día 1", "borrarDia1")
                .addItem("Día 2", "borrarDia2")
                .addItem("Día 3", "borrarDia3")
                .addItem("Día 4", "borrarDia4")
                .addItem("Día 5", "borrarDia5")
        )
        .addSubMenu(
            SpreadsheetApp.getUi()
                .createMenu("📅 Mesociclo")
                .addItem("➕ Crear Mesociclo", "crearMesociclo")
                .addItem("🗑️ Borrar Mesociclo", "borrarMesociclo")
        )
        .addSubMenu(
            SpreadsheetApp.getUi()
                .createMenu("🤖 IA")
                .addItem("📋 Copiar rutina como prompt", "copiarRutinaComoPrompt")
                .addItem("📥 Pegar rutina desde IA", "pegarRutinaDesdeIA")
        )
        .addSeparator()
        .addItem("⚙️ Activar auto-actualización (1h)", "crearTrigger")
        .addItem("❌ Desactivar auto-actualización", "eliminarTriggers")
        .addToUi();
}

// Funciones para cada día (llaman a la función genérica)
function borrarDia1() { borrarDatosDia(1); }
function borrarDia2() { borrarDatosDia(2); }
function borrarDia3() { borrarDatosDia(3); }
function borrarDia4() { borrarDatosDia(4); }
function borrarDia5() { borrarDatosDia(5); }

// ========== ACTUALIZAR DATOS (manual o automático) ==========
function actualizarPRs() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Hojas donde buscar fórmulas personalizadas
    const hojasAActualizar = ["Calculadora", "RM", "Fatiga", "Calculos Aux."];

    hojasAActualizar.forEach((nombreHoja) => {
        const hoja = ss.getSheetByName(nombreHoja);
        if (!hoja) return;

        const rango = hoja.getDataRange();
        const formulas = rango.getFormulas();

        formulas.forEach((fila, i) => {
            fila.forEach((celda, j) => {
                if (
                    celda.includes("TABLA_PRS") ||
                    celda.includes("PROMEDIO_ESTRELLAS") ||
                    celda.includes("FRECUENCIA_MUSCULO")
                ) {
                    const cell = hoja.getRange(i + 1, j + 1);
                    const formula = cell.getFormula();
                    cell.clearContent();
                    SpreadsheetApp.flush();
                    cell.setFormula(formula);
                }
            });
        });
    });
}

// ========== TRIGGER AUTOMÁTICO ==========
function crearTrigger() {
    eliminarTriggers();

    ScriptApp.newTrigger("actualizarPRs").timeBased().everyHours(1).create();

    SpreadsheetApp.getUi().alert(
        "✅ Auto-actualización activada!\n\nLos datos se actualizarán cada hora automáticamente."
    );
}

function eliminarTriggers() {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach((trigger) => {
        if (trigger.getHandlerFunction() === "actualizarPRs") {
            ScriptApp.deleteTrigger(trigger);
        }
    });
}

// ============================================================
// FUNCIONES PERSONALIZADAS (para usar en celdas)
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

// ============================================================
// BORRAR DATOS DE UN DÍA
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

// Detecta los días y sus rangos de filas en una hoja
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

// ============================================================
// GESTIÓN DE MESOCICLOS
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

    const numSemanas = parseInt(respuesta.getResponseText());

    if (isNaN(numSemanas) || numSemanas < 2) {
        ui.alert(
            "❌ Error",
            "Ingresa un número válido mayor a 1.",
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

// ============================================================
// INTEGRACIÓN CON IA
// ============================================================

// ========== COPIAR RUTINA COMO PROMPT ==========
function copiarRutinaComoPrompt() {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaActual = ss.getActiveSheet();
    const nombreHoja = hojaActual.getName();

    // Obtener lista de ejercicios disponibles
    const hojaEjercicios = ss.getSheetByName("Ejercicios");
    let ejerciciosDisponibles = [];

    if (hojaEjercicios) {
        const datosEjercicios = hojaEjercicios.getRange("A:B").getValues();
        ejerciciosDisponibles = datosEjercicios
            .filter((fila, index) => index > 0 && fila[0] && fila[0].toString().trim() !== "")
            .map((fila) => ({
                nombre: fila[0].toString().trim(),
                grupo: fila[1] ? fila[1].toString().trim() : ""
            }));
    }

    // Obtener rutina actual
    let rutina = [];
    let hojaRutina = hojaActual;

    // Si no estamos en una hoja de Semana, usar Semana 1
    if (!nombreHoja.startsWith("Semana")) {
        hojaRutina = ss.getSheetByName("Semana 1");
        if (!hojaRutina) {
            ui.alert("❌ Error", "No se encontró ninguna hoja de semana.", ui.ButtonSet.OK);
            return;
        }
    }

    // Detectar días y extraer ejercicios
    const dias = detectarDias(hojaRutina);
    const datosHoja = hojaRutina.getDataRange().getValues();

    dias.forEach((dia) => {
        const ejerciciosDia = [];

        for (let fila = dia.filaInicio; fila <= dia.filaFin; fila++) {
            const rowData = datosHoja[fila - 1];
            const ejercicio = rowData[0] ? rowData[0].toString().trim() : "";
            const series = rowData[1] ? rowData[1].toString().trim() : "";
            const notas = rowData[3] ? rowData[3].toString().trim() : "";

            // Saltar filas vacías, encabezados y filas de estrellas
            if (
                !ejercicio ||
                ejercicio.toUpperCase().includes("DIA") ||
                ejercicio.toLowerCase().includes("ejercicio")
            ) {
                continue;
            }

            if (ejercicio) {
                ejerciciosDia.push({
                    ejercicio: ejercicio,
                    series: series,
                    notas: notas
                });
            }
        }

        if (ejerciciosDia.length > 0) {
            rutina.push({
                dia: dia.numero,
                ejercicios: ejerciciosDia
            });
        }
    });

    // Construir el prompt
    let prompt = "=== RUTINA ACTUAL ===\n\n";

    if (rutina.length > 0) {
        rutina.forEach((dia) => {
            prompt += `DÍA ${dia.dia}:\n`;
            dia.ejercicios.forEach((ej) => {
                prompt += `  - ${ej.ejercicio}`;
                if (ej.series) prompt += ` | ${ej.series}`;
                if (ej.notas) prompt += ` | Notas: ${ej.notas}`;
                prompt += "\n";
            });
            prompt += "\n";
        });
    } else {
        prompt += "(Sin ejercicios cargados)\n\n";
    }

    prompt += "=== EJERCICIOS DISPONIBLES ===\n\n";

    if (ejerciciosDisponibles.length > 0) {
        // Agrupar por grupo muscular
        const porGrupo = {};
        ejerciciosDisponibles.forEach((ej) => {
            const grupo = ej.grupo || "Sin grupo";
            if (!porGrupo[grupo]) porGrupo[grupo] = [];
            porGrupo[grupo].push(ej.nombre);
        });

        Object.keys(porGrupo).sort().forEach((grupo) => {
            prompt += `${grupo.toUpperCase()}:\n`;
            porGrupo[grupo].forEach((nombre) => {
                prompt += `  - ${nombre}\n`;
            });
            prompt += "\n";
        });
    } else {
        prompt += "(No se encontró la hoja 'Ejercicios')\n";
    }

    prompt += "=== FORMATO PARA RESPONDER ===\n\n";
    prompt += "Responde con un JSON con esta estructura:\n";
    prompt += '{\n';
    prompt += '  "dias": [\n';
    prompt += '    {\n';
    prompt += '      "dia": 1,\n';
    prompt += '      "ejercicios": [\n';
    prompt += '        {"ejercicio": "Nombre", "series": "3 x 8-12"}\n';
    prompt += '      ]\n';
    prompt += '    }\n';
    prompt += '  ]\n';
    prompt += '}\n';

    // Escapar el prompt para JavaScript
    const promptEscaped = prompt
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n');

    // Modal invisible que copia y se cierra automáticamente
    const html = HtmlService.createHtmlOutput(`
        <script>
            const texto = '${promptEscaped}';
            navigator.clipboard.writeText(texto).then(() => {
                google.script.host.close();
            }).catch(() => {
                // Fallback para navegadores sin soporte
                const ta = document.createElement('textarea');
                ta.value = texto;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                google.script.host.close();
            });
        </script>
    `)
        .setWidth(1)
        .setHeight(1);

    ui.showModalDialog(html, " ");

    // Mostrar toast de confirmación
    ss.toast("📋 Prompt copiado al portapapeles", "✅ Listo", 3);
}

// ========== PEGAR RUTINA DESDE IA ==========
function pegarRutinaDesdeIA() {
    const ui = SpreadsheetApp.getUi();

    const html = HtmlService.createHtmlOutput(`
        <style>
            body { font-family: Arial, sans-serif; padding: 15px; }
            textarea { width: 100%; height: 300px; font-family: monospace; font-size: 12px; margin-bottom: 10px; }
            button { padding: 10px 20px; cursor: pointer; margin-right: 10px; }
            .btn-primary { background: #4285f4; color: white; border: none; border-radius: 4px; }
            .btn-secondary { background: #ddd; border: none; border-radius: 4px; }
            .error { color: red; margin-top: 10px; }
            .info { color: #666; font-size: 12px; margin-bottom: 10px; }
            select { padding: 8px; margin-bottom: 10px; }
        </style>
        
        <p class="info">Pegá el JSON que te dio la IA con la rutina:</p>
        
        <label>Hoja destino: </label>
        <select id="hoja">
            <option value="">Hoja activa</option>
        </select>
        <br><br>
        
        <textarea id="json" placeholder='{
  "dias": [
    {
      "dia": 1,
      "ejercicios": [
        {"ejercicio": "Press banca", "series": "3 x 8-12"}
      ]
    }
  ]
}'></textarea>
        
        <div id="error" class="error"></div>
        
        <button class="btn-primary" onclick="pegar()">📥 Pegar rutina</button>
        <button class="btn-secondary" onclick="google.script.host.close()">Cancelar</button>
        
        <script>
            // Cargar hojas disponibles
            google.script.run.withSuccessHandler(function(hojas) {
                const select = document.getElementById('hoja');
                hojas.forEach(function(h) {
                    const option = document.createElement('option');
                    option.value = h;
                    option.textContent = h;
                    select.appendChild(option);
                });
            }).obtenerHojasSemana();
            
            function pegar() {
                const json = document.getElementById('json').value.trim();
                const hoja = document.getElementById('hoja').value;
                const errorDiv = document.getElementById('error');
                
                if (!json) {
                    errorDiv.textContent = 'Por favor, pegá el JSON de la rutina.';
                    return;
                }
                
                try {
                    // Validar JSON
                    JSON.parse(json);
                } catch (e) {
                    errorDiv.textContent = 'Error: El JSON no es válido. ' + e.message;
                    return;
                }
                
                errorDiv.textContent = '';
                
                google.script.run
                    .withSuccessHandler(function(result) {
                        if (result.success) {
                            alert(result.message);
                            google.script.host.close();
                        } else {
                            errorDiv.textContent = result.message;
                        }
                    })
                    .withFailureHandler(function(error) {
                        errorDiv.textContent = 'Error: ' + error.message;
                    })
                    .procesarRutinaJSON(json, hoja);
            }
        </script>
    `)
        .setWidth(550)
        .setHeight(500)
        .setTitle("📥 Pegar rutina desde IA");

    ui.showModalDialog(html, "📥 Pegar rutina desde IA");
}

// Obtiene la lista de hojas "Semana X" para el selector
function obtenerHojasSemana() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return ss.getSheets()
        .filter((h) => h.getName().startsWith("Semana"))
        .map((h) => h.getName())
        .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] || 0);
            const numB = parseInt(b.match(/\d+/)?.[0] || 0);
            return numA - numB;
        });
}

// Procesa el JSON y escribe los datos en la hoja
function procesarRutinaJSON(jsonString, nombreHoja) {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        let hoja;

        if (nombreHoja && nombreHoja.trim() !== "") {
            hoja = ss.getSheetByName(nombreHoja);
        } else {
            hoja = ss.getActiveSheet();
        }

        if (!hoja) {
            return { success: false, message: "No se encontró la hoja destino." };
        }

        const nombreHojaFinal = hoja.getName();
        if (!nombreHojaFinal.startsWith("Semana")) {
            return { success: false, message: `La hoja "${nombreHojaFinal}" no es una hoja de semana válida.` };
        }

        // Parsear JSON
        const datos = JSON.parse(jsonString);

        if (!datos.dias || !Array.isArray(datos.dias)) {
            return { success: false, message: "El JSON debe tener una propiedad 'dias' con un array." };
        }

        // Detectar días en la hoja
        const diasHoja = detectarDias(hoja);

        if (diasHoja.length === 0) {
            return { success: false, message: "No se detectaron días en la hoja. Verificá la estructura." };
        }

        let ejerciciosEscritos = 0;
        let diasProcesados = 0;

        datos.dias.forEach((diaData) => {
            const numDia = diaData.dia;
            const ejercicios = diaData.ejercicios || [];

            // Encontrar el día correspondiente en la hoja
            const diaHoja = diasHoja.find((d) => d.numero === numDia);

            if (!diaHoja) {
                return; // Saltar si el día no existe en la hoja
            }

            diasProcesados++;

            // Escribir ejercicios (empezando desde la fila después del encabezado)
            const filaInicio = diaHoja.filaInicio + 1;
            const filasDisponibles = diaHoja.filaFin - filaInicio;

            ejercicios.forEach((ej, index) => {
                if (index > filasDisponibles) return; // No hay más espacio

                const fila = filaInicio + index;

                // Columna A: Ejercicio
                if (ej.ejercicio) {
                    hoja.getRange(fila, 1).setValue(ej.ejercicio);
                    ejerciciosEscritos++;
                }

                // Columna B: Series
                if (ej.series) {
                    hoja.getRange(fila, 2).setValue(ej.series);
                }
            });
        });

        return {
            success: true,
            message: `✅ Rutina cargada!\n\nDías procesados: ${diasProcesados}\nEjercicios escritos: ${ejerciciosEscritos}`
        };

    } catch (error) {
        return { success: false, message: "Error al procesar: " + error.message };
    }
}
