// ============================================================
// 🏋️ GYM TRACKER - Menú Principal y Triggers
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
    .addSubMenu(
      SpreadsheetApp.getUi()
        .createMenu("🧍 Body Map")
        .addItem("🔄 Actualizar Body Map", "actualizarBodyMap")
        .addItem("🔧 Configurar URL Vercel", "configurarUrlVercel")
    )
    .addSeparator()
    .addItem("⚙️ Activar auto-actualización (1h)", "crearTrigger")
    .addItem("❌ Desactivar auto-actualización", "eliminarTriggers")
    .addToUi();
}

// Funciones para cada día (llaman a la función genérica en BorrarDatosDia.gs)
function borrarDia1() {
  borrarDatosDia(1);
}
function borrarDia2() {
  borrarDatosDia(2);
}
function borrarDia3() {
  borrarDatosDia(3);
}
function borrarDia4() {
  borrarDatosDia(4);
}
function borrarDia5() {
  borrarDatosDia(5);
}

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
          celda.includes("FRECUENCIA_MUSCULO") ||
          celda.includes("SERIES_MUSCULO_EN_DIA") ||
          celda.includes("GRILLA_SERIES_FATIGA")
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
