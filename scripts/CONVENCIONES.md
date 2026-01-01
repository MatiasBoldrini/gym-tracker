# Convenciones de código (modularidad) — `scripts/`

Este proyecto corre en **Google Apps Script** (aunque los archivos sean `.js`). Apps Script no usa módulos ES de forma nativa: **todo queda en el scope global del proyecto**, pero igual podemos (y debemos) mantener **separación por archivos** para que sea mantenible.

## Objetivo

- **Mantener archivos pequeños y enfocados** (fáciles de leer, revisar y modificar).
- **Evitar “archivos dios”**: si un archivo crece demasiado, se vuelve frágil y difícil de depurar.

## Regla de tamaño

- **No crear/aceptar archivos muy grandes (+900 líneas).**
- Ideal práctico: **200–500 líneas** por archivo.
- Si un archivo supera ~700 líneas, **planificar refactor** antes de seguir agregando features.

## Cómo modularizar en este repo

- **1 archivo = 1 responsabilidad principal** (un “módulo lógico”).
  - Ejemplos: menú/triggers, fórmulas personalizadas, IA (UI + parseo), mesociclos, borrado de día.
- **Funciones reutilizables**:
  - Si una función es usada por más de un archivo (ej: `detectarDias()`), mantenerla en un archivo “base” claro o moverla a un archivo `Utils*.js` dedicado.
- **UI vs lógica**:
  - Separar lo posible:
    - UI (`HtmlService`, diálogos, sidebars) en una sección o archivo específico.
    - Lógica/parseo/escritura de planilla en funciones server-side separadas.

## Convenciones de nombres

- **Funciones públicas (puntos de entrada)**: nombres claros y verbos (“crearMesociclo”, “pegarRutinaDesdeIA”).
- **Helpers internos**: sufijo o prefijo para indicar “privado” (convención):
  - `*_` al final (ej: `toastResultadoCopia_`, `obtenerHojaPorNombreFlexible_`)
  - o `_` al inicio (evitar mezclar estilos; elegir uno por archivo).

## Dependencias entre archivos (regla práctica)

- Documentar en `agents.md` cuando:
  - un archivo **consume** funciones definidas en otro,
  - una función se vuelve “core” (muy usada) y amerita moverse a utilidades.

## Señales para dividir un archivo (checklist)

Dividir si aparece alguna de estas:

- Muchas responsabilidades mezcladas (UI + parsing + escritura + cálculos).
- Se repiten bloques grandes de código (copiar/pegar).
- Hay “helpers” que podrían servir a otras features.
- El archivo supera el umbral de tamaño (700–900 líneas) o se vuelve difícil de navegar.

## Qué evitar

- Un solo archivo enorme para “todo”.
- Funciones utilitarias duplicadas en varios archivos.
- HTML/JS inline larguísimo dentro de strings sin necesidad (si crece, separar en plantilla/constructor y helpers).


