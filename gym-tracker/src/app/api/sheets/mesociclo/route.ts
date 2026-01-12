import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { google } from "googleapis";
import { getAuthContext } from "@/lib/supabase/auth-helper";
import { refreshAccessToken, getAuthenticatedClient } from "@/lib/google/oauth";
import { normalizeSheetsError } from "@/lib/google/sheets-errors";

interface CreateMesocicloBody {
    weeks: number;
}

/**
 * POST /api/sheets/mesociclo
 * Creates a mesociclo by duplicating "Semana 1" to "Semana 2..N".
 * Cleans F..M columns (reps/weight/stars) to avoid carrying over logs.
 */
export async function POST(request: NextRequest) {
    try {
        const body: CreateMesocicloBody = await request.json();
        const { weeks } = body;

        if (!weeks || weeks < 1 || weeks > 15) {
            return NextResponse.json(
                { error: "weeks debe ser un número entre 1 y 15" },
                { status: 400 }
            );
        }

        const auth = await getAuthContext();
        if (!auth) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const authClient = getAuthenticatedClient(accessToken);
        const sheets = google.sheets({ version: "v4", auth: authClient });

        // Get spreadsheet metadata to find sheet IDs
        const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId: auth.spreadsheetId,
            fields: "sheets.properties",
        });

        const sheetsList = spreadsheet.data.sheets || [];
        
        // Find all week sheets and their IDs
        const weekSheets: { id: number; sheetId: number; title: string }[] = [];
        for (const sheet of sheetsList) {
            const title = sheet.properties?.title?.trim() || "";
            const sheetId = sheet.properties?.sheetId;
            const match = title.match(/^Semana\s+(\d+)$/i);
            if (match && typeof sheetId === "number") {
                weekSheets.push({
                    id: parseInt(match[1]),
                    sheetId: sheetId,
                    title: title,
                });
            }
        }

        // Sort by week number
        weekSheets.sort((a, b) => a.id - b.id);

        // If user only wants 1 week, we're done (nothing to duplicate)
        if (weeks === 1) {
            return NextResponse.json({
                ok: true,
                weeksCreated: [],
                totalWeeks: 1,
                message: "Solo se necesita Semana 1, no hay nada que duplicar",
            });
        }

        // Find Semana 1 or the first available week sheet to use as template
        const semana1 = weekSheets.find((w) => w.id === 1);
        const templateSheet = semana1 || weekSheets[0];
        
        if (!templateSheet) {
            // No week sheets found at all - this shouldn't happen if routine was saved
            const availableSheets = sheetsList.map((s) => s.properties?.title).filter(Boolean);
            console.error("No week sheets found. Available sheets:", availableSheets);
            
            return NextResponse.json(
                { 
                    error: "No se encontró ninguna hoja de semana en tu planilla. Asegurate de tener al menos 'Semana 1'.",
                    availableSheets,
                },
                { status: 404 }
            );
        }

        const existingWeekIds = new Set(weekSheets.map((w) => w.id));

        // Create missing weeks
        const weeksCreated: number[] = [];
        
        for (let weekNum = 1; weekNum <= weeks; weekNum++) {
            if (existingWeekIds.has(weekNum)) {
                continue; // Skip if already exists
            }

            const newSheetName = `Semana ${weekNum}`;

            // Duplicate the template sheet
            const duplicateResponse = await sheets.spreadsheets.batchUpdate({
                spreadsheetId: auth.spreadsheetId,
                requestBody: {
                    requests: [
                        {
                            duplicateSheet: {
                                sourceSheetId: templateSheet.sheetId,
                                newSheetName: newSheetName,
                            },
                        },
                    ],
                },
            });

            const newSheetId = duplicateResponse.data.replies?.[0]?.duplicateSheet?.properties?.sheetId;

            if (newSheetId !== undefined) {
                // Clean F..M columns (indices 5-12, 0-based) for the new sheet
                // Read current data to find cells with numbers or stars
                await cleanWeekData(sheets, auth.spreadsheetId, newSheetName);
            }

            weeksCreated.push(weekNum);
        }

        // Revalidate caches (using "minutes" profile to match our 5min cache)
        revalidateTag(`weeks-${auth.userId}`, "minutes");
        revalidateTag(`sheets-${auth.userId}`, "minutes");

        return NextResponse.json({
            ok: true,
            weeksCreated,
            totalWeeks: weeks,
        });
    } catch (error: any) {
        console.error("Error creating mesociclo:", error);
        const normalized = normalizeSheetsError(error);
        return NextResponse.json(
            { error: normalized.message, code: normalized.code },
            { status: normalized.status }
        );
    }
}

/**
 * Clean reps/weight/stars data from a week sheet (columns F-M).
 * Only clears cells that contain numbers or star characters.
 */
async function cleanWeekData(
    sheets: ReturnType<typeof google.sheets>,
    spreadsheetId: string,
    sheetName: string
) {
    // Read columns F-M (indices 5-12)
    const range = `'${sheetName}'!F:M`;
    
    const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: "UNFORMATTED_VALUE",
    });

    const rows = readResponse.data.values || [];
    
    if (rows.length === 0) return;

    // Build new values: clear numbers and star strings
    const newValues: (string | number | null)[][] = rows.map((row) => {
        return Array.from({ length: 8 }, (_, i) => {
            const value = row[i];
            
            // Clear if it's a number
            if (typeof value === "number") {
                return "";
            }
            
            // Clear if it's a string containing stars
            if (typeof value === "string" && value.includes("★")) {
                return "";
            }
            
            // Keep other values (headers, formulas, etc.)
            return value ?? "";
        });
    });

    // Write back the cleaned data
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!F1:M${rows.length}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
            values: newValues,
        },
    });
}
