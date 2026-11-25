import { Hono } from "hono";
import { getRequestListener } from "@hono/node-server";
import { google, type sheets_v4 } from "googleapis";
import { getAuthContextResult, getUserFromRequest } from "./_lib/supabase/auth";
import { getUserIntegration, upsertUserIntegration } from "./_lib/supabase/integrations";
import { getAuthenticatedClient, refreshAccessToken } from "./_lib/google/oauth";
import { readSheetValues, readSheetValuesBatch, listSpreadsheetSheetTitles, readExerciseSets, readExerciseSetsBulk, saveExerciseSets, saveSessionRating } from "./_lib/google/sheets";
import { normalizeSheetsError } from "./_lib/google/sheets-errors";
import { parseExerciseMapping, parsePRData, parseWeekData } from "./_lib/sheets-parse";
import { computeFatigaFromSheet } from "./_lib/fatiga";
import { copyTemplate } from "./_lib/google/drive";
import {
    buildRoutineEdits, buildWeekClears, findDayRange, MAX_DAYS, MAX_EXERCISES_PER_DAY,
    readDayId, readWorkoutSheet, type RoutineExercise,
} from "./_lib/google/workout-sheet";
import { normalizeExerciseKey } from "./_lib/normalize";
import { parseSetSlots } from "./_lib/set-values";
import { decrypt, encrypt } from "./_lib/crypto";

const CURRENT_ONBOARDING_VERSION = 1;

function isWeekId(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isDayId(value: unknown): value is number {
    return isWeekId(value) && value <= MAX_DAYS;
}

function isExerciseName(value: unknown): value is string {
    return typeof value === "string" && normalizeExerciseKey(value).length > 0 && readDayId(value) === null;
}

function listWeeks(titles: string[]) {
    return titles.flatMap((title) => {
        const match = title.match(/^Semana ([1-9]\d*)$/);
        const id = Number(match?.[1]);
        return isWeekId(id) ? [{ id, name: title }] : [];
    }).sort((left, right) => left.id - right.id);
}

const app = new Hono().basePath("/api");

for (const route of ["/auth/*", "/sheets/*", "/user/*", "/fatiga"]) {
    app.use(route, async (c, next) => {
        c.header("Cache-Control", "private, no-store");
        await next();
    });
}

app.notFound((c) => c.json({ error: "Ruta no encontrada" }, 404));
app.onError((_error, c) => {
    console.error("Unhandled API error");
    return c.json({ error: "Error interno" }, 500);
});
app.get("/auth/ping", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

function getAuthHeader(c: any) {
    return c.req.header("Authorization") ?? null;
}

function getEmailFromSupabaseUser(user: any): string | null {
    const direct = typeof user?.email === "string" ? user.email.trim() : "";
    if (direct) return direct;
    const meta = typeof user?.user_metadata?.email === "string" ? user.user_metadata.email.trim() : "";
    if (meta) return meta;
    const identities = Array.isArray(user?.identities) ? user.identities : [];
    const identityEmail =
        typeof identities?.[0]?.identity_data?.email === "string"
            ? String(identities[0].identity_data.email).trim()
            : "";
    return identityEmail || null;
}

function jsonError(c: any, message: string, status = 500, code?: string) {
    return c.json({ error: message, code }, status);
}

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
            console.error("Error fetching user_preferences");
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
        console.error("Error getting session");
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
        const body = await c.req.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError(c, "JSON inválido", 400);
        const providerRefreshToken = body.providerRefreshToken;
        if (providerRefreshToken != null && typeof providerRefreshToken !== "string") {
            return jsonError(c, "providerRefreshToken debe ser texto", 400);
        }
        const existing = await getUserIntegration(auth.supabase, auth.user.id);
        const hasSpreadsheet = !!existing?.spreadsheet_id;

        // Google puede NO devolver refresh token en logins repetidos. Si ya tenemos uno guardado,
        // consideramos el callback OK y seguimos (especialmente en nuevos dispositivos).
        if (!providerRefreshToken) {
            if (existing?.google_refresh_token_enc) {
                return c.json({
                    ok: true,
                    setup_pending: !hasSpreadsheet,
                    is_new_user: !hasSpreadsheet,
                });
            }
            return jsonError(c, "No provider_refresh_token recibido", 400, "NO_REFRESH_TOKEN");
        }

        const email = getEmailFromSupabaseUser(auth.user);
        if (!email) {
            return jsonError(
                c,
                "No se pudo obtener el email del usuario desde Supabase. Volvé a iniciar sesión con Google.",
                400,
                "NO_EMAIL"
            );
        }

        const encryptedRefreshToken = await encrypt(providerRefreshToken);
        const updated = await upsertUserIntegration(auth.supabase, auth.user.id, {
            email,
            google_refresh_token_enc: encryptedRefreshToken,
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
        console.error("Error in auth callback");
        return jsonError(c, "auth_callback_failed", 500);
    }
});

app.get("/sheets/home", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const titles = await listSpreadsheetSheetTitles(accessToken, auth.spreadsheetId);
        const weeks = listWeeks(titles);
        if (weeks.length === 0) {
            return c.json({
                week: { id: 1, days: [] }, weeks: [], prs: [],
                setupError: { message: "La planilla no tiene ninguna pestaña con el formato «Semana 1».", code: "SHEETS_TEMPLATE_MISMATCH" },
            });
        }
        const weekId = weeks[0].id;
        const [weekValues, prValues, mappingValues] = await Promise.all([
            readSheetValues(accessToken, auth.spreadsheetId, `'Semana ${weekId}'!A:N`),
            readSheetValues(accessToken, auth.spreadsheetId, "'RM A,B,C'!A:E").catch(() => {
                return readSheetValues(accessToken, auth.spreadsheetId, "'RM'!A:E");
            }),
            readSheetValues(accessToken, auth.spreadsheetId, "'Ejercicios'!A:D").catch(() => []),
        ]);
        const week = parseWeekData(weekValues, weekId, parseExerciseMapping(mappingValues));
        return c.json({ week, weeks, prs: parsePRData(prValues), setupError: null });
    } catch (error: any) {
        const normalized = normalizeSheetsError(error);
        console.error("Error loading home", { code: normalized.code, status: normalized.status });
        return c.json({ week: { id: 1, days: [] }, weeks: [], prs: [], setupError: { message: normalized.message, code: normalized.code } });
    }
});

