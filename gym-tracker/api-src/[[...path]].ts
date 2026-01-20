import { Hono } from "hono";
import { getRequestListener } from "@hono/node-server";
import { google } from "googleapis";
import { getAuthContext, getUserFromRequest } from "./_lib/supabase/auth";
import { getUserIntegration, upsertUserIntegration } from "./_lib/supabase/integrations";
import { refreshAccessToken } from "./_lib/google/oauth";
import { getAuthenticatedClient } from "./_lib/google/oauth";
import { readSheetValues, readSheetValuesBatch, listSpreadsheetSheetTitles, readExerciseSets, readExerciseSetsBulk, saveExerciseSets, saveSessionRating } from "./_lib/google/sheets";
import { normalizeSheetsError } from "./_lib/google/sheets-errors";
import { parseExerciseMapping, parsePRData, parseWeekData } from "./_lib/sheets-parse";
import { computeFatigaFromSheet } from "./_lib/fatiga";
import { copyTemplate } from "./_lib/google/drive";
import { withCache } from "./_lib/cache";
import { decrypt, encrypt } from "./_lib/crypto";

const CURRENT_ONBOARDING_VERSION = 1;

const MAX_EXERCISES_PER_DAY = 7;

function findDayRange(data: any[][], dayId: number): { startRow: number; endRow: number } | null {
    let startRow = -1;
    let endRow = -1;
    let foundDay = false;

    for (let i = 0; i < data.length; i++) {
        const cellValue = data[i]?.[0]?.toString().trim().toUpperCase() || "";
        if (cellValue.startsWith("DIA ")) {
            const currentDayId = parseInt(cellValue.replace("DIA ", ""));
            if (currentDayId === dayId) {
                startRow = i + 1;
                foundDay = true;
            } else if (foundDay) {
                endRow = i;
                break;
            }
        }
    }

    if (!foundDay) return null;

    if (endRow === -1) {
        for (let i = startRow; i < data.length; i++) {
            const cellValue = data[i]?.[0]?.toString().trim() || "";
            if (!cellValue) {
                endRow = i;
                break;
            }
        }
        if (endRow === -1) endRow = data.length;
    }

    return { startRow, endRow };
}

async function cleanWeekData(
    sheets: ReturnType<typeof google.sheets>,
    spreadsheetId: string,
    sheetName: string
) {
    const range = `'${sheetName}'!F:M`;
    const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: "UNFORMATTED_VALUE",
    });
    const rows = readResponse.data.values || [];
    if (rows.length === 0) return;
    const newValues: (string | number | null)[][] = rows.map((row) =>
        Array.from({ length: 8 }, (_, i) => {
            const value = row[i];
            if (typeof value === "number") return "";
            if (typeof value === "string" && value.includes("★")) return "";
            return value ?? "";
        })
    );
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!F1:M${rows.length}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: newValues },
    });
}

const app = new Hono().basePath("/api");

function getAuthHeader(c: any) {
    return c.req.header("Authorization") ?? null;
}

function jsonError(c: any, message: string, status = 500, code?: string) {
    return c.json({ error: message, code }, status);
}

// Debug endpoint to check environment
app.get("/debug/env", (c) => {
    return c.json({ 
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
        supabaseUrlPrefix: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
    });
});

