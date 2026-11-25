import { manageSheet, appLink } from "./manage-sheet.mjs";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assignBlockPlan } from "./assign-block-plan.mjs";

const userId = "00000000-0000-4000-8000-000000000099";
const link = "https://docs.google.com/spreadsheets/d/fixture-id/edit?gid=1#gid=1";
const rows = [
    ["", "", "Semana 1"], ["Día 1","Movimiento","Esfuerzo","Series","Carga"],
    ["","Sentadilla","@7","3x4","90"], ["","","Nota:","Con pausa","★★☆"],
];
function fixtures(grid = rows) {
    const inserted = [];
    const client = { from(table) {
        assert.equal(table, "block_plans");
        return { async insert(data) { inserted.push(data); return { error: null }; } };
    } };
    const sheets = {
        async read(id) {
            assert.equal(id, "fixture-id");
            return { properties: { title: "Mi hoja" }, sheets: [{ properties: {
                sheetId: 25, title: "Ataque", gridProperties: { rowCount: 100, columnCount: 26 },
            } }] };
        },
        async readValues(id, ranges) {
            assert.equal(id, "fixture-id");
            assert.ok(ranges.every(range => range.startsWith("'Ataque'!")));
            return ranges.map(() => ({ values: grid }));
        },
    };
    return { inserted, client, sheets };
}

test("el enlace de Sheets asigna una rutina v4 completa con las posiciones de sincronización", async () => {
    const { inserted, client, sheets } = fixtures();
    const parsed = await assignBlockPlan([userId, link],client,() => sheets);
    assert.deepEqual(inserted, [{ user_id: userId, auth_user_id: userId, spreadsheet_id: "fixture-id", routine: parsed }]);
    assert.equal(parsed.properties.title, "Mi hoja");
    assert.equal(parsed.spreadsheetId, "fixture-id");
    assert.equal(parsed.blocks[0].sourceSheetId,25);
    const day = parsed.blocks[0].weeks[0].days[0];
    assert.equal(day.exercises[0].name, "Sentadilla");
    assert.equal(day.exercises[0].sourceRow,3);
    assert.equal(day.rating,2);
    assert.equal(day.sheetFeedback.rowIndex,3);
});

test("una hoja sin rutina y una hoja inaccesible se pueden corregir antes de asignar", async () => {
    const { inserted, client, sheets } = fixtures([["Otro documento"]]);
    await assert.rejects(assignBlockPlan([userId,"--sheet","fixture-id"],client,() => sheets), /bloque de Rutina Gym v4/);
    sheets.read = async () => { throw Object.assign(new Error("Forbidden"), { response: { status: 403 } }); };
    await assert.rejects(assignBlockPlan([userId,link],client,() => sheets), /compartila como editora/);
    assert.equal(inserted.length,0);
});

test("una hoja de otro atleta y un enlace de otro sitio se rechazan", async () => {
    const { inserted, client, sheets } = fixtures();
    const read = sheets.read.bind(sheets);
    sheets.read = async id => {
        const meta = await read(id);
        meta.sheets.push({ properties: { title: "Registro app", sheetId: 99 },
            developerMetadata: [{ metadataKey: "gym_tracker_block_workouts_v1", metadataValue: "otro-atleta" }] });
        return meta;
    };
    await assert.rejects(assignBlockPlan([userId,link],client,() => sheets), /pertenece a otra asignación/);
    await assert.rejects(assignBlockPlan([userId,"https://example.org/d/fixture-id"],client,() => sheets), /enlace de edición/);
    assert.equal(inserted.length,0);
});

test("se conserva el alta por JSON, con destino opcional, sin acceder a Google", async () => {
    const { inserted, client, sheets } = fixtures();
    const source = await assignBlockPlan([userId,link],client,() => sheets);
    const tmp = await mkdtemp(path.join(tmpdir(),"block-assignment-"));
    try {
        const file = path.join(tmp,"rutina.json");
        await writeFile(file,JSON.stringify(source));
        const unused = () => { throw new Error("No se esperaba una conexión a Google"); };
        await assignBlockPlan([userId,file],client,unused);
        await assignBlockPlan([userId,file,"replica"],client,unused);
        assert.deepEqual(inserted.slice(1).map(row => row.spreadsheet_id),[null,"replica"]);
    } finally { await rm(tmp, { recursive: true, force: true }); }
});

test("el administrador asigna sólo con la hoja y recupera el mismo enlace sin una cuenta de atleta", async () => {
    const { sheets } = fixtures();
    let assigned;
    let imports = 0;
    const token = "9".repeat(64);
    const client = {
        from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: assigned ?? null }) }) }),
            insert: async row => { assigned = row; return { error: null }; },
        }),
        rpc: async (fn, args) => {
            assert.equal(fn,"manage_block_plan_link");
            assert.deepEqual(args,{ p_sheet: "fixture-id", p_action: "open" });
            return { data: token };
        },
    };
    const read = () => { imports++; return sheets; };
    assert.equal(await manageSheet(client,link,"open",read),token);
    assert.equal(await manageSheet(client,link,"open",read),token);
    assert.equal(imports,1);
    assert.equal(assigned.auth_user_id,undefined);
    assert.equal(assigned.routine.blocks.length,1);
    assert.equal(appLink("https://ejemplo.test",token), "https://ejemplo.test/bloques#rutina="+token);
    assert.throws(() => appLink("https://user:pass@ejemplo.test",token));
});