app.get("/sheets/weeks", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const titles = await listSpreadsheetSheetTitles(accessToken, auth.spreadsheetId);
        return c.json({ weeks: listWeeks(titles) });
    } catch (error: any) {
        const normalized = normalizeSheetsError(error);
        console.error("Error listing weeks", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/week", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;

        const weekId = Number(c.req.query("weekId"));
        if (!isWeekId(weekId)) return jsonError(c, "weekId debe ser un entero positivo", 400);

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const weekRange = `'Semana ${weekId}'!A:N`;
        const mappingRange = "'Ejercicios'!A:D";
        const batch = await readSheetValuesBatch(accessToken, auth.spreadsheetId, [mappingRange, weekRange]);
        const week = parseWeekData(batch[weekRange], weekId, parseExerciseMapping(batch[mappingRange]));
        return c.json({ week });
    } catch (error: any) {
        const normalized = normalizeSheetsError(error);
        console.error("Error loading week", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/prs", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const values = await readSheetValues(accessToken, auth.spreadsheetId, `'RM A,B,C'!A:E`)
            .catch(async () => readSheetValues(accessToken, auth.spreadsheetId, `'RM'!A:E`));
        const prs = parsePRData(values);
        return c.json({ prs });
    } catch (error: any) {
        const normalized = normalizeSheetsError(error);
        console.error("Error loading PRs", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/exercises", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;

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
        const normalized = normalizeSheetsError(error);
        console.error("Error loading exercises", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/series", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const values = await readSheetValues(accessToken, auth.spreadsheetId, `'Series'!A:A`);
        const series = (values || [])
            .map((row) => row?.[0]?.toString().trim())
            .filter(Boolean);
        return c.json({ series });
    } catch (error: any) {
        const normalized = normalizeSheetsError(error);
        console.error("Error loading series", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/onboarding-data", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;

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
        const normalized = normalizeSheetsError(error);
        console.error("Error loading onboarding data", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/exercise", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;
        const weekId = Number(c.req.query("weekId"));
        const dayId = Number(c.req.query("dayId"));
        const exerciseName = c.req.query("exerciseName") || "";
        if (!isWeekId(weekId) || !isDayId(dayId) || !isExerciseName(exerciseName)) {
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
        const normalized = normalizeSheetsError(error);
        console.error("Error loading exercise sets", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.post("/sheets/exercises-bulk", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;
        const body = await c.req.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError(c, "JSON inválido", 400);
        const { weekId, dayId, exerciseNames } = body || {};
        if (!isWeekId(weekId) || !isDayId(dayId) || !Array.isArray(exerciseNames) ||
            exerciseNames.length > MAX_EXERCISES_PER_DAY || !exerciseNames.every(isExerciseName)) {
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
        const normalized = normalizeSheetsError(error);
        console.error("Error loading exercise sets bulk", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.post("/sheets/save", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;
        const body = await c.req.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError(c, "JSON inválido", 400);
        const { weekId, dayId, exerciseName } = body;
        const sets = parseSetSlots(body.sets);
        if (!isWeekId(weekId) || !isDayId(dayId) || !isExerciseName(exerciseName) || !sets) {
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
        const normalized = normalizeSheetsError(error);
        console.error("Error saving exercise sets", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.post("/sheets/rating", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;
        const body = await c.req.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError(c, "JSON inválido", 400);
        const { weekId, dayId, stars } = body || {};
        if (!isWeekId(weekId) || !isDayId(dayId) || !Number.isInteger(stars) || stars < 1 || stars > 3) {
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
        const normalized = normalizeSheetsError(error);
        console.error("Error saving rating", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/routine", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;
        const dayId = Number(c.req.query("dayId"));
        if (!isDayId(dayId)) {
            return jsonError(c, "dayId debe ser un entero entre 1 y 5", 400);
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
            if (isExerciseName(name)) {
                exercises.push({
                    name,
                    prescribedSeries: row?.[1]?.toString().trim() || "",
                });
            }
        }
        return c.json({ exercises });
    } catch (error: any) {
        const normalized = normalizeSheetsError(error);
        console.error("Error loading routine", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.post("/sheets/routine", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;
        const body = await c.req.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError(c, "JSON inválido", 400);
        const { dayId, exercises } = body;
        if (!isDayId(dayId)) return jsonError(c, "dayId debe ser un entero entre 1 y 5", 400);
        if (!Array.isArray(exercises) || exercises.length > MAX_EXERCISES_PER_DAY) {
            return jsonError(c, `La rutina admite hasta ${MAX_EXERCISES_PER_DAY} ejercicios por día`, 400);
        }
        if (!exercises.every((exercise): exercise is RoutineExercise =>
            isExerciseName(exercise?.name) && typeof exercise.prescribedSeries === "string")) {
            return jsonError(c, "Cada ejercicio debe tener nombre y series prescritas", 400);
        }
        const accessToken = await refreshAccessToken(auth.refreshToken);
        const sheets = google.sheets({ version: "v4", auth: getAuthenticatedClient(accessToken) });
        const sheet = await readWorkoutSheet(sheets, auth.spreadsheetId, "Semana 1");
        const edit = buildRoutineEdits(sheet, dayId, exercises);
        if (edit.status !== 200) return jsonError(c, edit.message, edit.status);

        await sheets.spreadsheets.batchUpdate({ spreadsheetId: auth.spreadsheetId, requestBody: { requests: edit.requests } });
        return c.json({ ok: true, dayId, exercisesCount: exercises.length, range: edit.range });
    } catch (error: any) {
        const normalized = normalizeSheetsError(error);
        console.error("Error saving routine", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.get("/sheets/routine/days", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;
        const accessToken = await refreshAccessToken(auth.refreshToken);
        const values = await readSheetValues(accessToken, auth.spreadsheetId, `'Semana 1'!A:B`);
        const days = Array.from({ length: MAX_DAYS }, (_, index) => index + 1).flatMap((id) => {
            const range = findDayRange(values, id);
            if (!range) return [];
            const exercisesCount = values.slice(range.startRow, range.endRow).filter((row) => isExerciseName(row[0])).length;
            return [{ id, exercisesCount }];
        });
        return c.json({ days });
    } catch (error: any) {
        const normalized = normalizeSheetsError(error);
        console.error("Error loading routine days", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.post("/sheets/mesociclo", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;
        const body = await c.req.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError(c, "JSON inválido", 400);
        const weeks = typeof body.weeks === "string" ? Number(body.weeks) : body.weeks;
        if (!isWeekId(weeks) || weeks > 15) return jsonError(c, "weeks debe ser un entero entre 1 y 15", 400);

        const accessToken = await refreshAccessToken(auth.refreshToken);
        const sheets = google.sheets({ version: "v4", auth: getAuthenticatedClient(accessToken) });
        const { data } = await sheets.spreadsheets.get({ spreadsheetId: auth.spreadsheetId, fields: "sheets.properties(sheetId,title)" });
        const sheetProperties = data.sheets?.flatMap(({ properties }) => properties ? [properties] : []) ?? [];
        const currentWeeks = listWeeks(sheetProperties.map(({ title }) => title ?? ""));
        const template = currentWeeks[0];
        if (!template) {
            return jsonError(c, "No se encontró ninguna pestaña con el formato «Semana 1».", 404, "SHEETS_TEMPLATE_MISMATCH");
        }

        const existingWeekIds = new Set(currentWeeks.map(({ id }) => id));
        const weeksCreated = Array.from({ length: weeks }, (_, index) => index + 1).filter((id) => !existingWeekIds.has(id));
        if (weeksCreated.length > 0) {
            const source = await readWorkoutSheet(sheets, auth.spreadsheetId, template.name);
            if (!source.exerciseNames.some(([name]) => isDayId(readDayId(name)))) {
                return jsonError(c, "La semana base no tiene encabezados de día reconocibles.", 400, "SHEETS_TEMPLATE_MISMATCH");
            }
            const usedSheetIds = new Set(sheetProperties.map(({ sheetId }) => sheetId));
            let newSheetId = 1;
            const requests: sheets_v4.Schema$Request[] = [];
            for (const weekId of weeksCreated) {
                while (usedSheetIds.has(newSheetId)) newSheetId++;
                requests.push({ duplicateSheet: {
                    sourceSheetId: source.id,
                    newSheetId,
                    newSheetName: `Semana ${weekId}`,
                } }, ...buildWeekClears(source, newSheetId));
                newSheetId++;
            }
            // The duplicate and the cleanup are applied together. An invalid request leaves the workbook untouched.
            await sheets.spreadsheets.batchUpdate({ spreadsheetId: auth.spreadsheetId, requestBody: { requests } });
        }
        return c.json({ ok: true, weeksCreated, totalWeeks: weeks });
    } catch (error: any) {
        const normalized = normalizeSheetsError(error);
        console.error("Error creating mesociclo", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.delete("/sheets/mesociclo", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) return jsonError(c, authRes.message, authRes.status, authRes.code);
        const auth = authRes.ctx;
        const accessToken = await refreshAccessToken(auth.refreshToken);
        const sheets = google.sheets({ version: "v4", auth: getAuthenticatedClient(accessToken) });
        const { data } = await sheets.spreadsheets.get({ spreadsheetId: auth.spreadsheetId, fields: "sheets.properties(sheetId,title)" });
        const sheetProperties = data.sheets?.flatMap(({ properties }) => properties ? [properties] : []) ?? [];
        if (!sheetProperties.some(({ title }) => title === "Semana 1")) {
            return jsonError(c, "No se encontró «Semana 1» en la planilla.", 404, "SHEETS_TEMPLATE_MISMATCH");
        }
        const firstWeek = await readWorkoutSheet(sheets, auth.spreadsheetId, "Semana 1");
        if (!firstWeek.exerciseNames.some(([name]) => isDayId(readDayId(name)))) {
            return jsonError(c, "«Semana 1» no tiene encabezados de día reconocibles.", 400, "SHEETS_TEMPLATE_MISMATCH");
        }
        const weekNames = new Set(listWeeks(sheetProperties.map(({ title }) => title ?? ""))
            .filter(({ id }) => id > 1).map(({ name }) => name));
        const requests: sheets_v4.Schema$Request[] = sheetProperties.flatMap(({ title, sheetId }) =>
            sheetId != null && weekNames.has(title ?? "") ? [{ deleteSheet: { sheetId } }] : []);
        requests.push(...buildWeekClears(firstWeek, firstWeek.id, true));
        if (requests.length > 0) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId: auth.spreadsheetId, requestBody: { requests } });
        }
        return c.json({ ok: true });
    } catch (error: any) {
        const normalized = normalizeSheetsError(error);
        console.error("Error resetting mesociclo", { code: normalized.code, status: normalized.status });
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

        // En DB `email` es NOT NULL. Aseguramos que siempre vaya en el upsert.
        const ensuredEmail = integration.email || getEmailFromSupabaseUser(auth.user);
        if (!ensuredEmail) {
            return jsonError(
                c,
                "No se pudo obtener el email del usuario para crear la integración. Volvé a iniciar sesión con Google.",
                400,
                "NO_EMAIL"
            );
        }

        const refreshToken = await decrypt(integration.google_refresh_token_enc);
        const accessToken = await refreshAccessToken(refreshToken);
        const spreadsheetId = await copyTemplate(accessToken);
        const updated = await upsertUserIntegration(auth.supabase, auth.user.id, {
            email: ensuredEmail,
            spreadsheet_id: spreadsheetId,
        });
        if (!updated) {
            return jsonError(c, "Error al guardar la planilla. Intentá de nuevo.", 500);
        }
        return c.json({ ok: true, spreadsheetId, alreadyExists: false });
    } catch (error: any) {
        console.error("Error in sheets setup");
        const msg = String(error?.message || "");
        const msgLower = msg.toLowerCase();

        // Errores de configuración / cifrado
        if (msgLower.includes("token_encryption_key")) {
            return jsonError(
                c,
                "Falta configurar TOKEN_ENCRYPTION_KEY en el server (mínimo 32 caracteres).",
                500,
                "CONFIG_TOKEN_ENCRYPTION_KEY"
            );
        }
        if (msgLower.includes("missing env google_client_id")) {
            return jsonError(c, "Falta configurar GOOGLE_CLIENT_ID en Vercel.", 500, "CONFIG_GOOGLE_CLIENT_ID");
        }
        if (msgLower.includes("missing env google_client_secret")) {
            return jsonError(c, "Falta configurar GOOGLE_CLIENT_SECRET en Vercel.", 500, "CONFIG_GOOGLE_CLIENT_SECRET");
        }

        // Refresh token revocado/expirado
        if (msgLower.includes("invalid_grant")) {
            return jsonError(
                c,
                "Tu autorización de Google expiró o fue revocada. Cerrá sesión y volvé a conectar tu cuenta de Google.",
                401,
                "GOOGLE_INVALID_GRANT"
            );
        }

        // Drive/Sheets: reutilizamos normalización (permission/not found/bad range)
        const normalized = normalizeSheetsError(error);
        return jsonError(c, normalized.message, normalized.status, normalized.code);
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
        console.error("Error checking setup status");
        return c.json({ setupComplete: false, authenticated: false });
    }
});

app.get("/fatiga", async (c) => {
    try {
        const authRes = await getAuthContextResult(getAuthHeader(c));
        if (!authRes.ok) {
            // Mantener el comportamiento anterior: si no hay sesión, devolvemos vacío.
            if (authRes.code === "NO_AUTH") {
                return c.json({ muscleRows: [], daySummary: [], calendarDays: [], intensityByGroupId: {} });
            }
            return jsonError(c, authRes.message, authRes.status, authRes.code);
        }
        const auth = authRes.ctx;
        const accessToken = await refreshAccessToken(auth.refreshToken);
        const data = await readSheetValues(accessToken, auth.spreadsheetId, `'Fatiga'!A:Z`);
        const { muscleRows, daySummary, calendarDays, raw } = computeFatigaFromSheet(data);
        return c.json({ muscleRows, daySummary, calendarDays, intensityByGroupId: raw });
    } catch (error: any) {
        const normalized = normalizeSheetsError(error);
        console.error("Error in /api/fatiga", { code: normalized.code, status: normalized.status });
        return jsonError(c, normalized.message, normalized.status, normalized.code);
    }
});

app.post("/bodymap", async (c) => {
    try {
        const body = await c.req.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError(c, "JSON inválido", 400);
        const response = await fetch("https://bodymap-api.vercel.app/api/bodymap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
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
        console.error("BodyMap Proxy Error");
        return jsonError(c, "No se pudo generar el mapa muscular", 502);
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
            console.error("Error fetching preferences");
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
                console.error("Error ensuring preferences row");
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
        console.error("Error in onboarding preferences GET");
        return jsonError(c, "Error interno", 500);
    }
});

app.post("/user/preferences/onboarding", async (c) => {
    try {
        const auth = await getUserFromRequest(getAuthHeader(c));
        if (!auth) return jsonError(c, "No autenticado", 401);

        const body = await c.req.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError(c, "JSON inválido", 400);
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
            console.error("Error upserting onboarding preferences");
            return jsonError(c, "Error al guardar preferencias", 500);
        }

        return c.json({ ok: true, action });
    } catch (error) {
        console.error("Error in onboarding preferences POST");
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
            console.error("Error resetting onboarding preferences");
            return jsonError(c, "Error al resetear preferencias", 500);
        }

        return c.json({ ok: true });
    } catch (error) {
        console.error("Error in onboarding preferences DELETE");
        return jsonError(c, "Error interno", 500);
    }
});

// Export as Node.js HTTP handler for Vercel Build Output API
export default getRequestListener(app.fetch);
