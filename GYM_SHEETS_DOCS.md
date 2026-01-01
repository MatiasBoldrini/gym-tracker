# 🏋️ Documentación - Sistema de Rutinas de Gimnasio en Google Sheets

## 📁 Estructura de Hojas

| Hoja                        | Propósito                                                     |
| --------------------------- | ------------------------------------------------------------- |
| `Semana 1`, `Semana 2`, ... | Rutinas semanales con ejercicios, series, peso y calificación |
| `Ejercicios`                | Base de datos de ejercicios con grupos musculares             |
| `Calculadora`               | Dashboard con métricas de volumen y fatiga                    |
| `RM`                        | Tabla de récords personales (PRs)                             |
| `Fatiga`                    | Análisis de fatiga por grupo muscular                         |
| `Calculos Aux.`             | Cálculos auxiliares y datos de soporte                        |

---

## 📊 Estructura de Hojas "Semana X"

### Columnas principales:

| Columna    | Contenido                          |
| ---------- | ---------------------------------- |
| A          | Nombre del ejercicio               |
| B          | Series y reps (ej: "3 x 8-12")     |
| D          | Notas                              |
| F, H, J, L | Repeticiones por serie (Serie 1-4) |
| G, I, K, M | Peso por serie (Serie 1-4)         |
| N          | Grupo muscular (lookup automático) |

### Filas especiales:

| Fila                    | Contenido                                      |
| ----------------------- | ---------------------------------------------- |
| F10, F20, F30, F40, F50 | Calificación del día con estrellas (★☆☆ a ★★★) |

### Estructura de días:

- **DIA 1:** Filas 2-10 (encabezado en fila 2, ejercicios 3-9, estrellas en F10)
- **DIA 2:** Filas 12-20
- **DIA 3:** Filas 22-30
- **DIA 4:** Filas 32-40
- **DIA 5:** Filas 42-50

---

## 🎛️ Menú de Apps Script

```
🏋️ Gym Tools
├── 🔄 Actualizar datos
├── 🧹 Borrar día
│   ├── Día 1
│   ├── Día 2
│   ├── Día 3
│   ├── Día 4
│   └── Día 5
├── 📅 Mesociclo
│   ├── ➕ Crear Mesociclo
│   └── 🗑️ Borrar Mesociclo
├── 🤖 IA
│   ├── 📋 Copiar rutina como prompt
│   └── 📥 Pegar rutina desde IA
├── ⚙️ Activar auto-actualización (1h)
└── ❌ Desactivar auto-actualización
```

### Funciones del menú:

| Opción                       | Descripción                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| 🔄 Actualizar datos          | Fuerza recálculo de TABLA_PRS, PROMEDIO_ESTRELLAS y FRECUENCIA_MUSCULO |
| 🧹 Borrar día X              | Borra todos los datos de un día específico en la hoja activa           |
| ➕ Crear Mesociclo           | Duplica "Semana 1" hasta el número de semanas indicado                 |
| 🗑️ Borrar Mesociclo          | Elimina todas las hojas "Semana X" excepto "Semana 1"                  |
| 📋 Copiar rutina como prompt | Genera un prompt con la rutina actual + ejercicios disponibles para IA |
| 📥 Pegar rutina desde IA     | Importa una rutina desde JSON generado por IA                          |
| ⚙️ Auto-actualización        | Activa trigger que actualiza datos cada hora                           |
| ❌ Desactivar                | Elimina el trigger automático                                          |

---

## 📝 Fórmulas Utilizadas

### 1. Buscar grupo muscular de un ejercicio

**Ubicación:** Columna N de hojas "Semana X"

```
=BUSCARV(A4;Ejercicios!A:B;2;FALSO)
```

> ⚠️ **IMPORTANTE:** No usar `=BUSCAR()` ya que requiere datos ordenados alfabéticamente y puede devolver resultados incorrectos.

---

### 2. Contar series por grupo muscular

**Ubicación:** Hoja Calculadora, columna de Series

```
=SUMAPRODUCTO(('Semana 1'!$N:$N=A2)*SI.ERROR(VALOR(IZQUIERDA('Semana 1'!$B:$B;ENCONTRAR(" ";'Semana 1'!$B:$B)-1));0))
```

**Cómo funciona:**

- `'Semana 1'!$N:$N=A2` → Filtra por grupo muscular
- `IZQUIERDA(...;ENCONTRAR(" ";...)-1)` → Extrae "3" de "3 x 8-12"
- `VALOR()` → Convierte texto a número
- `SI.ERROR(...;0)` → Maneja celdas vacías/encabezados

---

### 3. Ordenar y filtrar músculos (sin los que tienen 0 series)

**Ubicación:** Hoja Calculadora

