// ============================================================
// 🏋️ GYM TRACKER - Body Map (SVG muscular coloreado)
// Lee tabla Fatiga, llama a Vercel para render, inserta imágenes
// ============================================================

// ========== CONFIGURACIÓN ==========
const BODYMAP_CONFIG = {
    // Hoja y rango de la tabla de músculos/series
    SHEET_NAME: "Fatiga",
    MUSCLE_COL: 3,   // Columna C
    SERIES_COL: 4,   // Columna D
    START_ROW: 2,    // Fila donde empiezan los datos (después del header)

    // Celdas ancla para las imágenes (fila, columna)
    // Ejemplo solicitado: Frente en H13 y Espalda en K13
    FRONT_ANCHOR: { row: 13, col: 8 },   // H13
    BACK_ANCHOR: { row: 13, col: 11 },   // K13

    // Tamaño/posicionamiento:
    // - Alto: ~N filas (se calcula en px según el rowHeight real de la hoja)
    // - Ancho: proporcional al alto (mantiene aspecto)
    TARGET_HEIGHT_ROWS: 16,
    ASPECT_RATIO: 300 / 550, // ancho/alto (ajusta si querés más ancho o más angosto)

    // Script Property key para la URL de Vercel
    RENDER_URL_PROP: "BODYMAP_RENDER_URL"
};

// ========== MAPEO MÚSCULOS ES → SVG IDs ==========
// Clave: nombre en español (lowercase), Valor: array de group IDs del SVG
const MUSCLE_TO_SVG_IDS = {
    "pecho": ["chest"],
    "abdominales": ["abdominals"],
    "oblicuos": ["obliques"],
    "biceps": ["biceps"],
    "triceps": ["triceps"],
    "antebrazos": ["forearms"],
    "cuadriceps": ["quads"],
    "isquiotibiales": ["hamstrings"],
    "gluteos": ["glutes"],
    "gemelos": ["calves"],
    "espalda": ["lats", "lowerback", "traps", "traps-middle"],
    "deltoides anterior": ["front-shoulders"],
    "deltoides lateral": ["front-shoulders"],  // Aproximación (no hay grupo separado)
    "deltoides posterior": ["rear-shoulders"],
    "manos": ["hands"]
    // Ignorados (no existen en el SVG): Aductores, Cuello
};

// ========== FUNCIÓN PRINCIPAL ==========
/**
 * Actualiza las imágenes del Body Map en la hoja Fatiga.
 * Lee la tabla de músculos/series, llama a Vercel para renderizar
 * las vistas front/back, y reemplaza las imágenes flotantes.
 */
function actualizarBodyMap() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(BODYMAP_CONFIG.SHEET_NAME);

    if (!sheet) {
        SpreadsheetApp.getUi().alert(
            "❌ No se encontró la hoja '" + BODYMAP_CONFIG.SHEET_NAME + "'"
        );
        return;
    }

    // 1) Leer tabla de músculos/series
    const seriesByMuscle = leerTablaFatiga_(sheet);
    if (Object.keys(seriesByMuscle).length === 0) {
        SpreadsheetApp.getUi().alert("❌ No se encontraron datos en la tabla de músculos");
        return;
    }

    // 2) Calcular intensidades relativas al máximo
    const intensityByGroupId = calcularIntensidades_(seriesByMuscle);

    // 3) Obtener URL de Vercel
    const renderUrl = getRenderUrl_();
    if (!renderUrl) {
        SpreadsheetApp.getUi().alert(
            "❌ Falta configurar la URL de Vercel.\n\n" +
            "Ve a: Extensiones → Apps Script → ⚙️ Configuración del proyecto → Propiedades de secuencia de comandos\n" +
            "Agrega: " + BODYMAP_CONFIG.RENDER_URL_PROP + " = tu URL de Vercel"
        );
        return;
    }

    // 4) Renderizar y reemplazar imágenes
    try {
        SpreadsheetApp.getActiveSpreadsheet().toast("Generando body map (frente)...", "🧍 Body Map", 10);
        const frontBlob = renderizarVista_(renderUrl, "front", intensityByGroupId);

        SpreadsheetApp.getActiveSpreadsheet().toast("Generando body map (espalda)...", "🧍 Body Map", 10);
        const backBlob = renderizarVista_(renderUrl, "back", intensityByGroupId);

        // 5) Insertar/reemplazar imágenes
        SpreadsheetApp.getActiveSpreadsheet().toast("Insertando imágenes...", "🧍 Body Map", 5);
        reemplazarImagen_(sheet, BODYMAP_CONFIG.FRONT_ANCHOR, frontBlob, "bodymap_front");
        reemplazarImagen_(sheet, BODYMAP_CONFIG.BACK_ANCHOR, backBlob, "bodymap_back");

        SpreadsheetApp.getActiveSpreadsheet().toast("✅ Body Map actualizado!", "🧍 Body Map", 3);

    } catch (error) {
        SpreadsheetApp.getUi().alert("❌ Error al generar Body Map:\n\n" + error.message);
        console.error("BodyMap error:", error);
    }
}

