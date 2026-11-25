// ============================================================
// 🏋️ GYM TRACKER - Integración con IA
// Copiar rutina como prompt y pegar rutina desde IA
// ============================================================

// ========== COPIAR RUTINA COMO PROMPT ==========
function copiarRutinaComoPrompt() {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1) Rutina: siempre desde "Semana 1"
    const hojaSemana1 = ss.getSheetByName("Semana 1");
    if (!hojaSemana1) {
        ui.alert("❌ Error", 'No se encontró la hoja "Semana 1".', ui.ButtonSet.OK);
        return;
    }

    const dias = detectarDias(hojaSemana1);
    const datosSemana = hojaSemana1.getDataRange().getValues();

    // 2) Ejercicios: "Ejercicios" col A (solo nombres)
    const hojaEjercicios =
        obtenerHojaPorNombreFlexible_(ss, "Ejercicios") ||
        obtenerHojaPorNombreFlexible_(ss, "Ejercicio");
    let listaEjercicios = [];
    if (hojaEjercicios) {
        const colA = hojaEjercicios.getRange("A:A").getValues();
        listaEjercicios = colA
            .map((r) => (r[0] ?? "").toString().trim())
            .filter((v, idx) => idx > 0 && v !== "");
    }

    // Prompt mínimo (sin notas, sin agrupamientos)
    let prompt = "";
    prompt += "RUTINA\n";
    prompt += "-----------------\n\n";

    dias.forEach((dia) => {
        prompt += `DIA ${dia.numero}\n`;
        for (let fila = dia.filaInicio + 1; fila <= dia.filaFin; fila++) {
            const row = datosSemana[fila - 1];
            const ejercicio = (row?.[0] ?? "").toString().trim();
            const series = (row?.[1] ?? "").toString().trim();

            if (!ejercicio) continue;
            if (ejercicio.toLowerCase() === "ejercicio") continue;

            prompt += `- ${ejercicio}${series ? ` | ${series}` : ""}\n`;
        }
        prompt += "\n";
    });

    prompt += "EJERCICIOS (hoja Ejercicios, col A)\n";
    prompt += "----------------------------------\n";
    if (listaEjercicios.length === 0) {
        prompt += "(No se encontró la hoja 'Ejercicios' o está vacía)\n\n";
    } else {
        prompt += listaEjercicios.map((e) => `- ${e}`).join("\n") + "\n\n";
    }

    prompt += "Cuando se te pida la rutina para el excel o google sheets, responde SOLO JSON (sin notas) con la rutina personalizada, siguiendo este formato:\n";
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


    const tpl = HtmlService.createTemplate(`
      <html>
        <head>
          <base target="_top">
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; padding: 12px; }
            .row { margin-top: 10px; display: flex; gap: 10px; align-items: center; }
            button { padding: 10px 14px; cursor: pointer; }
            .ok { color: #188038; display: none; }
            .err { color: #d93025; display: none; }
          </style>
        </head>
        <body>
          <div style="margin-bottom:8px;">Click en <b>Copiar</b> para copiar el prompt (puede ser largo).</div>
          <textarea id="prompt" readonly style="position:fixed;left:-9999px;opacity:0;height:1px;width:1px;"><?= prompt ?></textarea>
          <div class="row">
            <button onclick="copiar()">📋 Copiar</button>
            <button onclick="google.script.host.close()">Cerrar</button>
            <span id="ok" class="ok">✅ Copiado</span>
            <span id="err" class="err">❌ No se pudo copiar</span>
          </div>
          <script>
            const promptField = document.getElementById('prompt');
            const texto = promptField.value;

            async function copiar() {
              const okEl = document.getElementById('ok');
              const errEl = document.getElementById('err');
              okEl.style.display = 'none';
              errEl.style.display = 'none';

              let ok = false;
              try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  await navigator.clipboard.writeText(texto);
                  ok = true;
                }
              } catch (e) {}

              if (!ok) {
                try {
                  promptField.focus();
                  promptField.select();
                  ok = document.execCommand('copy');
                } catch (e) {}
              }

              if (ok) {
                okEl.style.display = 'inline';
              } else {
                errEl.style.display = 'inline';
              }

              try { google.script.run.toastResultadoCopia_(ok); } catch (e) {}
            }
          </script>
        </body>
      </html>
    `);
    tpl.prompt = prompt;
    const html = tpl.evaluate().setWidth(650).setHeight(470);
    ui.showModalDialog(html, "📋 Copiar rutina como prompt");
}

function toastResultadoCopia_(ok) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ok) {
        ss.toast("📋 Prompt copiado al portapapeles", "✅ Listo", 3);
    } else {
        ss.toast("No se pudo copiar automáticamente. Probá de nuevo (a veces el navegador lo bloquea).", "⚠️", 5);
    }
}

function obtenerHojaPorNombreFlexible_(ss, nombreBuscado) {
    const norm = (s) =>
        (s || "")
            .toString()
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");

    const target = norm(nombreBuscado);
    const sheets = ss.getSheets();

    // Match exact normalizado
    for (const sh of sheets) {
        if (norm(sh.getName()) === target) return sh;
    }
    // Match "incluye" por si hay prefijos/sufijos
    for (const sh of sheets) {
        if (norm(sh.getName()).includes(target)) return sh;
    }
    return null;
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

        if (!Array.isArray(datos?.dias)) {
            return { success: false, message: "El JSON debe tener una propiedad 'dias' con un array." };
        }

        const esTextoOpcional = (valor) => valor == null ||
            (typeof valor === "string" && !valor.trimStart().startsWith("="));
        const formatoValido = datos.dias.every((dia) => {
            if (!Number.isInteger(dia?.dia) || dia.dia < 1) return false;
            const ejercicios = dia.ejercicios ?? [];
            return Array.isArray(ejercicios) && ejercicios.every((ejercicio) =>
                ejercicio && typeof ejercicio === "object" && !Array.isArray(ejercicio) &&
                esTextoOpcional(ejercicio.ejercicio) && esTextoOpcional(ejercicio.series));
        });
        if (!formatoValido) {
            return { success: false, message: "Revisá los días y ejercicios. Los nombres y las series deben ser texto sin fórmulas." };
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
            const ejercicios = diaData.ejercicios ?? [];

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