```
=ORDENAR(FILTRAR(A2:B18;B2:B18>0);2;FALSO)
```

**Parámetros:**

- `A2:B18` → Rango de datos (Músculo + Series)
- `B2:B18>0` → Solo mostrar si series > 0
- `2` → Ordenar por columna 2 (Series)
- `FALSO` → Orden descendente (mayor a menor)

> ⚠️ **IMPORTANTE:** Esta fórmula debe estar FUERA del rango que lee para evitar error de dependencia circular.

---

### 4. Barra de fatiga con colores (SPARKLINE)

**Ubicación:** Columna Fatiga en Calculadora

```
=SI.ERROR(SPARKLINE(D2;{"charttype"\"bar";"max"\25;"color1"\SI(D2<=2,5;"#1B5E20";SI(D2<=5;"#388E3C";SI(D2<=7,5;"#66BB6A";SI(D2<=10;"#AED581";SI(D2<=12,5;"#DCE775";SI(D2<=15;"#FFEE58";SI(D2<=17,5;"#FFB74D";SI(D2<=20;"#FF8A65";SI(D2<=22,5;"#E57373";"#C62828")))))))))}); "")
```

**Escala de colores:**

| Series | Color           | Significado               |
| ------ | --------------- | ------------------------- |
| 0-5    | 🟢 Verde oscuro | Bajo volumen              |
| 5-10   | 🟢 Verde        | Volumen moderado          |
| 10-15  | 🟡 Amarillo     | Volumen óptimo            |
| 15-20  | 🟠 Naranja      | Volumen alto              |
| 20-25  | 🔴 Rojo         | Riesgo sobreentrenamiento |

---

## 🎯 Funciones Personalizadas (Apps Script)

### TABLA_PRS()

Genera una tabla con todos los ejercicios y sus récords personales.

**Uso:** `=TABLA_PRS()`

**Columnas de salida:**

| Ejercicio   | Peso PR | Reps | Fecha | 1RM Estimado |
| ----------- | ------- | ---- | ----- | ------------ |
| Peso muerto | 120     | 5    | S2D3  | 135.2        |

- **Fecha:** Formato S{semana}D{día} (ej: S2D3 = Semana 2, Día 3)

---

### PROMEDIO_ESTRELLAS(celda)

Calcula el promedio de estrellas de una celda en todas las semanas.

**Uso:**

```
=PROMEDIO_ESTRELLAS("F10")  // Promedio del Día 1
=PROMEDIO_ESTRELLAS("F20")  // Promedio del Día 2
```

---

### FRECUENCIA_MUSCULO(musculo, hoja)

Cuenta cuántos días se entrena un músculo en una semana.

**Uso:**

```
=FRECUENCIA_MUSCULO(C2)              // Usa "Semana 1" por defecto
=FRECUENCIA_MUSCULO(C2; "Semana 2")  // Especifica la semana
```

**Ejemplo:** Si "Pecho" aparece en Día 1 y Día 4, devuelve 2.

---

### CALCULAR_1RM(peso, reps)

Calcula el 1RM estimado usando fórmulas de Brzycki/Epley.

**Uso:** `=CALCULAR_1RM(80; 8)` → Devuelve ~98.5

---

### SERIES_MUSCULO_EN_DIA(musculo, numDia, hoja)

Calcula el total de series para un músculo en un día específico.
Extrae el número de series del texto en columna B (ej: "3 x 8-12" → 3).

**Uso:**

```
=SERIES_MUSCULO_EN_DIA("Pecho"; 1)                    // Series de Pecho en Día 1
=SERIES_MUSCULO_EN_DIA("Pecho"; 1; "Semana 2")        // En otra semana
=SERIES_MUSCULO_EN_DIA(C2; BUSCARV(H$1; $C$18:$D$22; 2; FALSO))  // Con mapeo dinámico
```

**Parámetros:**

| Parámetro | Requerido | Descripción                                |
| --------- | --------- | ------------------------------------------ |
| musculo   | ✅        | Nombre del grupo muscular                  |
| numDia    | ✅        | Número de día (1, 2, etc.) o texto "DIA 1" |
| hoja      | ❌        | Hoja de semana (default: "Semana 1")       |

---

### GRILLA_SERIES_FATIGA(musculos, diasSemana, mapeo, hoja, modo, maxSeries)

Genera una matriz completa con las series por músculo (filas) y día de semana (columnas).
Ideal para llenar la grilla de Fatiga con una sola fórmula que se "derrama".

**Uso:**

