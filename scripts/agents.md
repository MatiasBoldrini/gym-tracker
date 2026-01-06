# Agents / Documentación de `scripts/`

Este directorio contiene **código de Google Apps Script** (aunque ahora los archivos tengan extensión `.js`). Se ejecuta dentro de un Spreadsheet y usa servicios como `SpreadsheetApp`, `ScriptApp` y `HtmlService`.

> Guía de estilo/modularidad del repo: ver `scripts/CONVENCIONES.md` (incluye la regla de no superar ~900 líneas por archivo).

---

## Estructura del Google Sheets

El spreadsheet **"Rutina Gym v3"** tiene las siguientes pestañas:

### `Semana 1` (y `Semana 2`, `Semana 3`, etc.)

Hojas de **registro de entrenamiento** organizadas por días. Se pueden crear múltiples semanas para un mesociclo.

| Columna | Contenido               | Notas                                      |
| ------- | ----------------------- | ------------------------------------------ |
| A       | Nombre del ejercicio    | Encabezado "DIA N" marca inicio de bloque  |
| B       | Series (ej: "3 x 8-12") | Dropdown desde hoja `Series`               |
| D       | Notas                   | Campo libre para observaciones             |
| F-G     | Serie 1: Reps / Peso    | Datos numéricos registrados por el usuario |
| H-I     | Serie 2: Reps / Peso    |                                            |
| J-K     | Serie 3: Reps / Peso    |                                            |
| L-M     | Serie 4: Reps / Peso    |                                            |

**Estructura por días:**

- Cada bloque comienza con una fila "DIA N" en columna A (ej: fila 2 = "DIA 1", fila 12 = "DIA 2")
- Debajo del encabezado: fila con headers "Series", "Notas", "Reps", "Peso" (×4 series)
- Filas siguientes: ejercicios del día (hasta ~6-8 ejercicios por día)
- Espacio en blanco entre días

### `Fatiga`

Dashboard de **análisis de volumen muscular** con visualización corporal.

| Sección           | Ubicación   | Contenido                                                     |
| ----------------- | ----------- | ------------------------------------------------------------- |
| Tabla de músculos | Cols C-F    | Músculo, series totales (barra visual), conteo por frecuencia |
| Calendario        | Cols H-N    | Distribución LUN-DOM de series por músculo                    |
| Resumen por día   | Filas 17-22 | DIA 1-5: día de semana, promedio ★, total series              |
| Body Map          | Derecha     | Imágenes SVG frontal/trasera coloreadas por fatiga muscular   |

**Músculos rastreados**: Espalda, Glúteos, Bíceps, Hombro, Tríceps, Cuádriceps, Isquiotibiales, Pecho.

### `RM`

Tabla de **Personal Records (Récords Personales)** generada automáticamente.

| Columna | Contenido                                          |
| ------- | -------------------------------------------------- |
| A       | Ejercicio                                          |
| B       | Peso PR (mejor peso registrado)                    |
| C       | Reps (repeticiones con ese peso)                   |
| D       | Fecha (formato SxDy = Semana x, Día y)             |
| E       | 1RM Estimado (cálculo Epley: peso × (1 + reps/30)) |

> Esta hoja usa la fórmula `=TABLA_PRS()` en A1 (definida en `FormulasPersonalizadas.js`).

### `Ejercicios`

**Catálogo maestro** de todos los ejercicios disponibles.

| Columna | Contenido                                      |
| ------- | ---------------------------------------------- |
| A       | Nombre del ejercicio                           |
| B       | Grupo Muscular (Pecho, Espalda, Glúteos, etc.) |
| C       | Categorías (para filtros/agrupación)           |
| D       | Imagen (nombre archivo .webp)                  |
| E       | Image names (archivos adicionales .webp)       |

**Grupos musculares**: Pecho, Espalda, Glúteos, Cuádriceps, Isquiotibiales, Hombro, Bíceps, Tríceps, Aductores, Gemelos, Abdominales, Cuello, Antebrazos.

### `Series`

Lista de **rangos de series predefinidos** para usar como dropdown en las hojas de semana.

Valores disponibles:

- `3 x 10-12`, `3 x 10-15`, `3 x 6-10`, `3 x 5-8`
- `3 x 8-10`, `3 x 8-12`, `2 x 10-15`, `2 x 6-10`
- `4 x 20-25`, `2 x 8-12`

### `Calificación`

Lista de **opciones de calificación con estrellas** para evaluar rendimiento por serie.

