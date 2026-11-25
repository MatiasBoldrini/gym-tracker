export type SheetsErrorCode =
    | "NO_SPREADSHEET"
    | "SHEETS_PERMISSION"
    | "SHEETS_NOT_FOUND"
    | "SHEETS_BAD_RANGE"
    | "SHEETS_TEMPLATE_MISMATCH"
    | "SHEETS_UNKNOWN";

export type NormalizedSheetsError = {
    status: number;
    code: SheetsErrorCode;
    /**
     * Mensaje listo para mostrar al usuario.
     */
    message: string;
};

function getStatusFromError(error: any): number | null {
    const candidates = [
        error?.code,
        error?.status,
        error?.response?.status,
        error?.response?.data?.error?.code,
    ];
    for (const c of candidates) {
        if (typeof c === "number" && Number.isFinite(c)) return c;
    }
    return null;
}

function getMessageFromError(error: any): string {
    return (
        error?.response?.data?.error?.message ||
        error?.message ||
        error?.toString?.() ||
        ""
    );
}

/**
 * Normaliza errores típicos de Google Sheets API para poder:
 * - devolver status correctos (403/404/400)
 * - mostrar un mensaje claro al usuario final
 */
export function normalizeSheetsError(error: any): NormalizedSheetsError {
    const status = getStatusFromError(error) ?? 500;
    const raw = getMessageFromError(error);
    const msg = String(raw || "");
    const msgLower = msg.toLowerCase();

    // Rangos/plantilla
    if (msgLower.includes("unable to parse range")) {
        return {
            status: 400,
            code: "SHEETS_BAD_RANGE",
            message:
                "No pudimos leer tu plantilla de Google Sheets. Asegurate de estar usando una copia de la plantilla oficial y que existan las pestañas (por ejemplo: “Semana 1”, “Ejercicios”, “RM”).",
        };
    }

    if (
        msgLower.includes("requested entity was not found") ||
        msgLower.includes("not found") ||
        status === 404
    ) {
        return {
            status: 404,
            code: "SHEETS_NOT_FOUND",
            message:
                "No encontramos ese Google Sheet. Revisá que el link/ID sea correcto y que el archivo todavía exista.",
        };
    }

    if (
        msgLower.includes("the caller does not have permission") ||
        msgLower.includes("permission") ||
        msgLower.includes("insufficient") ||
        status === 403
    ) {
        return {
            status: 403,
            code: "SHEETS_PERMISSION",
            message:
                "No tenés permiso para acceder a ese Google Sheet. Verificá que estés logueado con la misma cuenta que hizo la copia, o compartí el archivo con tu cuenta (permiso de edición).",
        };
    }

    // Fallback
    return {
        status: status >= 400 && status <= 599 ? status : 500,
        code: "SHEETS_UNKNOWN",
        message:
            "No pudimos conectar con Google Sheets. Probá de nuevo o revisá la configuración del Spreadsheet.",
    };
}
