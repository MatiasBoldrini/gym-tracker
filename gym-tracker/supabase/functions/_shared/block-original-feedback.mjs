import { cellRating, columnName, feedbackDivider, quoteTab, splitFeedback } from "./block-plan-import.mjs";
import { changeNote, SheetConflict } from "./block-sheet-row.mjs";

// Keep the physical values replaced in the same Google transaction. Columns DT:DU of
// the managed tab are hidden and independent of the split JSON archive starting at AQ.
const shadowStart = 123;
function observedRating(value) {
    try { return cellRating(value); }
    catch { throw new SheetConflict("Revisá la calificación en la pestaña del bloque."); }
}

function sourceDay(routine, key) {
    const [id, week, day] = JSON.parse(key);
    const block = routine.blocks.find(b => b.id === id);
    return { block, week, day, entry: block?.weeks.find(w => w.number === week)?.days.find(d => d.number === day) };
}

function noteCell(planNote, workoutNote) {
    if (!workoutNote || workoutNote === planNote) return { text: planNote, truncated: false };
    const prefix = planNote ? planNote + "\n\n" + feedbackDivider + "\n\n" : "";
    const text = prefix + workoutNote;
    if (text.length <= 50_000) return { text, truncated: false };
    // Keep the complete plan instruction. Full workout notes live in the database and the split archive.
    if (prefix.length >= 49_999) return { text: planNote, truncated: true };
    let end = 49_999;
    if (/[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
    return { text: text.slice(0, end) + "…", truncated: true };
}
function stars(rating) {
    return rating == null ? "" : "★".repeat(rating) + "☆".repeat(3 - rating);
}
function outbound(ref, note, rating) {
    const edits = [];
    if (ref.note !== note) edits.push({ column: ref.noteColumnIndex, text: note });
    if (ref.rating !== rating) edits.push({ column: ref.ratingColumnIndex, text: stars(rating) });
    return edits;
}

// Check the semantic anchors as well as the values: a coach can insert an exercise after this scan.
async function checkCells(ctx, origin, edits) {
    if (!edits.length) return;
    const { ref, title, week, day } = origin;
    if (ctx.metadata?.sheets && !ctx.metadata.sheets.some(tab => tab.properties.sheetId === ref.sheetId && tab.properties.title === title))
        throw new SheetConflict("Cambió la pestaña del bloque. Se volverá a leer la programación.");
    const tab = quoteTab(title) + "!";
    const markerCol = columnName(ref.noteColumnIndex - 1);
    const row = ref.rowIndex + 1;
    const feedback = tab + markerCol + row + ":" + columnName(ref.ratingColumnIndex) + row;
    const [cells, formulas] = await Promise.all([
        ctx.sheets.readValues(ctx.scan.spreadsheet_id, [
            tab + markerCol + (ref.weekHeaderRowIndex + 1), tab + "A" + (ref.dayHeaderRowIndex + 1), feedback,
        ]),
        ctx.sheets.readValues(ctx.scan.spreadsheet_id, [feedback], "FORMULA"),
    ]);
    const weekHeader = String(cells[0]?.values?.[0]?.[0] ?? "").trim();
    const dayHeader = String(cells[1]?.values?.[0]?.[0] ?? "").trim();
    const [marker, rawNote, rawRating] = cells[2]?.values?.[0] ?? [];
    const headerNumber = /^(?:week|semana)\s*(\d+)$/i.exec(weekHeader);
    const dayNumber = /^(?:día|dia)\s*(\d+)$/i.exec(dayHeader);
    if (!headerNumber || Number(headerNumber[1]) !== week || !dayNumber || Number(dayNumber[1]) !== day ||
        !/^nota\s*:?$/i.test(String(marker).trim()) || String(rawNote ?? "").trim() !== ref.note || observedRating(rawRating) !== ref.rating)
        throw new SheetConflict("Cambió la fila de nota o estrellas en la pestaña del bloque. Se volverá a leer.");
    for (const edit of edits) {
        const formula = formulas[0]?.values?.[0]?.[edit.column - ref.noteColumnIndex + 1];
        if (typeof formula === "string" && formula.startsWith("="))
            throw new SheetConflict("La celda de nota o estrellas contiene una fórmula. Revisá la celda de la pestaña del bloque.");
    }
}

export async function readOriginalFeedback(ctx) {
    const { plan, dbRow, base, baseOriginal } = ctx;
    const key = dbRow?.session_key ?? ctx.key;
    if (!key) return {};
    const { block, week, day, entry } = sourceDay(plan.routine, key);
    const ref = entry?.sheetFeedback;
    if (!ref) return {};
    const parsed = splitFeedback(ref.note);
    const prior = plan.previousRoutine && sourceDay(plan.previousRoutine, key).entry;
    const before = baseOriginal ?? (prior ? { note: prior.sheetFeedback?.note ?? prior.note, rating: prior.rating, planNote: prior.note } : null);
    const original = { ref, title: block.name, week, day, planNote: parsed.planNote, patch: {} };
    const current = dbRow?.workout;
    if (!current) return original;
    if (before && !parsed.separated) {
        // A flat note written in the block is a workout note once the session has a baseline.
        // Keep a pre-existing plan instruction as the first paragraph of the cell.
        original.planNote = before.planNote;
    }
    const fromSheet = (field, observed, baseValue) => {
        if (field === "note") {
            const merged = { ...current };
            changeNote(merged, observed, entry);
            if (merged.note === current.note) return;
        } else if (observed === current[field]) return;
        original.patch[field] = observed;
        if (current[field] !== baseValue)
            original.conflict = "Se cambió la misma " + (field === "note" ? "nota" : "calificación") + " en la app y en la pestaña del bloque.";
    };
    // A human edit after the preflight is copied before we overwrite its cell. Recover it
    // from the managed row if the visible cell still contains our own last projection.
    let observedNote = ref.note;
    let observedStars = ref.rating;
    let raced = false;
    if (baseOriginal?.guard && ctx.raw?.length) {
        const guard = baseOriginal.guard;
        if (Object.hasOwn(guard, "note") && ref.note === before.note) {
            const captured = String(ctx.raw[shadowStart] ?? "").trim();
            if (captured !== guard.note && captured !== ref.note) { observedNote = captured; raced = true; }
        }
        if (Object.hasOwn(guard, "rating") && ref.rating === before.rating) {
            const captured = observedRating(ctx.raw[shadowStart + 1]);
            if (captured !== guard.rating && captured !== ref.rating) { observedStars = captured; raced = true; }
        }
    }
    if (before && observedStars !== before.rating) fromSheet("rating", observedStars, base ? base.rating : before.rating);
    if (before && observedNote !== before.note) {
        const edited = splitFeedback(observedNote);
        let workoutNote = edited.separated ? edited.workoutNote : observedNote;
        if (!edited.separated && workoutNote === before.planNote) workoutNote = "";
        fromSheet("note", workoutNote, base?.note ?? "");
        if (baseOriginal?.truncated && Object.hasOwn(original.patch, "note"))
            original.conflict = "Se editó una nota abreviada en el bloque. Revisá la versión completa de la sesión.";
    }
    if (raced && Object.keys(original.patch).length)
        original.conflict = "Se editó la nota o calificación del bloque mientras se publicaba desde la app. Elegí qué versión conservar en Registro app.";
    const target = { ...current, ...original.patch };
    if (Object.hasOwn(original.patch, "note")) changeNote(target, original.patch.note, entry);
    const projected = noteCell(original.planNote, target.note);
    const baseline = { planNote: original.planNote, note: projected.text, rating: target.rating, truncated: projected.truncated };
    original.needsBaseline = !baseOriginal || Object.keys(baseline).some(k => baseline[k] !== baseOriginal[k]);
    await checkCells(ctx, original, outbound(ref, projected.text, target.rating));
    return original;
}

export async function writeOriginalFeedback(ctx) {
    const original = ctx.original;
    if (!original?.ref) return { requests: [], baseline: null };
    const current = ctx.dbRow.workout;
    const { text: note, truncated } = noteCell(original.planNote, current.note);
    const rating = current.rating;
    const { ref } = original;
    const edits = outbound(ref, note, rating);
    await checkCells(ctx, original, edits);
    const requests = edits.map(({ column, text }) => ({ updateCells: {
        range: { sheetId: ref.sheetId, startRowIndex: ref.rowIndex, endRowIndex: ref.rowIndex + 1,
            startColumnIndex: column, endColumnIndex: column + 1 },
        rows: [{ values: [text ? { userEnteredValue: { stringValue: text } } : {}] }], fields: "userEnteredValue",
    } }));
    const baseline = { planNote: original.planNote, note, rating, truncated };
    if (edits.length && ctx.tab && ctx.number >= 2) {
        const guard = {};
        for (const { column } of edits) {
            const isNote = column === ref.noteColumnIndex;
            const destinationColumn = shadowStart + (isNote ? 0 : 1);
            const source = { sheetId: ref.sheetId, startRowIndex: ref.rowIndex, endRowIndex: ref.rowIndex + 1,
                startColumnIndex: column, endColumnIndex: column + 1 };
            const destination = { sheetId: ctx.tab.properties.sheetId, startRowIndex: ctx.number - 1, endRowIndex: ctx.number,
                startColumnIndex: destinationColumn, endColumnIndex: destinationColumn + 1 };
            requests.unshift({ copyPaste: { source, destination, pasteType: "PASTE_VALUES" } });
            if (isNote) guard.note = ref.note;
            else guard.rating = ref.rating;
        }
        baseline.guard = guard;
        return { requests, baseline, shadowColumnCount: shadowStart + 2 };
    }
    return { requests, baseline };
}