app.get("/auth/me", async (c) => {
    try {
        const auth = await getUserFromRequest(getAuthHeader(c));
        if (!auth) {
            return c.json({
                authenticated: false,
                hasSpreadsheet: false,
                spreadsheetId: null,
            });
        }

        const integration = await getUserIntegration(auth.supabase, auth.user.id);

        const { data: prefs, error: prefsError } = await auth.supabase
            .from("user_preferences")
            .select("onboarding_version, onboarding_completed_at, onboarding_dismissed_at, onboarding_progress")
            .eq("user_id", auth.user.id)
            .single();

        // Ensure preferences row exists
        let ensuredPrefs = prefs ?? null;
        if (prefsError?.code === "PGRST116") {
            const now = new Date().toISOString();
            const { data: created, error: createError } = await auth.supabase
                .from("user_preferences")
                .upsert(
                    {
                        user_id: auth.user.id,
                        onboarding_version: CURRENT_ONBOARDING_VERSION,
                        updated_at: now,
                    },
                    { onConflict: "user_id" }
                )
                .select("onboarding_version, onboarding_completed_at, onboarding_dismissed_at, onboarding_progress")
                .single();
            if (!createError) {
                ensuredPrefs = created ?? null;
            }
        } else if (prefsError) {
            console.error("Error fetching user_preferences:", prefsError);
        }

        return c.json({
            authenticated: true,
            hasSpreadsheet: !!integration?.spreadsheet_id,
            spreadsheetId: integration?.spreadsheet_id || null,
            email: auth.user.email || null,
            userId: auth.user.id,
            onboarding: {
                version: ensuredPrefs?.onboarding_version ?? CURRENT_ONBOARDING_VERSION,
                completedAt: ensuredPrefs?.onboarding_completed_at ?? null,
                dismissedAt: ensuredPrefs?.onboarding_dismissed_at ?? null,
                hasCompleted: !!ensuredPrefs?.onboarding_completed_at,
                hasDismissed: !!ensuredPrefs?.onboarding_dismissed_at,
                shouldShow: !ensuredPrefs?.onboarding_completed_at && !ensuredPrefs?.onboarding_dismissed_at,
                progress: ensuredPrefs?.onboarding_progress ?? null,
                hasProgress: !!ensuredPrefs?.onboarding_progress,
            },
        });
    } catch (error) {
        console.error("Error getting session:", error);
        return jsonError(c, "Failed to get session", 500);
    }
});

app.post("/auth/logout", async (c) => {
    return c.json({ ok: true });
});

app.post("/auth/callback", async (c) => {
    try {
        const auth = await getUserFromRequest(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);
        const body = await c.req.json();
        const providerRefreshToken = body?.providerRefreshToken;
        if (!providerRefreshToken) {
            return jsonError(c, "No provider_refresh_token recibido", 400);
        }

        const encryptedRefreshToken = await encrypt(providerRefreshToken);
        const existing = await getUserIntegration(auth.supabase, auth.user.id);
        const hasSpreadsheet = !!existing?.spreadsheet_id;

        const updated = await upsertUserIntegration(auth.supabase, auth.user.id, {
            email: auth.user.email ?? null,
            google_refresh_token_enc: encryptedRefreshToken,
            spreadsheet_id: existing?.spreadsheet_id || null,
        });
        if (!updated) {
            return jsonError(c, "Error al guardar la integración", 500);
        }

        return c.json({
            ok: true,
            setup_pending: !hasSpreadsheet,
            is_new_user: !hasSpreadsheet,
        });
    } catch (error: any) {
        console.error("Error in auth callback:", error);
        return jsonError(c, "auth_callback_failed", 500);
    }
});

app.get("/sheets/home", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) {
            return jsonError(c, "No autenticado", 401);
        }

        const key = `home-${auth.userId}-${auth.spreadsheetId}`;
        const payload = await withCache(key, 300, async () => {
            const accessToken = await refreshAccessToken(auth.refreshToken);
            const titles = await listSpreadsheetSheetTitles(accessToken, auth.spreadsheetId);
            const availableWeekIds = titles
                .map((title) => {
                    const match = title.trim().match(/^Semana\s+(\d+)$/i);
                    if (!match) return null;
                    const id = Number(match[1]);
                    return Number.isFinite(id) && id >= 1 ? Math.trunc(id) : null;
                })
                .filter((n): n is number => typeof n === "number")
                .sort((a, b) => a - b);

            const weeks = availableWeekIds.map((id) => ({ id, name: `Semana ${id}` }));
            const weekId = availableWeekIds[0] ?? 1;

            const [weekValues, prValues, mappingValues] = await Promise.all([
                readSheetValues(accessToken, auth.spreadsheetId, `'Semana ${weekId}'!A:N`),
                readSheetValues(accessToken, auth.spreadsheetId, `'RM A,B,C'!A:E`).catch(async () => {
                    return await readSheetValues(accessToken, auth.spreadsheetId, `'RM'!A:E`);
                }),
                readSheetValues(accessToken, auth.spreadsheetId, `'Ejercicios'!A:D`).catch(() => []),
            ]);

            const exerciseMapping = parseExerciseMapping(mappingValues);
            const week = parseWeekData(weekValues, weekId, exerciseMapping);
            const prs = parsePRData(prValues);
            return { week, weeks, prs, setupError: null };
        });

        return c.json(payload);
    } catch (error: any) {
        console.error("Error loading home:", error);
        const normalized = normalizeSheetsError(error);
        return c.json({ week: { id: 1, days: [] }, weeks: [], prs: [], setupError: { message: normalized.message, code: normalized.code } });
    }
});

