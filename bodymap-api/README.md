# Bodymap API (Vercel)

API serverless que renderiza un body map muscular como PNG, coloreado según la intensidad de cada grupo muscular.

## Deploy en Vercel

1. Instala las dependencias:
   ```bash
   cd bodymap-api
   npm install
   ```

2. Despliega en Vercel:
   ```bash
   npx vercel
   ```
   
   O conecta el repositorio a Vercel para deploys automáticos.

3. Copia la URL del deployment (ej: `https://tu-proyecto.vercel.app`)

## Configurar en Google Sheets

1. Abre tu hoja de cálculo de Google Sheets
2. Ve a **Extensiones → Apps Script**
3. Ve a **⚙️ Configuración del proyecto → Propiedades de secuencia de comandos**
4. Agrega una nueva propiedad:
   - **Propiedad**: `BODYMAP_RENDER_URL`
   - **Valor**: tu URL de Vercel (ej: `https://tu-proyecto.vercel.app`)

**Alternativa**: desde el menú de la hoja, ve a:
- `🏋️ Gym Tools → 🧍 Body Map → 🔧 Configurar URL Vercel`

## Uso

Desde tu hoja de Google Sheets:
1. Ve al menú `🏋️ Gym Tools → 🧍 Body Map → 🔄 Actualizar Body Map`
2. El script leerá la tabla de la hoja `Fatiga` (columnas C y D: MUSCULOS y SERIES)
3. Generará dos imágenes (frente y espalda) con los músculos coloreados según las series
4. Las imágenes aparecerán como objetos flotantes en la hoja `Fatiga`

## API Endpoint

### POST /api/bodymap

Genera un PNG del body map coloreado.

**Request Body:**
```json
{
  "view": "front" | "back",
  "intensityByGroupId": {
    "chest": 0.8,
    "quads": 0.5,
    "biceps": 0.3
    // ... otros grupos
  }
}
```

**Response:**
- `Content-Type: image/png`
- Body: imagen PNG

**Grupos disponibles (IDs del SVG):**

Vista frontal (`front`):
- `chest`, `abdominals`, `obliques`, `biceps`, `forearms`, `hands`
- `front-shoulders`, `quads`, `calves`, `traps`

Vista trasera (`back`):
- `lats`, `lowerback`, `traps`, `traps-middle`, `rear-shoulders`
- `triceps`, `forearms`, `hands`, `glutes`, `hamstrings`, `calves`

## Configuración de anchors en la hoja

Las imágenes se insertan en posiciones fijas definidas en `scripts/BodyMap.js`:

```javascript
FRONT_ANCHOR: { row: 2, col: 10 },   // J2
BACK_ANCHOR: { row: 2, col: 14 },    // N2
```

Podés modificar estos valores según dónde quieras que aparezcan las imágenes.

## Mapeo de músculos

El script mapea los nombres en español de tu tabla a los IDs del SVG:

| Tu tabla (ES) | SVG ID(s) |
|---------------|-----------|
| Pecho | chest |
| Abdominales | abdominals |
| Biceps | biceps |
| Triceps | triceps |
| Antebrazos | forearms |
| Cuadriceps | quads |
| Isquiotibiales | hamstrings |
| Gluteos | glutes |
| Gemelos | calves |
| Espalda | lats, lowerback, traps, traps-middle |
| Deltoides anterior | front-shoulders |
| Deltoides lateral | front-shoulders |
| Deltoides posterior | rear-shoulders |

Músculos ignorados (no tienen forma en el SVG):
- Aductores
- Cuello