// ========== LECTURA DE TABLA ==========
/**
 * Lee la tabla de músculos/series de la hoja Fatiga.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Object} { musculoNombre: series, ... }
 */
function leerTablaFatiga_(sheet) {
    const lastRow = sheet.getLastRow();
    if (lastRow < BODYMAP_CONFIG.START_ROW) {
        return {};
    }

    const numRows = lastRow - BODYMAP_CONFIG.START_ROW + 1;
    const muscleRange = sheet.getRange(
        BODYMAP_CONFIG.START_ROW,
        BODYMAP_CONFIG.MUSCLE_COL,
        numRows,
        1
    );
    const seriesRange = sheet.getRange(
        BODYMAP_CONFIG.START_ROW,
        BODYMAP_CONFIG.SERIES_COL,
        numRows,
        1
    );

    const muscles = muscleRange.getValues();
    const series = seriesRange.getValues();

    const result = {};
    for (let i = 0; i < muscles.length; i++) {
        const muscleName = muscles[i][0];
        const seriesValue = series[i][0];

        if (muscleName && typeof seriesValue === "number" && seriesValue > 0) {
            result[muscleName.toString().trim()] = seriesValue;
        }
    }

    return result;
}

// ========== CÁLCULO DE INTENSIDADES ==========
/**
 * Convierte series por músculo a intensidades (0-1) por grupo SVG.
 * Usa escala relativa al máximo.
 * @param {Object} seriesByMuscle
 * @returns {Object} { svgGroupId: intensity, ... }
 */
function calcularIntensidades_(seriesByMuscle) {
    // Encontrar el máximo
    const allSeries = Object.values(seriesByMuscle);
    const maxSeries = Math.max(...allSeries, 1); // Evitar división por 0

    const result = {};

    for (const [muscleName, series] of Object.entries(seriesByMuscle)) {
        const normalizedName = muscleName.toLowerCase().trim();
        const svgIds = MUSCLE_TO_SVG_IDS[normalizedName];

        if (svgIds && svgIds.length > 0) {
            const intensity = series / maxSeries;

            // Asignar la misma intensidad a todos los grupos mapeados
            for (const groupId of svgIds) {
                // Si ya existe, usar el máximo (por si un músculo mapea a varios grupos)
                result[groupId] = Math.max(result[groupId] || 0, intensity);
            }
        }
    }

    return result;
}

// ========== RENDER EN VERCEL ==========
/**
 * Llama al endpoint de Vercel para renderizar una vista del body map.
 * @param {string} baseUrl
 * @param {string} view "front" | "back"
 * @param {Object} intensityByGroupId
 * @returns {GoogleAppsScript.Base.Blob}
 */
function renderizarVista_(baseUrl, view, intensityByGroupId) {
    const url = baseUrl.replace(/\/$/, "") + "/api/bodymap";

    const payload = {
        view: view,
        intensityByGroupId: intensityByGroupId
    };

    const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode !== 200) {
        throw new Error(
            "Vercel respondió con código " + responseCode + ": " + response.getContentText()
        );
    }

    return response.getBlob().setName("bodymap_" + view + ".png");
}