app.get("/sheets/weeks", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);

        const key = `weeks-${auth.userId}-${auth.spreadsheetId}`;
        const weeks = await withCache(key, 300, async () => {
            const accessToken = await refreshAccessToken(auth.refreshToken);
            const titles = await listSpreadsheetSheetTitles(accessToken, auth.spreadsheetId);
            return titles
                .map((title) => {
                    const match = title.trim().match(/^Semana\s+(\d+)$/i);
                    if (!match) return null;
                    const id = Number(match[1]);
                    return Number.isFinite(id) && id >= 1 ? { id: Math.trunc(id), name: `Semana ${id}` } : null;
                })
                .filter((w): w is { id: number; name: string } => !!w)
                .sort((a, b) => a.id - b.id);
        });

        return c.json({ weeks });
    } catch (error: any) {
        console.error("Error listing weeks:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/week", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);

        const weekIdRaw = c.req.query("weekId");
        const weekId = Number(weekIdRaw);
        if (!Number.isFinite(weekId) || weekId < 1) {
            return jsonError(c, "weekId is required", 400);
        }

        const key = `week-${auth.userId}-${auth.spreadsheetId}-${weekId}`;
        const week = await withCache(key, 300, async () => {
            const accessToken = await refreshAccessToken(auth.refreshToken);
            const weekRange = `'Semana ${weekId}'!A:N`;
            const mappingRange = `'Ejercicios'!A:D`;
            const batch = await readSheetValuesBatch(accessToken, auth.spreadsheetId, [mappingRange, weekRange]);
            const mappingValues = batch[mappingRange] || [];
            const weekValues = batch[weekRange] || [];
            const exerciseMapping = parseExerciseMapping(mappingValues);
            return parseWeekData(weekValues, weekId, exerciseMapping);
        });

        return c.json({ week });
    } catch (error: any) {
        console.error("Error loading week:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/prs", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const values = await readSheetValues(accessToken, auth.spreadsheetId, `'RM A,B,C'!A:E`)
            .catch(async () => readSheetValues(accessToken, auth.spreadsheetId, `'RM'!A:E`));
        const prs = parsePRData(values);
        return c.json({ prs });
    } catch (error: any) {
        console.error("Error loading PRs:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/exercises", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const values = await readSheetValues(accessToken, auth.spreadsheetId, `'Ejercicios'!A:D`);
        const exercises = (values || []).reduce((acc: any[], row, idx) => {
            if (idx === 0 && row[0]?.toString().toLowerCase().includes("ejercicio")) return acc;
            const name = row[0]?.toString().trim();
            if (!name) return acc;
            acc.push({
                name,
                muscle: row[1]?.toString().trim() || "",
                categories: row[2]?.toString().trim() || "",
                image: row[3]?.toString().trim() || "",
            });
            return acc;
        }, []);

        return c.json({ exercises });
    } catch (error: any) {
        console.error("Error loading exercises:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/series", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const values = await readSheetValues(accessToken, auth.spreadsheetId, `'Series'!A:A`);
        const series = (values || [])
            .map((row) => row?.[0]?.toString().trim())
            .filter(Boolean);
        return c.json({ series });
    } catch (error: any) {
        console.error("Error loading series:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/onboarding-data", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const [exValues, seriesValues] = await Promise.all([
            readSheetValues(accessToken, auth.spreadsheetId, `'Ejercicios'!A:D`),
            readSheetValues(accessToken, auth.spreadsheetId, `'Series'!A:A`),
        ]);

        const exercises = (exValues || []).reduce((acc: any[], row, idx) => {
            if (idx === 0 && row[0]?.toString().toLowerCase().includes("ejercicio")) return acc;
            const name = row[0]?.toString().trim();
            if (!name) return acc;
            acc.push({
                name,
                muscle: row[1]?.toString().trim() || "",
                categories: row[2]?.toString().trim() || "",
                image: row[3]?.toString().trim() || "",
            });
            return acc;
        }, []);

        const series = (seriesValues || [])
            .map((row) => row?.[0]?.toString().trim())
            .filter(Boolean);

        return c.json({ exercises, series });
    } catch (error: any) {
        console.error("Error loading onboarding data:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/exercise", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);
        const weekId = Number(c.req.query("weekId"));
        const dayId = Number(c.req.query("dayId"));
        const exerciseName = c.req.query("exerciseName") || "";
        if (!Number.isFinite(weekId) || !Number.isFinite(dayId) || !exerciseName) {
            return jsonError(c, "Missing params", 400);
        }
        const accessToken = await refreshAccessToken(auth.refreshToken);
        const sets = await readExerciseSets({
            accessToken,
            spreadsheetId: auth.spreadsheetId,
            weekId,
            dayId,
            exerciseName,
        });
        return c.json({ sets });
    } catch (error: any) {
        console.error("Error loading exercise sets:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.post("/sheets/exercises-bulk", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);
        const body = await c.req.json();
        const { weekId, dayId, exerciseNames } = body || {};
        if (!Number.isFinite(weekId) || !Number.isFinite(dayId) || !Array.isArray(exerciseNames)) {
            return jsonError(c, "Invalid payload", 400);
        }
        const accessToken = await refreshAccessToken(auth.refreshToken);
        const results = await readExerciseSetsBulk({
            accessToken,
            spreadsheetId: auth.spreadsheetId,
            weekId,
            dayId,
            exerciseNames,
        });
        return c.json({ results });
    } catch (error: any) {
        console.error("Error loading exercise sets bulk:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.post("/sheets/save", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);
        const body = await c.req.json();
        const { weekId, dayId, exerciseName, sets } = body || {};
        if (!Number.isFinite(weekId) || !Number.isFinite(dayId) || !exerciseName || !Array.isArray(sets)) {
            return jsonError(c, "Invalid payload", 400);
        }
        const accessToken = await refreshAccessToken(auth.refreshToken);
        await saveExerciseSets({
            accessToken,
            spreadsheetId: auth.spreadsheetId,
            weekId,
            dayId,
            exerciseName,
            sets,
        });
        return c.json({ ok: true });
    } catch (error: any) {
        console.error("Error saving exercise sets:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.post("/sheets/rating", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);
        const body = await c.req.json();
        const { weekId, dayId, stars } = body || {};
        if (!Number.isFinite(weekId) || !Number.isFinite(dayId) || !Number.isFinite(stars)) {
            return jsonError(c, "Invalid payload", 400);
        }
        const accessToken = await refreshAccessToken(auth.refreshToken);
        await saveSessionRating({
            accessToken,
            spreadsheetId: auth.spreadsheetId,
            weekId,
            dayId,
            stars,
        });
        return c.json({ ok: true });
    } catch (error: any) {
        console.error("Error saving rating:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/routine", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);
        const dayId = Number(c.req.query("dayId"));
        if (!Number.isFinite(dayId) || dayId < 1 || dayId > 5) {
            return jsonError(c, "dayId debe ser un número entre 1 y 5", 400);
        }
        const accessToken = await refreshAccessToken(auth.refreshToken);
        const sheetName = "Semana 1";
        const values = await readSheetValues(accessToken, auth.spreadsheetId, `'${sheetName}'!A:B`);
        const dayRange = findDayRange(values, dayId);
        if (!dayRange) return c.json({ exercises: [] });
        const exercises: { name: string; prescribedSeries: string }[] = [];
        for (let i = dayRange.startRow; i < dayRange.endRow; i++) {
            const row = values[i];
            const name = row?.[0]?.toString().trim();
            if (name && !name.toUpperCase().startsWith("DIA ")) {
                exercises.push({
                    name,
                    prescribedSeries: row?.[1]?.toString().trim() || "",
                });
            }
        }
        return c.json({ exercises });
    } catch (error: any) {
        console.error("Error loading routine:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.post("/sheets/routine", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);
        const body = await c.req.json();
        const { dayId, exercises } = body || {};
        if (!Number.isFinite(dayId) || dayId < 1 || dayId > 5) {
            return jsonError(c, "dayId debe ser un número entre 1 y 5", 400);
        }
        if (!Array.isArray(exercises)) {
            return jsonError(c, "exercises debe ser un array", 400);
        }
        if (exercises.length > MAX_EXERCISES_PER_DAY) {
            return jsonError(c, `Máximo ${MAX_EXERCISES_PER_DAY} ejercicios por día`, 400);
        }
        const accessToken = await refreshAccessToken(auth.refreshToken);
        const sheetName = "Semana 1";
        const currentData = await readSheetValues(accessToken, auth.spreadsheetId, `'${sheetName}'!A:B`);
        const dayRange = findDayRange(currentData, dayId);
        if (!dayRange) {
            return jsonError(c, `No se encontró el DIA ${dayId} en la hoja`, 404);
        }
        const exerciseStartRow = dayRange.startRow + 1;
        const exerciseEndRow = exerciseStartRow + MAX_EXERCISES_PER_DAY - 1;
        const values: (string | null)[][] = [];
        for (let i = 0; i < MAX_EXERCISES_PER_DAY; i++) {
            if (i < exercises.length) {
                values.push([exercises[i].name, exercises[i].prescribedSeries]);
            } else {
                values.push(["", ""]);
            }
        }
        const sheets = google.sheets({ version: "v4", auth: getAuthenticatedClient(accessToken) });
        const range = `'${sheetName}'!A${exerciseStartRow}:B${exerciseEndRow}`;
        await sheets.spreadsheets.values.update({
            spreadsheetId: auth.spreadsheetId,
            range,
            valueInputOption: "USER_ENTERED",
            requestBody: { values },
        });
        return c.json({ ok: true, dayId, exercisesCount: exercises.length, range });
    } catch (error: any) {
        console.error("Error saving routine:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/routine/days", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);
        const accessToken = await refreshAccessToken(auth.refreshToken);
        const values = await readSheetValues(accessToken, auth.spreadsheetId, `'Semana 1'!A:B`);
        const days: { id: number; exercisesCount: number }[] = [];
        let currentDayId = 0;
        let count = 0;
        for (const row of values || []) {
            const cell = row?.[0]?.toString().trim().toUpperCase() || "";
            if (cell.startsWith("DIA ")) {
                if (currentDayId > 0) {
                    days.push({ id: currentDayId, exercisesCount: count });
                }
                currentDayId = parseInt(cell.replace("DIA ", ""));
                count = 0;
                continue;
            }
            if (currentDayId > 0 && row?.[0]) {
                count += 1;
            }
        }
        if (currentDayId > 0) {
            days.push({ id: currentDayId, exercisesCount: count });
        }
        return c.json({ days });
    } catch (error: any) {
        console.error("Error loading routine days:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.post("/sheets/mesociclo", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);
        const body = await c.req.json();
        const weeks = Number(body?.weeks);
        if (!Number.isFinite(weeks) || weeks < 1 || weeks > 15) {
            return jsonError(c, "weeks debe ser un número entre 1 y 15", 400);
        }
        const accessToken = await refreshAccessToken(auth.refreshToken);
        const sheets = google.sheets({ version: "v4", auth: getAuthenticatedClient(accessToken) });

        const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId: auth.spreadsheetId,
            fields: "sheets.properties",
        });

        const sheetsList = spreadsheet.data.sheets || [];
        const weekSheets: { id: number; sheetId: number; title: string }[] = [];
        for (const sheet of sheetsList) {
            const title = sheet.properties?.title?.trim() || "";
            const sheetId = sheet.properties?.sheetId;
            const match = title.match(/^Semana\s+(\d+)$/i);
            if (match && typeof sheetId === "number") {
                weekSheets.push({
                    id: parseInt(match[1]),
                    sheetId,
                    title,
                });
            }
        }
        weekSheets.sort((a, b) => a.id - b.id);

        if (weeks === 1) {
            return c.json({
                ok: true,
                weeksCreated: [],
                totalWeeks: 1,
                message: "Solo se necesita Semana 1, no hay nada que duplicar",
            });
        }

        const templateSheet = weekSheets.find((w) => w.id === 1) || weekSheets[0];
        if (!templateSheet) {
            const availableSheets = sheetsList.map((s) => s.properties?.title).filter(Boolean);
            console.error("No week sheets found. Available sheets:", availableSheets);
            return jsonError(
                c,
                "No se encontró ninguna hoja de semana en tu planilla. Asegurate de tener al menos 'Semana 1'.",
                404
            );
        }

        const existingWeekIds = new Set(weekSheets.map((w) => w.id));
        const weeksCreated: number[] = [];
        for (let weekNum = 1; weekNum <= weeks; weekNum++) {
            if (existingWeekIds.has(weekNum)) continue;
            const newSheetName = `Semana ${weekNum}`;
            const duplicateResponse = await sheets.spreadsheets.batchUpdate({
                spreadsheetId: auth.spreadsheetId,
                requestBody: {
                    requests: [
                        {
                            duplicateSheet: {
                                sourceSheetId: templateSheet.sheetId,
                                newSheetName,
                            },
                        },
                    ],
                },
            });
            const newSheetId = duplicateResponse.data.replies?.[0]?.duplicateSheet?.properties?.sheetId;
            if (newSheetId !== undefined) {
                await cleanWeekData(sheets, auth.spreadsheetId, newSheetName);
            }
            weeksCreated.push(weekNum);
        }

        return c.json({ ok: true, weeksCreated, totalWeeks: weeks });
    } catch (error: any) {
        console.error("Error creating mesociclo:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.delete("/sheets/mesociclo", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);
        const accessToken = await refreshAccessToken(auth.refreshToken);
        const sheets = google.sheets({ version: "v4", auth: getAuthenticatedClient(accessToken) });
        const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId: auth.spreadsheetId,
            fields: "sheets.properties",
        });
        const sheetsToDelete =
            spreadsheet.data.sheets
                ?.filter((s) => {
                    const title = s.properties?.title?.trim() || "";
                    const match = title.match(/^Semana\s+(\d+)$/i);
                    return match && parseInt(match[1]) > 1;
                })
                .map((s) => ({ deleteSheet: { sheetId: s.properties!.sheetId! } })) || [];
        if (sheetsToDelete.length > 0) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: auth.spreadsheetId,
                requestBody: { requests: sheetsToDelete },
            });
        }
        return c.json({ ok: true });
    } catch (error: any) {
        console.error("Error resetting mesociclo:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.post("/sheets/setup", async (c) => {
    try {
        const auth = await getUserFromRequest(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);

        const integration = await getUserIntegration(auth.supabase, auth.user.id);
        if (!integration) {
            return jsonError(c, "No se encontró la integración del usuario", 404);
        }
        if (integration.spreadsheet_id) {
            return c.json({ ok: true, spreadsheetId: integration.spreadsheet_id, alreadyExists: true });
        }
        if (!integration.google_refresh_token_enc) {
            return jsonError(c, "No hay token de Google guardado. Volvé a iniciar sesión.", 400);
        }

        const refreshToken = await decrypt(integration.google_refresh_token_enc);
        const accessToken = await refreshAccessToken(refreshToken);
        const spreadsheetId = await copyTemplate(accessToken);
        const updated = await upsertUserIntegration(auth.supabase, auth.user.id, { spreadsheet_id: spreadsheetId });
        if (!updated) {
            return jsonError(c, "Error al guardar la planilla. Intentá de nuevo.", 500);
        }
        return c.json({ ok: true, spreadsheetId, alreadyExists: false });
    } catch (error: any) {
        console.error("Error in sheets setup:", error);
        return jsonError(c, error?.message || "Error al crear la planilla", 500);
    }
});

app.get("/sheets/setup", async (c) => {
    try {
        const auth = await getUserFromRequest(getAuthHeader(c));
        if (!auth) {
            return c.json({ setupComplete: false, authenticated: false });
        }
        const integration = await getUserIntegration(auth.supabase, auth.user.id);
        return c.json({
            setupComplete: !!integration?.spreadsheet_id,
            authenticated: true,
            spreadsheetId: integration?.spreadsheet_id || null,
        });
    } catch (error) {
        console.error("Error checking setup status:", error);
        return c.json({ setupComplete: false, authenticated: false });
    }
});

app.get("/fatiga", async (c) => {
    try {
        const auth = await getAuthContext(getAuthHeader(c));
        if (!auth) {
            return c.json({ muscleRows: [], daySummary: [], calendarDays: [], intensityByGroupId: {} });
        }
        const accessToken = await refreshAccessToken(auth.refreshToken);
        const data = await readSheetValues(accessToken, auth.spreadsheetId, `'Fatiga'!A:Z`);
        const { muscleRows, daySummary, calendarDays, raw } = computeFatigaFromSheet(data);
        return c.json({ muscleRows, daySummary, calendarDays, intensityByGroupId: raw });
    } catch (error: any) {
        console.error("Error in /api/fatiga:", error);
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.post("/bodymap", async (c) => {
    try {
        const body = await c.req.json();
        const response = await fetch("https://bodymap-api.vercel.app/api/bodymap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`External API responded with ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        return new Response(buffer, {
            headers: {
                "Content-Type": "image/png",
                "Cache-Control": "public, max-age=3600",
            },
        });
    } catch (error: any) {
        console.error("BodyMap Proxy Error:", error);
        return jsonError(c, error.message, 500);
    }
});

app.get("/user/preferences/onboarding", async (c) => {
    try {
        const auth = await getUserFromRequest(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);

        const { data: prefs, error } = await auth.supabase
            .from("user_preferences")
            .select("onboarding_version, onboarding_completed_at, onboarding_dismissed_at, onboarding_progress")
            .eq("user_id", auth.user.id)
            .single();

        if (error && error.code !== "PGRST116") {
            console.error("Error fetching preferences:", error);
            return jsonError(c, "Error al obtener preferencias", 500);
        }

        if (error?.code === "PGRST116") {
            const now = new Date().toISOString();
            const { error: ensureError } = await auth.supabase
                .from("user_preferences")
                .upsert(
                    {
                        user_id: auth.user.id,
                        onboarding_version: CURRENT_ONBOARDING_VERSION,
                        updated_at: now,
                    },
                    { onConflict: "user_id" }
                );
            if (ensureError) {
                console.error("Error ensuring preferences row:", ensureError);
            }
        }

        return c.json({
            onboarding_version: prefs?.onboarding_version ?? CURRENT_ONBOARDING_VERSION,
            onboarding_completed_at: prefs?.onboarding_completed_at ?? null,
            onboarding_dismissed_at: prefs?.onboarding_dismissed_at ?? null,
            onboarding_progress: prefs?.onboarding_progress ?? null,
            hasCompletedOnboarding: !!prefs?.onboarding_completed_at,
            hasDismissedOnboarding: !!prefs?.onboarding_dismissed_at,
            shouldShowOnboarding: !prefs?.onboarding_completed_at && !prefs?.onboarding_dismissed_at,
            hasProgress: !!prefs?.onboarding_progress,
        });
    } catch (error) {
        console.error("Error in onboarding preferences GET:", error);
        return jsonError(c, "Error interno", 500);
    }
});

app.post("/user/preferences/onboarding", async (c) => {
    try {
        const auth = await getUserFromRequest(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);

        const body = await c.req.json();
        const { action } = body || {};
        const now = new Date().toISOString();
        let upsertData: Record<string, any> | null = null;

        if (action === "complete") {
            upsertData = {
                onboarding_completed_at: now,
                onboarding_dismissed_at: null,
                onboarding_progress: null,
                onboarding_version: CURRENT_ONBOARDING_VERSION,
            };
        } else if (action === "dismiss") {
            upsertData = {
                onboarding_dismissed_at: now,
                onboarding_progress: null,
                onboarding_version: CURRENT_ONBOARDING_VERSION,
            };
        } else if (action === "progress") {
            if (!body.progress) {
                return jsonError(c, "progress requerido cuando action='progress'", 400);
            }
            upsertData = {
                onboarding_progress: {
                    ...body.progress,
                    updatedAt: now,
                },
                onboarding_version: CURRENT_ONBOARDING_VERSION,
            };
        } else {
            return jsonError(c, "action debe ser 'complete', 'dismiss' o 'progress'", 400);
        }

        const { error: upsertError } = await auth.supabase
            .from("user_preferences")
            .upsert(
                {
                    user_id: auth.user.id,
                    ...upsertData,
                    updated_at: now,
                },
                { onConflict: "user_id" }
            );

        if (upsertError) {
            console.error("Error upserting onboarding preferences:", upsertError);
            return jsonError(c, "Error al guardar preferencias", 500);
        }

        return c.json({ ok: true, action });
    } catch (error) {
        console.error("Error in onboarding preferences POST:", error);
        return jsonError(c, "Error interno", 500);
    }
});

app.delete("/user/preferences/onboarding", async (c) => {
    try {
        const auth = await getUserFromRequest(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);

        const { error: updateError } = await auth.supabase
            .from("user_preferences")
            .update({
                onboarding_completed_at: null,
                onboarding_dismissed_at: null,
                onboarding_progress: null,
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", auth.user.id);

        if (updateError && updateError.code !== "PGRST116") {
            console.error("Error resetting onboarding preferences:", updateError);
            return jsonError(c, "Error al resetear preferencias", 500);
        }

        return c.json({ ok: true });
    } catch (error) {
        console.error("Error in onboarding preferences DELETE:", error);
        return jsonError(c, "Error interno", 500);
    }
});

// Export as Node.js HTTP handler for Vercel Build Output API
export default getRequestListener(app.fetch);