```
=GRILLA_SERIES_FATIGA(C2:C10; H1:N1; C18:D22)
=GRILLA_SERIES_FATIGA(C2:C10; H1:N1; C18:D22; "Semana 2")
=GRILLA_SERIES_FATIGA(C2:C10; H1:N1; C18:D22; "Semana 2"; "barra"; 12)
=GRILLA_SERIES_FATIGA(C2:C10; H1:N1; C18:D22; "Semana 2"; "barra+numero"; 12)
```

**Parámetros:**

| Parámetro  | Requerido | Descripción                                                   |
| ---------- | --------- | ------------------------------------------------------------- |
| musculos   | ✅        | Rango con los nombres de músculos (ej: C2:C10)                |
| diasSemana | ✅        | Rango con los días de la semana (ej: H1:N1)                   |
| mapeo      | ✅        | Rango con el mapeo día→DIA n (2 cols: día, DIA n)             |
| hoja       | ❌        | Hoja de semana (default: "Semana 1")                          |
| modo       | ❌        | `"numero"` (default) \| `"barra"` \| `"barra+numero"`         |
| maxSeries  | ❌        | Máximo esperado de series para dibujar la barra (default: 12) |

**Ejemplo de mapeo (C18:D22):**

| C (Día) | D (N°) |
| ------- | ------ |
| Lun     | DIA 1  |
| Mie     | DIA 2  |
| Jue     | DIA 3  |
| Sab     | DIA 4  |

> La función devuelve "" (vacío) para días no mapeados o músculos sin series.

---

## ⚙️ Código Apps Script Completo

**Ubicación:** Extensiones → Apps Script

> Ver archivo `proyect.js` para el código completo actualizado.

### Resumen de funciones:

| Función                                             | Tipo            | Descripción                                 |
| --------------------------------------------------- | --------------- | ------------------------------------------- |
| `onOpen()`                                          | Menú            | Crea el menú personalizado                  |
| `actualizarPRs()`                                   | Utilidad        | Fuerza recálculo de fórmulas personalizadas |
| `crearTrigger()`                                    | Utilidad        | Activa auto-actualización cada hora         |
| `eliminarTriggers()`                                | Utilidad        | Desactiva auto-actualización                |
| `TABLA_PRS()`                                       | Custom Function | Genera tabla de PRs                         |
| `PROMEDIO_ESTRELLAS(celda)`                         | Custom Function | Promedio de estrellas por día               |
| `FRECUENCIA_MUSCULO(musculo, hoja)`                 | Custom Function | Frecuencia semanal de un músculo            |
| `CALCULAR_1RM(peso, reps)`                          | Custom Function | Calcula 1RM estimado                        |
| `SERIES_MUSCULO_EN_DIA(musculo, numDia, hoja)`      | Custom Function | Series de un músculo en un día específico   |
| `GRILLA_SERIES_FATIGA(musculos, dias, mapeo, hoja)` | Custom Function | Matriz de series por músculo y día          |
| `borrarDatosDia(dia)`                               | Utilidad        | Borra datos de un día específico            |
| `detectarDias(hoja)`                                | Utilidad        | Detecta los días y sus rangos de filas      |
| `crearMesociclo()`                                  | Gestión         | Crea semanas duplicando Semana 1            |
| `borrarMesociclo()`                                 | Gestión         | Elimina todas las semanas excepto Semana 1  |
| `limpiarDatosSemana(hoja)`                          | Utilidad        | Limpia datos de reps/peso/estrellas         |
| `copiarRutinaComoPrompt()`                          | IA              | Genera prompt con rutina + ejercicios       |
| `pegarRutinaDesdeIA()`                              | IA              | Abre modal para pegar JSON de rutina        |
| `obtenerHojasSemana()`                              | Utilidad        | Lista hojas de semana para selector         |
| `procesarRutinaJSON(json, hoja)`                    | IA              | Procesa y escribe rutina desde JSON         |

---

## 🤖 Integración con IA

### Copiar rutina como prompt

Genera un prompt formateado que incluye:

1. **Rutina actual:** Todos los ejercicios de la hoja activa (o Semana 1), organizados por día
2. **Ejercicios disponibles:** Lista completa de la hoja "Ejercicios", agrupados por grupo muscular
3. **Formato de respuesta:** Instrucciones para que la IA responda en JSON

**Cómo usar:**

1. Menú → 🏋️ Gym Tools → 🤖 IA → 📋 Copiar rutina como prompt
2. Copiar el texto generado
3. Pegarlo en tu IA favorita (ChatGPT, Claude, etc.)
4. Pedir modificaciones a la rutina

---

### Pegar rutina desde IA

Importa una rutina generada por IA en formato JSON.

**Formato JSON esperado:**