| Valor | Significado                          |
| ----- | ------------------------------------ |
| ★★★   | Excelente (RIR 0-1)                  |
| ★★☆   | Bueno (RIR 2-3)                      |
| ★☆☆   | Regular (RIR 4+, no llegué al fallo) |

---

## Mapa rápido (qué se ejecuta y cuándo)

- **Menú y triggers**: `MenuYTriggers.js`
  - Se ejecuta automáticamente con `onOpen()` al abrir la planilla (si el proyecto está vinculado).
  - Permite disparar manualmente funciones del resto de archivos.
  - Crea/elimina un trigger horario para refrescar fórmulas.
- **Operaciones sobre hojas “Semana X”**: `BorrarDatosDia.js`, `GestionMesociclos.js`, `IntegracionIA.js`
- **Funciones personalizadas de Sheets** (`=...`): `FormulasPersonalizadas.js`
- **Integración App Web (API)**: `WebAppAPI.js`

> Dependencia clave: `detectarDias()` está en `BorrarDatosDia.js` y lo usa `IntegracionIA.js` para leer/escribir rutinas por “DIA 1..N”.

---

## `MenuYTriggers.js` — Menú principal + trigger de auto-actualización

**Propósito**: agrega el menú “🏋️ Gym Tools” y conecta acciones del usuario con funciones del proyecto. Maneja un trigger horario para “refrescar” fórmulas personalizadas.

**Puntos de entrada**:

- `onOpen()`: crea el menú con:
  - “Actualizar datos” → `actualizarPRs()`
  - Submenú “Borrar día” → `borrarDia1..5()` (delegan en `borrarDatosDia(dia)` de `BorrarDatosDia.js`)
  - Submenú “Mesociclo” → `crearMesociclo()` / `borrarMesociclo()` (de `GestionMesociclos.js`)
  - Submenú “IA” → `copiarRutinaComoPrompt()` / `pegarRutinaDesdeIA()` (de `IntegracionIA.js`)
  - “Activar auto-actualización (1h)” → `crearTrigger()`
  - “Desactivar auto-actualización” → `eliminarTriggers()`

**Funciones principales**:

- `actualizarPRs()`: recorre hojas específicas (`Calculadora`, `RM`, `Fatiga`, `Calculos Aux.`) y, si encuentra fórmulas que incluyen `TABLA_PRS`, `PROMEDIO_ESTRELLAS` o `FRECUENCIA_MUSCULO`, las “reinserta” para forzar recálculo.
- `crearTrigger()`: borra triggers previos y crea uno `timeBased().everyHours(1)` que llama a `actualizarPRs`.
- `eliminarTriggers()`: elimina triggers cuyo handler sea `actualizarPRs`.

**Dependencias**:

- Llama a `borrarDatosDia(dia)` (en `BorrarDatosDia.js`).
- Llama a `crearMesociclo()` / `borrarMesociclo()` (en `GestionMesociclos.js`).
- Llama a `copiarRutinaComoPrompt()` / `pegarRutinaDesdeIA()` (en `IntegracionIA.js`).

---

## `BorrarDatosDia.js` — Borrar la carga de un día en una hoja de semana

**Propósito**: borrar (con confirmación) los datos del **Día N** dentro de una hoja `Semana ...`.

**Funciones principales**:

- `borrarDatosDia(diaSeleccionado)`:
  - Valida que la hoja activa empiece con `"Semana"`.
  - Usa `detectarDias(hoja)` para ubicar rangos por día.
  - Pide confirmación y limpia:
    - Col A (Ejercicio)
    - Col B (Series)
    - Col D (Notas)
    - Col F..M (Reps/Peso/Estrellas)
- `detectarDias(hoja)`:
  - Escanea la columna A buscando filas que contengan “DIA”.
  - Devuelve un array con `{ numero, filaInicio, filaFin }` para cada día detectado.

**Dependencias**:

- No depende de otros archivos.
- Es **dependencia** de `IntegracionIA.js` (para parsear la rutina por días) y de `MenuYTriggers.js` (acciones “Borrar Día”).

---

## `FormulasPersonalizadas.js` — Funciones personalizadas para usar en celdas

**Propósito**: provee funciones `@customfunction` para usarse como fórmulas en Sheets.

**Funciones**:

- `TABLA_PRS()`:
  - Recorre todas las hojas cuyo nombre empieza con `"Semana"`.
  - Detecta series donde hay pares `(reps, peso)` en columnas contiguas.
  - Calcula 1RM estimado (Epley-like) y guarda el mejor por ejercicio.
  - Devuelve una tabla con: `Ejercicio | Peso PR | Reps | Fecha (SxDy) | 1RM Estimado`.
