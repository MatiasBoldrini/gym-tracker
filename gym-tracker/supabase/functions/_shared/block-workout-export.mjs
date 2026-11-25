import { createHash, randomInt } from "node:crypto";

import { formatLoad } from "./block-set-input.mjs";

const sheetTitle = "Registro app";
const ownerKey = "gym_tracker_block_workouts_v1";
const headers = [
    "Bloque",
    "Semana",
    "Día",
    "Inicio",
    "Fin",
    "Estrellas",
    "Series",
    "Notas",
    "Revisión",
    "Registro completo (JSON)",
];
const chunkSize = 32_000;

// Google limits the size of a single cell. Keep Unicode characters whole at chunk boundaries.
function chunks(text) {
    const result = [];
    for (let start = 0; start < text.length;) {
        let end = Math.min(start + chunkSize, text.length);
        if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
        result.push(text.slice(start, end));
        start = end;
    }
    return result;
}

function summary(text) {
    return text.length <= chunkSize ? text : chunks(text)[0] + "…";
}

export function seriesLabel(id, names) {
    const name = names?.[id] || id;
    const same = Object.keys(names ?? {}).filter((other) => names[other] === name).sort();
    return same.length > 1 ? name + " (" + (same.indexOf(id) + 1) + ")" : name;
}

export function renderSet(set) {
    const done = set.confirmed ?? Boolean(set.reps?.trim());
    const weight = formatLoad(set.kg);
    const load = weight ? " × " + weight : "";
    return (done ? "✓ " : "○ ") + (set.reps || "—") + load + (set.effort ? " · " + set.effort : "");
}

export function valuesFor(job, legacyLabels = false) {
    const [block, week, day] = JSON.parse(job.session_key);
    const w = job.workout;
    const sets = Object.entries(w.sets).map(([id, rows]) => {
        const values = rows.map(renderSet);
        const label = legacyLabels ? (job.exercise_names?.[id] || id) : seriesLabel(id, job.exercise_names);
        return `${label}: ${values.join(" / ")}`;
    });
    return [
        job.block_name || block,
        week,
        day,
        w.startedAt,
        w.finishedAt ?? null,
        w.rating,
        summary(sets.join("\n")),
        summary(w.note || ""),
        job.revision,
        ...chunks(JSON.stringify(w)),
    ];
}

export function writeCells(range, values) {
    const cells = values.map((value) => {
        if (value == null) return {};
        // stringValue is literal, including leading '=' in user notes.
        return {
            userEnteredValue: typeof value === "number" ? { numberValue: value } : { stringValue: value },
        };
    });
    return { updateCells: { range, rows: [{ values: cells }], fields: "userEnteredValue" } };
}

export function managedTab(spreadsheet, userId) {
    const sheets = spreadsheet.sheets ?? [];
    const managed = sheets.filter((sheet) => sheet.developerMetadata?.some((m) => m.metadataKey === ownerKey));
    const tab = managed[0];
    if (
        managed.length > 1 ||
        (tab && !tab.developerMetadata.some((m) => m.metadataKey === ownerKey && m.metadataValue === userId))
    ) {
        throw new Error("La hoja de registros pertenece a otra asignación.");
    }
    if (!tab && sheets.some((sheet) => sheet.properties.title === sheetTitle)) {
        throw new Error("Ya existe una pestaña Registro app sin la marca del exportador.");
    }

    return tab;
}

export function newTabRequests(sheetId, userId, rowCount = 100, columnCount = 43) {
    const first = {
        sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: headers.length,
    };
    return [
        {
            addSheet: {
                properties: {
                    sheetId,
                    title: sheetTitle,
                    gridProperties: { rowCount, columnCount, frozenRowCount: 1 },
                },
            },
        },
        {
            createDeveloperMetadata: {
                developerMetadata: {
                    metadataKey: ownerKey,
                    metadataValue: userId,
                    visibility: "DOCUMENT",
                    location: { sheetId },
                },
            },
        },
        writeCells(first, headers),
        {
            updateDimensionProperties: {
                range: { sheetId, dimension: "COLUMNS", startIndex: 9, endIndex: columnCount },
                properties: { hiddenByUser: true },
                fields: "hiddenByUser",
            },
        },
        {
            updateCells: {
                range: { ...first, startColumnIndex: 6, endColumnIndex: 9 },
                rows: [{
                    values: [
                        { note: "Una línea por ejercicio. Ejemplo: Sentadilla: ✓ 5 × 80 kg / ○ 4 × 85 kg" },
                        { note: "Nota general del entrenamiento. Las notas por ejercicio se conservan." },
                        {
                            note:
                                "En caso de conflicto, escribí usar app o usar hoja para elegir qué conservar.",
                        },
                    ],
                }],
                fields: "note",
            },
        },
    ];
}

