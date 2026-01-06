# Implementación: Body Map Muscular en Google Sheets

## Resumen

Se implementó un sistema completo para mostrar un **body map muscular** dentro de Google Sheets que se colorea dinámicamente según las series realizadas por cada músculo. La solución utiliza **Apps Script** para leer datos de la hoja y **Vercel serverless** para renderizar las imágenes.

---

## Objetivo

Mostrar dos imágenes flotantes (frente y espalda) en la hoja `Fatiga` que se comporten como un gráfico insertado, donde cada músculo se colorea proporcionalmente según el número de series registradas en la tabla manual.

---

## Arquitectura

```
Google Sheets (Fatiga)
  ↓ Lee tabla C:D (Músculos/Series)
Apps Script (BodyMap.js)
  ↓ Calcula intensidades relativas
  ↓ POST a Vercel
Vercel API (/api/bodymap)
  ↓ Aplica colores al SVG
  ↓ Renderiza a PNG
  ↓ Devuelve imagen
Apps Script
  ↓ Reemplaza imágenes flotantes en la hoja
```

---

## Archivos Creados/Modificados

### Apps Script

#### `scripts/BodyMap.js` (NUEVO - 286 líneas)

**Funcionalidades principales:**
- `actualizarBodyMap()`: Función principal que orquesta todo el proceso
- `leerTablaFatiga_()`: Lee la tabla de músculos/series de las columnas C y D
- `calcularIntensidades_()`: Convierte series a intensidades 0-1 (escala relativa al máximo)
- `renderizarVista_()`: Llama al endpoint de Vercel para obtener PNG
- `reemplazarImagen_()`: Inserta/reemplaza imágenes flotantes en la hoja
- `configurarUrlVercel()`: Helper para configurar la URL desde el menú

**Configuración:**
- Hoja: `Fatiga`
- Columnas: C (Músculos), D (Series)
- Anclas: J2 (frente), N2 (espalda)
- Tamaño imágenes: 300x550px

**Mapeo músculos ES → SVG IDs:**
```javascript
{
  "pecho": ["chest"],
  "abdominales": ["abdominals"],
  "biceps": ["biceps"],
  "triceps": ["triceps"],
  "antebrazos": ["forearms"],
  "cuadriceps": ["quads"],
  "isquiotibiales": ["hamstrings"],
  "gluteos": ["glutes"],
  "gemelos": ["calves"],
  "espalda": ["lats", "lowerback", "traps", "traps-middle"],
  "deltoides anterior": ["front-shoulders"],
  "deltoides lateral": ["front-shoulders"],
  "deltoides posterior": ["rear-shoulders"]
}
```

#### `scripts/MenuYTriggers.js` (MODIFICADO)

**Agregado:**
- Nuevo submenú `🧍 Body Map` con:
  - `🔄 Actualizar Body Map` → ejecuta `actualizarBodyMap()`
  - `🔧 Configurar URL Vercel` → ejecuta `configurarUrlVercel()`

---

### Vercel API (`bodymap-api/`)

#### `api/bodymap.js` (NUEVO)

**Endpoint:** `POST /api/bodymap`

**Request:**
```json
{
  "view": "front" | "back",
  "intensityByGroupId": {
    "chest": 0.8,
    "quads": 0.5,
    ...
  }
}
```

**Response:**
- `Content-Type: image/png`
- Body: Buffer PNG