- `PROMEDIO_ESTRELLAS(celda)`:
  - Para una referencia tipo `"F10"`, busca ese valor en todas las hojas `"Semana..."`.
  - Cuenta estrellas `★` en strings y devuelve promedio.
- `FRECUENCIA_MUSCULO(musculo, hoja)`:
  - Cuenta en una hoja (default `"Semana 1"`) cuántos días aparece un músculo (columna N / índice 13).
  - Máximo 1 vez por día, usando un `Set` por día detectado con “DIA”.

**Notas**:

- Estas funciones se recalculan de forma “natural” por Sheets, pero `MenuYTriggers.js` además tiene un mecanismo para “forzar” recálculo reinser­tando la fórmula.

---

## `GestionMesociclos.js` — Crear/Borrar semanas del mesociclo

**Propósito**: administrar hojas `Semana X` a partir de una plantilla `Semana 1`.

**Funciones principales**:

- `crearMesociclo()`:
  - Requiere que exista `Semana 1`.
  - Pregunta hasta qué semana crear (2..20).
  - Copia `Semana 1` para cada `Semana i` faltante y llama a `limpiarDatosSemana(nuevaHoja)`.
- `limpiarDatosSemana(hoja)`:
  - Limpia columnas F..M si encuentra números o estrellas `★` (evita arrastrar registros).
- `borrarMesociclo()`:
  - Lista y borra todas las hojas `Semana N` excepto `Semana 1`.
  - Pide doble confirmación, incluyendo escribir `"BORRAR"`.

**Dependencias**:

- No depende de otros archivos.
- Es llamado desde el menú en `MenuYTriggers.js`.

---

## `IntegracionIA.js` — Exportar rutina como prompt / Importar rutina desde IA

**Propósito**: facilitar un flujo con IA:

1. convertir la rutina actual a un prompt (texto) y copiarlo al portapapeles,
2. pegar un JSON generado por IA y escribir ejercicios/series en la hoja.

**Funciones principales**:

- `copiarRutinaComoPrompt()`:
  - Si no estás en una hoja `Semana...`, usa `Semana 1` como origen.
  - Lee ejercicios por día usando `detectarDias(hoja)` (en `BorrarDatosDia.js`) y construye un prompt.
  - Si existe hoja `Ejercicios`/`Ejercicio`, agrega catálogo de ejercicios disponibles (agrupados por grupo).
  - Abre un `HtmlService` mínimo para intentar copiar el prompt al portapapeles (Clipboard API / `execCommand('copy')`).
  - Reporta resultado con `toastResultadoCopia_(ok)`.
- `pegarRutinaDesdeIA()`:
  - Abre un modal con un textarea para pegar JSON y un selector de hoja destino.
  - Valida JSON en el frontend y llama server-side a `procesarRutinaJSON(json, hoja)`.
- `obtenerHojasSemana()`:
  - Devuelve lista de hojas `"Semana..."` ordenadas por número para poblar el selector.
- `procesarRutinaJSON(jsonString, nombreHoja)`:
  - Valida hoja destino (debe ser `Semana...`).
  - Parsea JSON con estructura `{ dias: [ { dia: number, ejercicios: [ { ejercicio, series } ] } ] }`.
  - Usa `detectarDias(hoja)` para ubicar dónde escribir cada día.
  - Escribe ejercicio en col A y series en col B, debajo del encabezado del día.

**Dependencias**:

- Usa `detectarDias()` (definida en `BorrarDatosDia.js`).
- Es llamado desde el menú en `MenuYTriggers.js`.

---

## `WebAppAPI.js` — Punto de enlace para la aplicación web

**Propósito**: manejar la persistencia de datos desde la web app externa (Next.js). Permite registrar series (peso/reps) en la hoja correcta.

**Puntos de entrada**:

- `doPost(e)`: recibe JSON con `weekId`, `dayId`, `exerciseName` y `sets`.

**Funciones principales**:

- `registrarSeries_(data)`: busca la hoja de la semana y el rango del día para escribir las series.
- `buscarFilaEjercicio_(sheet, diaInfo, nombreEjercicio)`: helper para ubicar la fila exacta del ejercicio dentro de un día.

**Dependencias**:

- Usa `detectarDias()` (definida en `BorrarDatosDia.js`) para segmentar las semanas por días.