```json
{
  "dias": [
    {
      "dia": 1,
      "ejercicios": [
        { "ejercicio": "Press banca", "series": "3 x 8-12" },
        { "ejercicio": "Press inclinado", "series": "3 x 10-12" }
      ]
    },
    {
      "dia": 2,
      "ejercicios": [{ "ejercicio": "Sentadilla", "series": "4 x 6-8" }]
    }
  ]
}
```

**Campos por ejercicio:**

| Campo     | Requerido | Descripción                        |
| --------- | --------- | ---------------------------------- |
| ejercicio | ✅        | Nombre del ejercicio               |
| series    | ❌        | Formato "X x Y-Z" (ej: "3 x 8-12") |

> **Nota:** Las notas (columna D) se agregan manualmente, la IA no las genera.

**Cómo usar:**

1. Obtener JSON de la IA (usando el formato indicado en el prompt)
2. Menú → 🏋️ Gym Tools → 🤖 IA → 📥 Pegar rutina desde IA
3. Seleccionar hoja destino (o usar la activa)
4. Pegar el JSON
5. Click en "Pegar rutina"

**Qué escribe:**

- Columna A: Nombre del ejercicio
- Columna B: Series

---

## 🔧 Mantenimiento

### Actualización de datos:

1. **Manual:** Menú → 🏋️ Gym Tools → 🔄 Actualizar datos
2. **Automático:** Activar desde menú (cada 1 hora)

### Hojas donde busca fórmulas:

La función `actualizarPRs()` busca en:

- Calculadora
- RM
- Fatiga
- Calculos Aux.

### Agregar nueva semana manualmente:

1. Duplicar hoja "Semana X" existente
2. Renombrar a "Semana {nuevo número}"
3. Las fórmulas detectan automáticamente hojas nuevas que empiecen con "Semana"

### Crear mesociclo automáticamente:

1. Menú → 🏋️ Gym Tools → 📅 Mesociclo → ➕ Crear Mesociclo
2. Indicar hasta qué semana generar (ej: 6)
3. Se duplica "Semana 1" con datos limpios

### Borrar datos de un día:

1. Posicionarse en la hoja de semana deseada
2. Menú → 🏋️ Gym Tools → 🧹 Borrar día → Día X
3. Confirmar en el popup

**Qué borra:** Ejercicios, Series, Notas, Reps, Pesos, Estrellas
**Qué mantiene:** Encabezados, formato, dropdowns

---

## 🔍 Solución de problemas

| Problema                     | Causa                                             | Solución                                 |
| ---------------------------- | ------------------------------------------------- | ---------------------------------------- |
| TABLA_PRS no muestra datos   | Hojas no empiezan con "Semana"                    | Verificar nombres de hojas               |
| Grupo muscular incorrecto    | Usando BUSCAR en vez de BUSCARV                   | Cambiar a BUSCARV con FALSO              |
| Error "dependencia circular" | Fórmula ORDENAR/FILTRAR dentro de su propio rango | Mover fórmula a columnas diferentes      |
| PRs no se actualizan         | Custom functions no recalculan automáticamente    | Ejecutar actualización manual desde menú |
| Error QUERY "PARSE_ERROR"    | Separadores incorrectos para español              | Usar `\` en arrays, `;` en argumentos    |
| Borrar día no funciona       | No está en una hoja "Semana X"                    | Posicionarse en la hoja de semana        |
| Día no encontrado            | El día seleccionado no existe en la hoja          | Verificar estructura de la hoja          |

---

## 📐 Notas sobre configuración regional (Español)

En Google Sheets con configuración regional en español:

| Elemento                             | Inglés | Español |
| ------------------------------------ | ------ | ------- |
| Separador de argumentos              | `,`    | `;`     |
| Separador de columnas en arrays `{}` | `,`    | `\`     |
| Separador de filas en arrays `{}`    | `;`    | `;`     |
| Decimal                              | `.`    | `,`     |

**Ejemplo:**

```
// Inglés
=VLOOKUP(A1, B:C, 2, FALSE)

// Español
=BUSCARV(A1; B:C; 2; FALSO)
```

---

## 🔬 Fórmulas de 1RM utilizadas

### Brzycki (para 1-12 reps)

```
1RM = peso / (1.0278 - 0.0278 × reps)
```

### Epley (para 12+ reps)

```
1RM = peso × (1 + reps/30)
```

---

## 🚫 Limitaciones conocidas

### Apps Script UI:

- No hay dropdown/list picker nativo (solo prompt de texto o HTML)
- Máximo 3 botones en un alert
- Custom functions solo se recalculan al cambiar parámetros o recargar

### Google Sheets:

- No hay autocompletado personalizado mientras se escribe
- BUSCAR() requiere datos ordenados (usar BUSCARV con FALSO)

---

**Última actualización:** Enero 2025
