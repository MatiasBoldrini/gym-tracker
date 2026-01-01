// ============================================================
// 🏋️ GYM TRACKER - Integración con IA
// Copiar rutina como prompt y pegar rutina desde IA
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

    // Detectar días y extraer ejercicios (detectarDias está en BorrarDatosDia.gs)
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

    // Modal que copia y se cierra automáticamente
    const html = HtmlService.createHtmlOutput(`
        <html><body>
        <p style="font-family:sans-serif;font-size:14px;">Copiando...</p>
        <script>
            (function() {
                const texto = '${promptEscaped}';
                
                // Copiar usando textarea (más compatible)
                const ta = document.createElement('textarea');
                ta.value = texto;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                
                // Cerrar inmediatamente
                google.script.host.close();
            })();
        </script>
        </body></html>
    `)
        .setWidth(150)
        .setHeight(50);

    ui.showModelessDialog(html, "📋");

    // Pequeña pausa para que el dialog se ejecute
    Utilities.sleep(500);

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

// ========== FUNCIONES AUXILIARES ==========

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

        // Detectar días en la hoja (detectarDias está en BorrarDatosDia.gs)
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