// ========== MANEJO DE IMÁGENES FLOTANTES ==========
/**
 * Reemplaza (o inserta) una imagen flotante en la hoja.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Object} anchor { row, col }
 * @param {GoogleAppsScript.Base.Blob} blob
 * @param {string} imageKey Identificador para encontrar la imagen existente
 */
function reemplazarImagen_(sheet, anchor, blob, imageKey) {
    // Buscar y eliminar imagen existente:
    // - Primero por tag (bodymap_front/bodymap_back) o por ancla exacta
    // - Si no había nada (primera vez), borrar "cerca" del ancla para pisar fotos puestas manualmente
    const images = sheet.getImages();
    let removedAny = false;

    for (const img of images) {
        const imgAnchor = img.getAnchorCell();

        const hasTitleGetter = typeof img.getAltTextTitle === "function";
        const hasDescGetter = typeof img.getAltTextDescription === "function";
        const title = hasTitleGetter ? (img.getAltTextTitle() || "") : "";
        const desc = hasDescGetter ? (img.getAltTextDescription() || "") : "";
        const matchesKey = title === imageKey || desc === imageKey;

        const matchesAnchor =
            imgAnchor.getRow() === anchor.row && imgAnchor.getColumn() === anchor.col;

        if (matchesKey || matchesAnchor) {
            img.remove();
            removedAny = true;
        }
    }

    // Fallback (primera ejecución / imagen vieja movida a mano):
    // borrar si está en un rango chico alrededor del ancla
    if (!removedAny) {
        for (const img of images) {
            const imgAnchor = img.getAnchorCell();
            if (
                Math.abs(imgAnchor.getRow() - anchor.row) <= 2 &&
                Math.abs(imgAnchor.getColumn() - anchor.col) <= 2
            ) {
                img.remove();
            }
        }
    }

    // Insertar nueva imagen
    const newImage = sheet.insertImage(
        blob,
        anchor.col,
        anchor.row
    );

    // Tag para poder reemplazar SIEMPRE esta imagen en futuras actualizaciones
    if (typeof newImage.setAltTextTitle === "function") newImage.setAltTextTitle(imageKey);
    if (typeof newImage.setAltTextDescription === "function") newImage.setAltTextDescription(imageKey);

    // Ajustar tamaño: alto ≈ N filas, ancho proporcional (aspect ratio)
    const heightPx = calcularAltoEnPx_(sheet, anchor.row, BODYMAP_CONFIG.TARGET_HEIGHT_ROWS);
    const widthPx = Math.max(50, Math.round(heightPx * BODYMAP_CONFIG.ASPECT_RATIO));

    newImage.setHeight(heightPx);
    newImage.setWidth(widthPx);
}

/**
 * Calcula alto en px equivalente a N filas, empezando desde startRow.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} startRow
 * @param {number} numRows
 * @returns {number}
 */
function calcularAltoEnPx_(sheet, startRow, numRows) {
    let sum = 0;
    for (let r = startRow; r < startRow + numRows; r++) {
        sum += sheet.getRowHeight(r);
    }
    return sum;
}

// ========== UTILIDADES ==========
/**
 * Obtiene la URL de Vercel desde Script Properties.
 * @returns {string|null}
 */
function getRenderUrl_() {
    const props = PropertiesService.getScriptProperties();
    return props.getProperty(BODYMAP_CONFIG.RENDER_URL_PROP);
}

/**
 * Función de utilidad para configurar la URL de Vercel desde el menú.
 */
function configurarUrlVercel() {
    const ui = SpreadsheetApp.getUi();
    const currentUrl = getRenderUrl_() || "";

    const response = ui.prompt(
        "🔧 Configurar URL de Vercel",
        "Ingresa la URL base de tu deployment de Vercel (ej: https://tu-proyecto.vercel.app):\n\nActual: " +
        (currentUrl || "(no configurada)"),
        ui.ButtonSet.OK_CANCEL
    );

    if (response.getSelectedButton() === ui.Button.OK) {
        const newUrl = response.getResponseText().trim();
        if (newUrl) {
            PropertiesService.getScriptProperties().setProperty(
                BODYMAP_CONFIG.RENDER_URL_PROP,
                newUrl
            );
            ui.alert("✅ URL guardada correctamente:\n" + newUrl);
        }
    }
}