**Funcionalidades:**
- `intensityToColor()`: Interpola gris (#9ca3af) → rojo (#dc2626) según intensidad
- `applySvgColors()`: Aplica estilos `color` a los grupos `<g id="...">` del SVG
- `renderToPng()`: Rasteriza SVG a PNG usando `@resvg/resvg-js`

#### `lib/svgTemplates.js` (NUEVO)

Carga los SVGs base desde archivos:
- `lib/front.svg`
- `lib/back.svg`

#### `lib/front.svg` y `lib/back.svg` (NUEVOS)

SVGs completos del body map (vista frontal y trasera) con grupos segmentados por músculo usando `id` y `class="bodymap"`.

#### `package.json` (NUEVO)

**Dependencias:**
- `@resvg/resvg-js`: ^2.6.2 (para rasterizar SVG → PNG)

**Configuración:**
- Node.js: >=18
- Scripts: `dev` (vercel dev)

#### `vercel.json` (NUEVO)

Configuración de Vercel:
- Memory: 1024MB
- Max duration: 30s

#### `README.md` (NUEVO)

Documentación completa del proyecto con:
- Instrucciones de deploy
- Configuración en Google Sheets
- Mapeo de músculos
- API endpoint docs

---

## Escala de Color

**Método:** Relativo al máximo

1. Se encuentra el máximo de series en la tabla
2. Para cada músculo: `intensidad = series / maxSeries`
3. Interpolación lineal:
   - 0 → Gris (#9ca3af)
   - 1 → Rojo intenso (#dc2626)

**Ejemplo:**
- Espalda: 29 series (máx) → intensidad = 1.0 → rojo full
- Biceps: 6 series → intensidad = 0.21 → gris claro

---

## Deployment en Vercel

**URLs de producción:**
- Alias: `https://bodymap-api.vercel.app`
- Específica: `https://bodymap-5r18mav9e-matiasboldrinis-projects.vercel.app`

**Comandos ejecutados:**
```bash
cd bodymap-api
npm install
npx vercel login
npx vercel --yes
```

**Estado:** ✅ Deploy exitoso

---

## Configuración Requerida

### En Google Sheets

1. **Script Properties:**
   - Key: `BODYMAP_RENDER_URL`
   - Value: `https://bodymap-api.vercel.app`

   **Alternativa:** Usar el menú `🔧 Configurar URL Vercel`

2. **Tabla en hoja `Fatiga`:**
   - Columna C: Nombres de músculos
   - Columna D: Número de series
   - Fila 1: Headers (MUSCULOS, SERIES)
   - Fila 2+: Datos

3. **Posición de imágenes:**
   - Frente: Celda J2
   - Espalda: Celda N2
   - (Configurable en `BodyMap.js`)

---

## Uso

1. Llenar la tabla en `Fatiga` con músculos y series
2. Ir a: `🏋️ Gym Tools → 🧍 Body Map → 🔄 Actualizar Body Map`
3. Las imágenes aparecerán automáticamente como objetos flotantes

---

## Músculos Soportados

### Con forma en el SVG:
- ✅ Pecho
- ✅ Abdominales
- ✅ Biceps
- ✅ Triceps
- ✅ Antebrazos
- ✅ Cuadriceps
- ✅ Isquiotibiales
- ✅ Gluteos
- ✅ Gemelos
- ✅ Espalda (mapea a múltiples grupos)
- ✅ Deltoides anterior/lateral/posterior

### Sin forma (ignorados):
- ❌ Aductores
- ❌ Cuello

---

## Decisiones Técnicas

### ¿Por qué Vercel?
- Renderizado confiable de SVG → PNG
- Serverless (sin infraestructura propia)
- Escalable automáticamente

### ¿Por qué imágenes flotantes?
- Google Sheets no permite SVG interactivo dentro de celdas
- Las imágenes flotantes se comportan como gráficos insertados
- Se pueden actualizar dinámicamente desde Apps Script

### ¿Por qué escala relativa?
- Muestra visualmente qué músculos trabajaste más
- El músculo con más series siempre queda rojo full
- Más intuitivo que una escala fija

---

## Notas Adicionales

- El código de Vercel usa ESM pero se compila a CommonJS automáticamente
- Los SVGs originales usan `fill="currentColor"`, por eso funciona aplicar `style="color: ..."` en el grupo
- Las imágenes se reemplazan (borran y reinsertan) en cada actualización para evitar caché
- El mapeo de "Espalda" a múltiples grupos permite colorear toda la zona trasera

---

## Próximas Mejoras Posibles

- [ ] Tooltips al hover (requeriría sidebar, no imagen flotante)
- [ ] Animación de transición entre estados
- [ ] Múltiples escalas de color (volumen, frecuencia, etc.)
- [ ] Exportar imagen a Drive
- [ ] Histórico de cambios (timeline)

---

**Fecha de implementación:** 2 de enero, 2025  
**Estado:** ✅ Completado y deployado