// Every successful write replaces a named range in the SAME Google transaction as the cells.
// Its stable name rejects competing first writes, and deleting its old ID fences delayed writes.
export function sheetExportBatch(job, spreadsheet, delivery = {}) {
    const { revision, sheet_row: row, user_id: userId } = job;
    if (!Number.isSafeInteger(revision) || revision < 1 || !Number.isSafeInteger(row) || row < 2) {
        throw new Error("La cola devolvió una revisión o fila inválida.");
    }
    const tab = managedTab(spreadsheet, userId);
    const markerKey = createHash("sha256").update(JSON.stringify([userId, job.session_key])).digest("hex")
        .slice(0, 24);
    const name = `Gym_Registro_${markerKey}`;
    const marker = spreadsheet.namedRanges?.find((range) => range.name === name);
    const sheetId = tab?.properties.sheetId ?? randomInt(1, 2 ** 30);
    const previous = marker?.range;
    if (marker) {
        const id = marker.namedRangeId;
        const version = Number.parseInt(id.slice(markerKey.length), 16);
        if (
            !previous || previous.sheetId !== sheetId || previous.startRowIndex !== row - 1 ||
            !Number.isSafeInteger(version) || version < 1 || markerKey + version.toString(16) !== id
        ) {
            throw new Error("Cambió la ubicación o identidad del registro en Sheets.");
        }
        if (version > revision || (version === revision && !delivery.normalize)) return [];
    }
    const original = delivery.original?.baseline;
    const parts = original == null ? [] : chunks(JSON.stringify(original));
    const feedbackCells = parts.length > 1 ? ["chunks:" + parts.length, ...parts] : parts;
    const oldCount = /^chunks:(\d{1,2})$/.exec(delivery.expected?.[42] ?? "");
    const feedbackEnd = 42 + Math.max(1, feedbackCells.length, oldCount ? 1 + Number(oldCount[1]) : 0);
    const columnCount = Math.max(feedbackEnd, delivery.original?.shadowColumnCount ?? 0);
    const values = valuesFor(job);
    const range = {
        sheetId,
        startRowIndex: row - 1,
        endRowIndex: row,
        startColumnIndex: 0,
        endColumnIndex: values.length,
    };
    const requests = [];
    if (!tab) {
        requests.push(...newTabRequests(sheetId, userId, Math.max(row, 100), columnCount));
    } else {
        const grid = tab.properties.gridProperties;
        if (row > grid.rowCount) {
            requests.push({ appendDimension: { sheetId, dimension: "ROWS", length: row - grid.rowCount } });
        }
        if (grid.columnCount < columnCount) {
            requests.push(
                { appendDimension: { sheetId, dimension: "COLUMNS", length: columnCount - grid.columnCount } },
                {
                    updateDimensionProperties: {
                        range: { sheetId, dimension: "COLUMNS", startIndex: 9, endIndex: columnCount },
                        properties: { hiddenByUser: true },
                        fields: "hiddenByUser",
                    },
                },
            );
        }
    }
    // Snapshot any human edit arriving after the last read in the SAME atomic batch that replaces A:H.
    // A subsequent scan compares AA:AH (actual) with AI:AP (expected) before the next publication.
    if (delivery.expected) {
        const band = (start, end) => ({ ...range, startColumnIndex: start, endColumnIndex: end });
        requests.push(
            { copyPaste: { source: band(0, 8), destination: band(26, 34), pasteType: "PASTE_VALUES" } },
            writeCells(band(34, 42), delivery.expected.slice(0, 8)),
            writeCells(band(42, feedbackEnd), feedbackCells),
            ...(delivery.original?.requests ?? []),
            { updateCells: { range: band(8, 9), rows: [{ values: [{}] }], fields: "note" } },
        );
    }
    if (marker) requests.push({ deleteNamedRange: { namedRangeId: marker.namedRangeId } });
    requests.push(
        { addNamedRange: { namedRange: { name, namedRangeId: markerKey + revision.toString(16), range } } },
        writeCells(
            { ...range, endColumnIndex: Math.max(values.length, previous?.endColumnIndex ?? 0) },
            values,
        ),
    );
    return requests;
}

// Both the CLI and the Edge Function use the same Sheets v4 requests and OAuth client.
export function googleSheets(auth) {
    const options = { timeout: 25_000, retry: false };
    const url = (id) => "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(id);
    return {
        async read(id) {
            const response = await auth.request({
                ...options,
                url: url(id),
                method: "GET",
                params: {
                    fields:
                        "properties(title,timeZone),sheets(properties(sheetId,title,sheetType,gridProperties(rowCount,columnCount)),developerMetadata(metadataKey,metadataValue)),namedRanges(name,namedRangeId,range)",
                },
            });
            return response.data;
        },
        async readValues(id, ranges, render = "FORMATTED_VALUE") {
            if (!ranges.length) return [];
            const params = new URLSearchParams({
                valueRenderOption: render,
                dateTimeRenderOption: "SERIAL_NUMBER",
            });
            for (const range of ranges) params.append("ranges", range);
            const response = await auth.request({
                ...options,
                url: url(id) + "/values:batchGet?" + params,
                method: "GET",
            });
            return response.data.valueRanges ?? [];
        },
        async write(id, requests) {
            await auth.request({
                ...options,
                url: url(id) + ":batchUpdate",
                method: "POST",
                data: { requests },
            });
        },
    };
}
