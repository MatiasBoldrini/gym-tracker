/**
 * Normalización "estable" para comparar strings que vienen de Sheets / UI.
 * - trim
 * - lowercase
 * - quita tildes (NFD)
 * - colapsa whitespace múltiple
 *
 * Importante: se usa para matching (PR, imágenes, búsqueda de filas), no para display.
 */
export function normalizeExerciseKey(input: unknown): string {
    return String(input ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}



