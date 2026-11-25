import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";
import { build, preview } from "vite";

const devices = new Map();
let api, fixtureServer;
const athleteA = "aaaaaaaa-1111-4711-8171-111111111111";
const athleteB = "bbbbbbbb-1111-4711-8171-111111111111";
const planId = "cccccccc-1111-4711-8171-111111111111";
const sessionKey = JSON.stringify(["test", 1, 1]);
const routine = {
  blocks: [{ id: "test", name: "Bloque A", startDate: "", weeks: [{ number: 1, days: [{
    number: 1, rating: null, note: "", exercises: [
      { id: "lift", name: "Banca", prescription: "2x5", effort: "", load: "75" },
    ],
  }] }] }],
  properties: { title: "Plan de prueba" }, rpe: { columns: [], rows: [] }, activation: [], catalog: [],
};

let browser, server, output, origin;
before(async () => {
  fixtureServer = createServer((req, res) => {
    handleApi(req, res).catch(error => { res.writeHead(500); res.end(JSON.stringify({ message: error.message })); });
  });
  await new Promise(resolve => fixtureServer.listen(0, "127.0.0.1", resolve));
  api = "http://127.0.0.1:" + fixtureServer.address().port;
  output = await mkdtemp(join(tmpdir(), "gym-blocks-e2e-"));
  await build({
    mode: "e2e", logLevel: "error", build: { outDir: output },
    define: {
      "import.meta.env.VITE_BLOCKS_CLOUD": JSON.stringify("true"),
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(api),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY": JSON.stringify("sb_publishable_fixture"),
    },
  });
  server = await preview({ logLevel: "error", build: { outDir: output }, preview: { host: "127.0.0.1", port: 0 } });
  origin = "http://127.0.0.1:" + server.httpServer.address().port;
  browser = process.env.E2E_BROWSER === "webkit" ? await webkit.launch()
    : await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL });
});
after(async () => {
  await browser?.close();
  if (fixtureServer) await new Promise(resolve => fixtureServer.close(resolve));
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  if (output) await rm(output, { recursive: true, force: true });
});

const shareTokens = { alicia: "a".repeat(64), bruno: "b".repeat(64) };

// A real loopback transport lets Safari exercise service workers and CORS normally.
async function handleApi(req, res) {
  res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
  const respond = (data, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  if (req.method === "OPTIONS") return respond({});
  const profile = devices.get(req.headers["user-agent"]);
  if (!profile) return respond({ message: "Dispositivo de prueba desconocido" }, 400);
  const { deviceState, database } = profile;
  if (deviceState.disconnected) return req.socket.destroy();
  const { pathname, searchParams } = new URL(req.url, api);
  let payload = "";
  for await (const part of req) payload += part;
  const token = req.headers["x-gym-routine"];
  const id = token === shareTokens.alicia ? athleteA : token === shareTokens.bruno ? athleteB : null;
  if (deviceState.stallNext === pathname) {
    deviceState.stallNext = undefined;
    // Leave even the response body unfinished, as can happen when switching networks.
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(" ");
    return;
  }
  if (pathname.startsWith("/auth/")) throw new Error("Una rutina compartida no debe iniciar sesión");
  if (pathname === "/rest/v1/block_plans" && id === athleteB && deviceState.openGate) {
    deviceState.waitingForPlan = true;
    await deviceState.openGate;
  }
  if (pathname === "/rest/v1/block_plans") return respond(id ? [{ user_id: id, plan_id: planId, plan_revision: deviceState.planRevision, routine: deviceState.routines?.[id] ?? deviceState.routine }] : []);
  if (!id) return respond({ code: "42501", message: "Enlace inválido" }, 403);
  if (pathname === "/rest/v1/block_sheet_conflicts") return respond(deviceState.sheetProblems);
  if (pathname === "/rest/v1/block_workouts") {
    const filter = searchParams.get("session_key");
    const rows = [...database].filter(([owner]) => owner === id || owner.startsWith(id + ":")).map(([, row]) => row)
      .filter(row => !filter || filter === "eq." + row.session_key);
    return respond(req.headers.accept?.includes("vnd.pgrst.object") ? rows[0] : rows);
  }
  if (pathname === "/rest/v1/rpc/save_linked_block_workout") {
    const { p_session_key, p_workout, p_expected_revision, p_plan_id } = JSON.parse(payload);
    if (deviceState.rejectNote && p_workout.exerciseNotes?.lift === deviceState.rejectNote) {
      deviceState.rejections = (deviceState.rejections ?? 0) + 1;
      return respond({ code: "22023", message: "Invalid workout" }, 400);
    }
    assert.equal(p_plan_id, planId);
    const [blockId, weekNumber, dayNumber] = JSON.parse(p_session_key);
    const block = deviceState.routine.blocks.find(b => b.id === blockId);
    assert.ok(block?.weeks.find(w => w.number === weekNumber)?.days.some(d => d.number === dayNumber));
    const recordKey = p_session_key === sessionKey ? id : id + ":" + p_session_key;
    if (deviceState.writeGate) {
      deviceState.waitingToWrite = true;
      await deviceState.writeGate;
    }
    const previous = database.get(recordKey);
    if (previous && JSON.stringify(previous.workout) === JSON.stringify(p_workout)) return respond(previous.revision);
    if ((previous?.revision ?? 0) !== p_expected_revision) {
      if (deviceState.stallOnConflict) return;
      return respond({ code: "40001", message: "Revisión distinta" }, 409);
    }
    const revision = (previous?.revision ?? 0) + 1;
    database.set(recordKey, { session_key: p_session_key, revision, workout: p_workout });
    if (deviceState.dropNextAck) {
      deviceState.dropNextAck = false;
      return req.socket.destroy();
    }
    return respond(revision);
  }
  return respond({ message: "Ruta desconocida" }, 404);
}

async function device(database) {
  const userAgent = "GymTrackerE2E/" + (devices.size + 1);
  const deviceState = { disconnected: false, dropNextAck: false, sheetProblems: [], planRevision: 1, routine };
  devices.set(userAgent, { deviceState, database });
  const context = await browser.newContext({ userAgent, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  const note = page.getByRole("textbox", { name: "Nota del ejercicio", exact: true });
  const edit = () => page.getByRole("button", { name: /^Editar Banca/ }).click();
  async function openLink(name) {
    await page.goto(origin + "/bloques#rutina=" + shareTokens[name]);
    try { await edit(); }
    catch (error) { throw new Error("No abrió la rutina. " + await page.locator("body").innerText() + " " + pageErrors.join(", "), { cause: error }); }
  }
  return { context, page, edit, note, openLink, deviceState, pageErrors };
}

async function waitFor(check, message, timeout = 10_000) {
  const end = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() >= end) assert.fail(message);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function localSaveAcknowledged(page) {
  await waitFor(() => page.evaluate(async ({ scope, key }) => {
    const db = await new Promise(resolve => {
      const open = indexedDB.open("gym-block-workouts-v1");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => resolve(null);
    });
    if (!db) return false;
    try {
      return await new Promise(resolve => {
        const request = db.transaction("sessions").objectStore("sessions").get([scope, key]);
        request.onsuccess = () => resolve(request.result?.pending === false);
        request.onerror = () => resolve(false);
      });
    } finally { db.close(); }
  }, { scope: "gym:blocks:" + api + ":" + athleteA + ":" + planId, key: sessionKey }), "No llegó la confirmación a IndexedDB");
}

test("dos dispositivos conservan las dos versiones hasta elegir cómo resolver el conflicto", async t => {
  const db = new Map();
  const a = await device(db);
  const b = await device(db);
  t.after(() => Promise.all([a.context.close(), b.context.close()]));
  await Promise.all([a.openLink("alicia"), b.openLink("alicia")]);
  for (const keepLocal of [false, true]) {
    const original = "Desde A " + keepLocal;
    const later = "Desde B " + keepLocal;
    await b.context.setOffline(true);
    await b.note.fill(later);
    await a.note.fill(original);
    await waitFor(() => db.get(athleteA)?.workout.exerciseNotes?.lift === original, "Falta el cambio de A");
    b.deviceState.stallNext = "/rest/v1/rpc/save_linked_block_workout";
    await b.context.setOffline(false);
    await b.page.evaluate(() => window.dispatchEvent(new Event("online")));
    const choose = b.page.getByRole("radio", { name: keepLocal ? /^Este dispositivo/ : /^Sincronizado/ });
    await choose.waitFor();
    // The revision read on reconnect is enough. Do not send a write already known to be stale.
    assert.equal(b.deviceState.stallNext, "/rest/v1/rpc/save_linked_block_workout");
    b.deviceState.stallNext = undefined;
    assert.equal(await b.note.inputValue(), later);
    assert.equal(db.get(athleteA).workout.exerciseNotes.lift, original);
    await choose.check();
    await b.page.getByRole("button", { name: "Guardar selección" }).click();
    const expected = keepLocal ? later : original;
    await waitFor(() => db.get(athleteA).workout.exerciseNotes.lift === expected, "Se guardó la versión equivocada");
    await b.page.waitForFunction(value => document.querySelector("textarea")?.value === value, expected);
  }
  assert.equal(db.get(athleteA).revision, 3);
});

test("dos pestañas editan campos distintos de una sesión sin pisarse", async t => {
  const db = new Map();
  const a = await device(db);
  t.after(() => a.context.close());
  await a.openLink("alicia");
  const other = await a.context.newPage();
  await other.goto(origin + "/bloques");
  await other.getByRole("button", { name: /^Editar Banca/ }).click();
  await Promise.all([
    a.note.fill("Desde la primera pestaña"),
    other.getByRole("textbox", { name: "Carga, serie 1", exact: true }).fill("82,5"),
  ]);
  await waitFor(() => {
    const w = db.get(athleteA)?.workout;
    return w?.exerciseNotes?.lift === "Desde la primera pestaña" && w.sets.lift?.[0].kg === "82,5";
  }, "Se perdió una edición simultánea");
  await a.page.reload();
  await a.edit();
  assert.equal(await a.note.inputValue(), "Desde la primera pestaña");
  assert.equal(await a.page.getByRole("textbox", { name: "Carga, serie 1", exact: true }).inputValue(), "82,5");
});

test("dos envíos simultáneos conservan ambos borradores aunque la respuesta del conflicto no llegue", async t => {
  const db = new Map();
  const [a, b] = await Promise.all([device(db), device(db)]);
  t.after(() => Promise.all([a.context.close(), b.context.close()]));
  await Promise.all([a.openLink("alicia"), b.openLink("alicia")]);
  const gate = Promise.withResolvers();
  t.after(() => gate.resolve());
  for (const client of [a, b]) {
    client.deviceState.writeGate = gate.promise;
    client.deviceState.stallOnConflict = true;
  }
  await Promise.all([a.note.fill("Borrador A"), b.note.fill("Borrador B")]);
  await waitFor(() => a.deviceState.waitingToWrite && b.deviceState.waitingToWrite, "Los dos envíos no llegaron al servidor");
  gate.resolve();
  await waitFor(() => db.has(athleteA), "Falta el primer guardado");
  const saved = db.get(athleteA).workout.exerciseNotes.lift;
  const losing = saved === "Borrador A" ? b : a;
  const choose = losing.page.getByRole("radio", { name: /^Este dispositivo/ });
  await choose.waitFor({ timeout: 24_000 });
  assert.notEqual(await losing.note.inputValue(), saved);
  await choose.check();
  await losing.page.getByRole("button", { name: "Guardar selección" }).click();
  await waitFor(() => db.get(athleteA).revision === 2, "No se guardó la elección");
  assert.equal(db.get(athleteA).workout.exerciseNotes.lift, await losing.note.inputValue());
});

test("si el navegador rechaza la copia sin conexión del plan, la sesión sigue funcionando en línea", async t => {
  const db = new Map();
  const screen = await device(db);
  t.after(() => screen.context.close());
  await screen.page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key.startsWith("gym:blocks:") && !key.endsWith(":sheet-link"))
        throw new DOMException("Almacenamiento lleno", "QuotaExceededError");
      return set.call(this, key, value);
    };
  });
  await screen.openLink("alicia");
  await screen.page.getByText(/Espacio insuficiente para guardar una copia del plan|No se pudo guardar una copia del plan/).waitFor();
  await screen.note.fill("Registrada en línea");
  await waitFor(() => db.get(athleteA)?.workout.exerciseNotes?.lift === "Registrada en línea", "Se bloqueó una sesión en línea");
});

test("una sesión rechazada se puede corregir sin perder la nota ni repetir la solicitud inválida", async t => {
  const db = new Map();
  const screen = await device(db);
  t.after(() => screen.context.close());
  await screen.openLink("alicia");
  screen.deviceState.rejectNote = "Borrador rechazado";
  await screen.note.fill(screen.deviceState.rejectNote);
  await waitFor(() => screen.deviceState.rejections > 0, "La prueba no llegó a la validación");
  await screen.page.getByText(/Revisá los datos de la sesión/).first().waitFor();
  await screen.page.reload();
  await screen.edit();
  assert.equal(await screen.note.inputValue(), screen.deviceState.rejectNote);
  assert.equal(db.size, 0);
  await screen.note.fill("Corregida");
  await waitFor(() => db.get(athleteA)?.workout.exerciseNotes?.lift === "Corregida", "Quedó atascado el envío anterior");
  assert.equal(screen.deviceState.rejections, 1);
});

test("la primera apertura y el guardado se recuperan de una respuesta que queda a medias", async t => {
  const db = new Map();
  const screen = await device(db);
  t.after(() => screen.context.close());
  screen.deviceState.stallNext = "/rest/v1/block_plans";
  await screen.page.goto(origin + "/bloques#rutina=" + shareTokens.alicia);
  const retry = screen.page.getByRole("button", { name: "Volver a intentar" });
  await retry.waitFor({ timeout: 21_000 });
  await retry.click();
  await screen.edit();
  screen.deviceState.stallNext = "/rest/v1/rpc/save_linked_block_workout";
  await screen.note.fill("Durante una demora");
  await waitFor(() => !screen.deviceState.stallNext, "No se inició el guardado");
  await screen.note.fill("Última edición");
  await waitFor(() => db.get(athleteA)?.workout.exerciseNotes?.lift === "Última edición", "No se recuperó la última edición", 25_000);
  assert.equal(db.get(athleteA).revision, 2);
});

test("la carga y las repeticiones inválidas no completan una serie y se pueden corregir", async t => {
  const db = new Map();
  const screen = await device(db);
  t.after(() => screen.context.close());
  await screen.openLink("alicia");
  const reps = screen.page.getByRole("textbox", { name: "Reps, serie 1", exact: true });
  const kg = screen.page.getByRole("textbox", { name: "Carga, serie 1", exact: true });
  const check = screen.page.getByRole("checkbox", { name: "Serie 1 hecha", exact: true });
  for (const value of ["Las Heras, Mendoza", "-,,,,,7", "-3", "0", "2e3"]) {
    await reps.fill(value);
    assert.equal(await reps.inputValue(), "5");
  }
  await kg.fill("-10");
  assert.equal(await kg.inputValue(), "75");
  assert.equal(db.has(athleteA), false);
  await reps.fill("");
  await check.click();
  assert.equal(await check.isChecked(), false);
  assert.equal(await reps.getAttribute("aria-invalid"), "true");
  await reps.fill("5");
  await kg.fill("72,");
  await check.click();
  assert.equal(await check.isChecked(), false);
  assert.equal(await kg.getAttribute("aria-invalid"), "true");
  await kg.fill("82,5");
  await check.check();
  await waitFor(() => db.get(athleteA)?.workout.sets?.lift?.[0]?.confirmed, "Falta la confirmación válida");
  assert.equal(db.get(athleteA).workout.sets.lift[0].kg, "82,5");
});

test("un enlace abre en dos dispositivos, guarda sin red y aísla las rutinas al cambiar de hoja", async t => {
  const db = new Map();
  const first = await device(db);
  const second = await device(db);
  t.after(async () => { await Promise.all([first.context.close(), second.context.close()]); });
  await first.openLink("alicia");
  const reps = first.page.getByRole("textbox", { name: "Reps, serie 1", exact: true });
  assert.equal(await reps.inputValue(), "5");
  await reps.fill("6");
  await first.page.getByRole("checkbox", { name: "Serie 1 hecha", exact: true }).check();
  await first.note.fill("Registro en la nube");
  const saved = text => db.get(athleteA)?.workout.exerciseNotes?.lift === text;
  await waitFor(() => saved("Registro en la nube"), "No se guardó el primer entrenamiento");
  assert.equal(db.get(athleteA).workout.sets.lift[0].confirmed, true);
  assert.equal(db.get(athleteA).workout.sets.lift[0].reps, "6");

  await second.openLink("alicia");
  assert.equal(await second.note.inputValue(), "Registro en la nube");
  await first.page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await first.page.waitForFunction(() => !!navigator.serviceWorker.controller);
  first.deviceState.disconnected = true;
  await first.context.setOffline(true);
  await first.note.fill("Edición sin red");
  await first.page.reload();
  await first.edit();
  assert.equal(await first.note.inputValue(), "Edición sin red");

  await second.note.fill("Cambio desde otro dispositivo");
  await waitFor(() => saved("Cambio desde otro dispositivo"), "El segundo dispositivo no guardó");
  first.deviceState.disconnected = false;
  await first.context.setOffline(false);
  await first.page.getByRole("radio", { name: /^Sincronizado/ }).waitFor();
  assert.equal(await first.note.inputValue(), "Edición sin red");
  assert.ok(saved("Cambio desde otro dispositivo"));
  await first.page.getByRole("radio", { name: /^Este dispositivo/ }).check();
  await first.page.getByRole("button", { name: "Guardar selección" }).click();
  await waitFor(() => saved("Edición sin red"), "No se aplicó la resolución elegida");

  const revision = db.get(athleteA).revision;
  first.deviceState.dropNextAck = true;
  await first.note.fill("Respuesta perdida");
  await waitFor(() => saved("Respuesta perdida"), "La operación no llegó a la base simulada");
  first.deviceState.disconnected = true;
  await first.note.fill("Edición posterior");
  await first.page.reload();
  await first.edit();
  assert.equal(await first.note.inputValue(), "Edición posterior");
  first.deviceState.disconnected = false;
  await first.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await waitFor(() => saved("Edición posterior"), "La recuperación dejó un cambio pendiente");
  assert.equal(db.get(athleteA).revision, revision + 2);

  await first.page.goto(origin + "/bloques#rutina=" + "c".repeat(64));
  await first.page.getByText(/Este enlace ya no está activo/).waitFor();
  assert.equal(await first.page.getByRole("navigation", { name: "Navegación principal" }).count(), 0);
  await first.openLink("bruno");
  assert.equal(await first.note.inputValue(), "");
  assert.equal(await reps.inputValue(), "5");
  await first.note.fill("Registro de Bruno");
  await waitFor(() => db.get(athleteB)?.workout.exerciseNotes?.lift === "Registro de Bruno", "No se guardó en la rutina correcta");
  assert.ok(saved("Edición posterior"));
  assert.deepEqual([...first.pageErrors, ...second.pageErrors], []);
});

test("una edición de Sheets actualiza el entrenamiento abierto y muestra un conflicto contextual", async t => {
  const db = new Map();
  const screen = await device(db);
  t.after(() => screen.context.close());
  // Install before mounting so the app's actual foreground timer runs without a 30 second test delay.
  await screen.page.clock.install();
  await screen.openLink("alicia");
  await screen.note.fill("Primera nota");
  await waitFor(() => db.get(athleteA)?.workout.exerciseNotes?.lift === "Primera nota", "Falta la sesión inicial");
  await localSaveAcknowledged(screen.page);
  const row = db.get(athleteA);
  const workout = { ...row.workout, exerciseNotes: { lift: "Revisión de Sheets" }, note: "Banca: Revisión de Sheets" };
  db.set(athleteA, { ...row, revision: row.revision + 1, workout });
  const nextPlan = structuredClone(routine);
  nextPlan.blocks[0].weeks[0].days[0].note = "Instrucción del plan actualizada";
  screen.deviceState.routine = nextPlan;
  screen.deviceState.planRevision++;
  screen.deviceState.sheetProblems = [{ session_key: sessionKey, reason: "Revisá la nota de esta sesión", sheet_row: 2 }];
  await screen.page.clock.fastForward(31_000);
  await screen.page.getByText("Instrucción del plan actualizada", { exact: true }).waitFor();
  await screen.page.getByText("Revisá la nota de esta sesión", { exact: false }).waitFor();
  assert.equal(await screen.note.inputValue(), "Revisión de Sheets");
  assert.deepEqual(screen.pageErrors, []);
});

test("el Dock conserva el punto de agarre y confirma la pestaña resaltada al soltar", async t => {
  const screen = await device(new Map());
  t.after(() => screen.context.close());
  await screen.openLink("alicia");
  const { page } = screen;
  const dock = page.getByRole("navigation", { name: "Navegación principal" });
  const box = await dock.getByRole("link", { name: "Rutina" }).boundingBox();
  const startX = box.x + box.width - 5;
  const y = box.y + box.height / 2;
  const highlighted = dock.locator("a[data-highlighted]");
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + 10, y, { steps: 5 });
  assert.equal(await highlighted.innerText(), "Rutina");
  await page.mouse.move(startX + box.width / 2 + 5, y, { steps: 10 });
  assert.equal(await highlighted.innerText(), "Progreso");
  // A small reversal at the midpoint shouldn't toggle the preview back.
  await page.mouse.move(startX + box.width / 2 - 1, y, { steps: 5 });
  assert.equal(await highlighted.innerText(), "Progreso");
  assert.equal(new URL(page.url()).pathname, "/bloques");
  await page.mouse.up();
  await page.waitForURL(origin + "/bloques/historial");
  await dock.getByRole("link", { name: "Progreso" }).and(dock.locator("a[aria-current='page']")).waitFor();
});

test("pegar varias celdas no concatena sus valores y las notas admiten varias líneas", async t => {
  const db = new Map();
  const s = await device(db);
  t.after(() => s.context.close());
  await s.openLink("alicia");
  for (const [label, text] of [["Reps", "5\n6"], ["Carga", "72,5\t8"]]) {
    const field = s.page.getByRole("textbox", { name: label + ", serie 1", exact: true });
    const original = await field.inputValue();
    const blocked = await field.evaluate((input, value) => {
      // An isolated paste event avoids replacing the user's system clipboard.
      const data = new DataTransfer();
      data.setData("text/plain", value);
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: data });
      return !input.dispatchEvent(event);
    }, text);
    assert.equal(blocked, true);
    assert.equal(await field.inputValue(), original);
    await s.page.getByText(/Pegá un solo valor/).waitFor();
    await field.fill("8");
    await s.page.getByText(/Pegá un solo valor/).waitFor({ state: "hidden" });
  }
  const note = "Banca con pausa 💪\n肩の調子\n" + "Última serie. ".repeat(800);
  await s.note.fill(note);
  await waitFor(() => db.get(athleteA)?.workout.exerciseNotes?.lift === note, "Se perdió el texto pegado");
  await s.page.reload(); await s.edit();
  assert.equal(await s.note.inputValue(), note);
  assert.deepEqual(s.pageErrors, []);
});

test("escribir rápido, corregir en el medio y salir conserva el último texto", async t => {
  const db = new Map();
  const s = await device(db);
  t.after(() => s.context.close());
  await s.openLink("alicia");
  await s.note.pressSequentially("pausa 4 seg");
  for (let i = 0; i < 4; i++) await s.note.press("ArrowLeft");
  await s.note.press("Backspace");
  await s.page.keyboard.insertText("2");
  assert.equal(await s.note.inputValue(), "pausa 2 seg");
  await s.edit();
  await waitFor(() => db.get(athleteA)?.workout.exerciseNotes?.lift === "pausa 2 seg", "Se perdió la corrección");
  await s.edit(); await s.note.fill("");
  await waitFor(() => !db.get(athleteA)?.workout.exerciseNotes?.lift && db.get(athleteA)?.workout.note === "", "Volvió una nota borrada");
  await s.page.reload(); await s.edit();
  assert.equal(await s.note.inputValue(), "");
  assert.deepEqual(s.pageErrors, []);
});

test("el selector devuelve el foco al lápiz con Escape y una búsqueda sin resultados se recupera", async t => {
  const s = await device(new Map());
  t.after(() => s.context.close());
  await s.openLink("alicia");
  const pencil = s.page.getByRole("button", { name: "Cambiar plantilla" });
  await pencil.click();
  const field = s.page.getByRole("textbox", { name: "Enlace de la plantilla" });
  await field.fill("cambio descartado");
  await field.press("Escape");
  assert.equal(await s.page.getByRole("dialog").count(), 0);
  assert.equal(await pencil.evaluate(el => el === document.activeElement), true);
  await s.page.getByRole("heading", { name: "Plan de prueba", exact: true }).waitFor();
  await s.page.getByRole("link", { name: "Progreso", exact: true }).click();
  await s.page.getByRole("link", { name: "Cargas", exact: true }).click();
  await s.page.locator(".movement-trigger").click();
  const search = s.page.getByRole("combobox");
  await search.fill("zzz💪 []"); await search.press("ArrowDown"); await search.press("Enter");
  await s.page.getByText(/Sin coincidencias/).waitFor();
  await search.fill("  BÁNCA  "); await search.press("Enter");
  await search.waitFor({ state: "hidden" });
  assert.deepEqual(s.pageErrors, []);
});

test("marcar series en el celular mantiene el editor y su posición durante el autoguardado", async t => {
  const db = new Map();
  const s = await device(db);
  const gate = Promise.withResolvers();
  t.after(async () => { gate.resolve(); await s.context.close(); });
  const plan = structuredClone(routine);
  const exercises = plan.blocks[0].weeks[0].days[0].exercises;
  const lift = exercises[0];
  const extras = Array.from({ length: 18 }, (_, i) => ({ ...lift, name: "Auxiliar " + i, id: "aux" + i }));
  exercises.splice(0, 1, ...extras.slice(0, 9), lift, ...extras.slice(9));
  s.deviceState.routine = plan;
  const loaded = s.page.waitForResponse(r => r.url().includes("/block_sheet_conflicts"));
  await s.openLink("alicia"); await loaded;
  const check = i => s.page.getByRole("checkbox", { name: "Serie " + i + " hecha", exact: true });
  await s.page.waitForFunction(() => {
    const panel = document.querySelector(".editor-reveal");
    return panel && getComputedStyle(panel).opacity === "1" && Math.abs(panel.clientHeight - panel.scrollHeight) <= 1;
  });
  await check(1).evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const original = await check(1).elementHandle();
  const position = () => original.evaluate(el => ({
    connected: el.isConnected, top: Math.round(el.getBoundingClientRect().top), scroll: Math.round(scrollY),
    expanded: el.closest(".editor-row")?.previousElementSibling.querySelector(".edit-exercise")?.getAttribute("aria-expanded"),
  }));
  const before = await position();
  assert.ok(before.scroll > 0);
  let documents = 0, writes = 0;
  s.page.on("request", r => {
    if (r.isNavigationRequest()) documents++;
    if (r.url().includes("/rpc/save_linked_block_workout")) writes++;
  });
  await s.page.evaluate(() => {
    const getAll = IDBIndex.prototype.getAll;
    window.historyScans = 0;
    IDBIndex.prototype.getAll = function (...args) {
      if (this.name === "scope") window.historyScans++;
      return getAll.apply(this, args);
    };
  });
  s.deviceState.writeGate = gate.promise;
  await check(1).tap();
  assert.equal(await check(1).isChecked(), true);
  assert.deepEqual(await position(), before, "La primera marca desplazó la lista");
  await check(2).tap();
  await waitFor(() => s.deviceState.waitingToWrite, "El lote no se envió");
  assert.deepEqual(await position(), before, "El envío movió o reemplazó el editor");
  assert.equal(await s.page.evaluate(() => window.historyScans), 0, "Cada marca volvió a leer todo el historial");
  assert.equal(await s.page.getByText("Cambios pendientes", { exact: true }).count(), 0);
  gate.resolve();
  await waitFor(() => db.get(athleteA)?.workout.sets.lift.filter(row => row.confirmed).length === 2, "Falta una serie");
  await localSaveAcknowledged(s.page);
  assert.deepEqual(await position(), before, "La confirmación desplazó el ejercicio");
  assert.equal(await s.page.evaluate(() => window.historyScans), 0, "La confirmación releyó todo el historial");
  assert.equal(writes, 1);
  assert.equal(documents, 0);
  await s.page.reload(); await s.edit();
  assert.equal(await check(1).isChecked(), true);
  assert.equal(await check(2).isChecked(), true);
});

test("completar y deshacer el ejercicio conserva la serie manual mientras el envío está en curso", async t => {
  const db = new Map();
  const s = await device(db);
  const gate = Promise.withResolvers();
  t.after(async () => { gate.resolve(); await s.context.close(); });
  await s.openLink("alicia");
  s.deviceState.writeGate = gate.promise;
  const first = s.page.getByRole("checkbox", { name: "Serie 1 hecha", exact: true });
  const second = s.page.getByRole("checkbox", { name: "Serie 2 hecha", exact: true });
  const bulk = s.page.getByRole("checkbox", { name: /^Completado: Banca/ });
  await first.tap();
  await waitFor(() => s.deviceState.waitingToWrite, "El servidor no recibió la primera marca");
  await bulk.tap();
  assert.equal(await second.isChecked(), true);
  assert.equal(await s.note.isEnabled(), true);
  await bulk.tap();
  assert.equal(await first.isChecked(), true);
  assert.equal(await second.isChecked(), false);
  await s.note.fill("Quedó la primera");
  await s.note.evaluate(el => el.setSelectionRange(2, 4));
  gate.resolve();
  await waitFor(() => db.get(athleteA)?.workout.exerciseNotes?.lift === "Quedó la primera", "No se recibió la última edición");
  await localSaveAcknowledged(s.page);
  const workout = db.get(athleteA).workout;
  assert.deepEqual(workout.sets.lift.map(set => set.confirmed), [true]);
  assert.equal(workout.finishedAt, undefined);
  assert.equal(await s.note.inputValue(), "Quedó la primera");
  assert.deepEqual(await s.note.evaluate(el => [document.activeElement === el, el.selectionStart, el.selectionEnd]), [true, 2, 4]);
});

test("al volver la conexión se envían las series de ambos días y se conserva el día abierto", async t => {
  const db = new Map();
  const s = await device(db);
  t.after(() => s.context.close());
  const plan = structuredClone(routine);
  const days = plan.blocks[0].weeks[0].days;
  days.push({ ...structuredClone(days[0]), number: 2 });
  s.deviceState.routine = plan;
  await s.openLink("alicia");
  await s.context.setOffline(true);
  const set = i => s.page.getByRole("checkbox", { name: "Serie " + i + " hecha", exact: true });
  await set(1).tap();
  await s.page.getByRole("button", { name: /Día 1/ }).click();
  await s.page.getByRole("menuitemradio", { name: "Día 2" }).click();
  await s.edit();
  await set(2).tap();
  assert.equal(db.size, 0);
  await s.context.setOffline(false);
  await s.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await waitFor(() => db.size === 2, "Quedó un día sin enviar");
  const byDay = [...db.values()].sort((a, b) => a.session_key.localeCompare(b.session_key));
  assert.deepEqual(byDay.map(row => row.workout.sets.lift.map(s => !!s.confirmed)), [[true], [false, true]]);
  assert.equal(await set(1).isChecked(), false);
  assert.equal(await set(2).isChecked(), true);
  assert.equal(await s.page.getByRole("button", { name: /Día 2/ }).isVisible(), true);
});

test("dos navegadores marcan series distintas del mismo ejercicio sin pedir una versión", async t => {
  const db = new Map();
  const [a,b] = await Promise.all([device(db), device(db)]);
  t.after(() => Promise.all([a.context.close(), b.context.close()]));
  await Promise.all([a.openLink("alicia"), b.openLink("alicia")]);
  const mark = (client, n) => client.page.getByRole("checkbox", { name: "Serie " + n + " hecha", exact: true });
  b.deviceState.disconnected = true;
  await b.context.setOffline(true);
  await mark(b, 2).check();
  await mark(a, 1).check();
  await waitFor(() => db.get(athleteA)?.workout.sets.lift[0]?.confirmed, "Falta la primera serie");
  await localSaveAcknowledged(a.page);
  assert.deepEqual(db.get(athleteA).workout.sets.lift.map(set => set.confirmed), [true]);
  b.deviceState.disconnected = false;
  await b.context.setOffline(false);
  await b.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await waitFor(() => db.get(athleteA)?.workout.sets.lift.filter(set => set.confirmed).length === 2, "Se frenaron dos series compatibles");
  await localSaveAcknowledged(b.page);
  assert.ok(db.get(athleteA).workout.finishedAt);
  await b.page.waitForFunction(() => [...document.querySelectorAll(".set-toggle input")].every(input => input.checked), null, { timeout: 3000 });
  assert.equal(await mark(b, 1).isChecked(), true);
  assert.equal(await mark(b, 2).isChecked(), true);
});

test("un conflicto guardado por la versión anterior permite comparar y conservar un valor de cada copia", async t => {
  const db = new Map();
  const base = { startedAt: "2026-11-24T14:00:00Z", sets: {}, rating: 1, note: "" };
  const local = { ...base, note: "Banca: Nota del celu", exerciseNotes: { lift: "Nota del celu" } };
  const remote = { ...base, rating: 3, note: "Banca: Nota sincronizada", exerciseNotes: { lift: "Nota sincronizada" } };
  db.set(athleteA, { session_key: sessionKey, revision: 4, workout: remote });
  const s = await device(db);
  t.after(() => s.context.close());
  await s.openLink("alicia");
  await s.page.evaluate(async ({ scope, key, local, remote }) => {
    const db = await new Promise(resolve => { const r = indexedDB.open("gym-block-workouts-v1"); r.onsuccess = () => resolve(r.result); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite");
      tx.objectStore("sessions").put({ scope, key, revision: 3, workout: local, pending: true, conflict: { revision: 4, workout: remote } });
      tx.oncomplete = resolve; tx.onabort = reject;
    });
    db.close();
  }, { scope: "gym:blocks:" + api + ":" + athleteA + ":" + planId, key: sessionKey, local, remote });
  await s.page.reload();
  const save = s.page.getByRole("button", { name: "Guardar selección" });
  await save.waitFor(); assert.equal(await save.isDisabled(), true);
  await s.page.getByRole("group", { name: "Banca · Nota" }).getByRole("radio", { name: "Este dispositivo Nota del celu" }).check();
  assert.equal(await save.isDisabled(), true);
  await s.page.getByRole("group", { name: "Cómo te sentiste" }).getByRole("radio", { name: "Sincronizado ★★★" }).check();
  await save.click();
  await waitFor(() => db.get(athleteA)?.revision === 5, "No se combinaron las elecciones");
  assert.deepEqual(db.get(athleteA).workout, { ...local, rating: 3 });
  await localSaveAcknowledged(s.page); await s.page.reload(); await s.edit();
  assert.equal(await s.note.inputValue(), "Nota del celu");
  assert.equal(await save.count(), 0);
});

test("un envío rechazado por revisión antigua reintenta con la nota y la carga compatibles", async t => {
  const db = new Map();
  const [a, b] = await Promise.all([device(db), device(db)]);
  const gate = Promise.withResolvers();
  t.after(async () => { gate.resolve(); await Promise.all([a.context.close(), b.context.close()]); });
  await Promise.all([a.openLink("alicia"), b.openLink("alicia")]);
  a.deviceState.writeGate = gate.promise;
  b.deviceState.writeGate = gate.promise;
  await Promise.all([a.note.fill("Tempo controlado"), b.page.getByRole("textbox", { name: "Carga, serie 1", exact: true }).fill("80,5")]);
  await waitFor(() => a.deviceState.waitingToWrite && b.deviceState.waitingToWrite, "Los dos envíos no se superpusieron");
  gate.resolve();
  await waitFor(() => {
    const w = db.get(athleteA)?.workout;
    return w?.exerciseNotes?.lift === "Tempo controlado" && w.sets.lift?.[0]?.kg === "80,5";
  }, "El segundo envío no se reconcilió solo");
  assert.equal(db.get(athleteA).revision, 2);
  const fresh = await device(db);
  t.after(() => fresh.context.close());
  await fresh.openLink("alicia");
  assert.equal(await fresh.note.inputValue(), "Tempo controlado");
  assert.equal(await fresh.page.getByRole("textbox", { name: "Carga, serie 1", exact: true }).inputValue(), "80,5");
});

test("teclado, pegado y autocompletado conservan el dato anterior de la celda", async t => {
  const db = new Map();
  const s = await device(db);
  t.after(() => s.context.close());
  const plan = structuredClone(routine);
  plan.blocks[0].weeks[0].days[0].exercises[0].prescription = '2x30"';
  s.deviceState.routine = plan;
  await s.context.addInitScript(id => localStorage.setItem("gym-bloques:show-effort:v1:" + id, "true"), athleteA);
  await s.openLink("alicia");
  const cell = name => s.page.getByRole("textbox", { name: name + ", serie 1", exact: true });
  for (const [field, value] of [["Tiempo", "0:45"], ["Carga", "82,5"], ["Esfuerzo", "RIR 2"]]) {
    const input = cell(field);
    await input.fill(""); await input.pressSequentially(value);
    assert.equal(await input.inputValue(), value);
    await input.press("End"); await input.press("z");
    assert.equal(await input.inputValue(), value);
    const allowed = await input.evaluate(el => {
      el.select();
      const data = new DataTransfer();
      data.setData("text/plain", "Las Heras 123, Mendoza");
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: data });
      return el.dispatchEvent(event);
    });
    assert.equal(allowed, false);
    await s.page.keyboard.insertText("Las Heras 123, Mendoza");
    assert.equal(await input.inputValue(), value);
    const canPaste = await input.evaluate((el, text) => {
      el.select();
      const data = new DataTransfer(); data.setData("text/plain", text);
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: data });
      return el.dispatchEvent(event);
    }, value);
    assert.equal(canPaste, true);
  }
  await s.page.getByRole("checkbox", { name: "Serie 1 hecha", exact: true }).check();
  await waitFor(() => db.get(athleteA)?.workout.sets?.lift?.[0]?.confirmed, "No se guardó la serie");
  assert.deepEqual(db.get(athleteA).workout.sets.lift[0], { reps: "0:45", kg: "82,5", effort: "RIR 2", confirmed: true });
  await s.page.reload(); await s.edit();
  assert.equal(await cell("Carga").inputValue(), "82,5");
});

test("se puede corregir una dirección ya guardada sin tocar los demás datos", async t => {
  const original = { reps: "Las Heras, Mendoza", kg: "25", effort: "@8", confirmed: false };
  const other = { reps: "6", kg: "20", effort: "", confirmed: true };
  const workout = { startedAt: "2026-11-24T14:00:00Z", sets: { lift: [original, other] }, rating: 2, note: "", exerciseNotes: { lift: "Nota previa" } };
  const db = new Map([[athleteA, { session_key: sessionKey, revision: 3, workout }]]);
  const s = await device(db);
  t.after(() => s.context.close());
  await s.openLink("alicia");
  const reps = s.page.getByRole("textbox", { name: "Reps, serie 1", exact: true });
  assert.equal(await reps.getAttribute("aria-invalid"), "true");
  assert.equal(await reps.inputValue(), original.reps);
  await reps.focus(); await s.page.keyboard.insertText("8");
  assert.equal(await reps.inputValue(), "8");
  await waitFor(() => db.get(athleteA).revision === 4, "No se corrigió la serie histórica");
  const stored = db.get(athleteA).workout;
  assert.deepEqual(stored.sets.lift, [{ ...original, reps: "8" }, other]);
  assert.equal(stored.exerciseNotes.lift, "Nota previa");
});

test("el lápiz cambia la plantilla validada y conserva la anterior ante enlaces erróneos", async t => {
  const db = new Map();
  const s = await device(db);
  t.after(() => s.context.close());
  const sheetA = "sheet_A", sheetB = "sheet_B";
  s.deviceState.routines = {
    [athleteA]: { ...routine, spreadsheetId: sheetA, properties: { title: "Rutina A" } },
    [athleteB]: { ...routine, spreadsheetId: sheetB, properties: { title: "Rutina B" } },
  };
  await s.context.addInitScript(({ api, id, plan }) =>
    localStorage.setItem("gym-bloques:title:v1:gym:blocks:" + api + ":" + id + ":" + plan, "Apodo antiguo"),
    { api, id: athleteA, plan: planId });
  await s.openLink("alicia");
  await s.note.fill("Última serie de A");
  const heading = title => s.page.getByRole("heading", { name: title, exact: true });
  const pencil = s.page.getByRole("button", { name: "Cambiar plantilla" });
  const dialog = s.page.getByRole("dialog", { name: "Cambiar plantilla" });
  const field = dialog.getByRole("textbox", { name: "Enlace de la plantilla" });
  const submit = dialog.getByRole("button", { name: "Abrir plantilla" });
  await heading("Rutina A").waitFor();
  await pencil.click();
  for (const [value, error] of [
    ["enlace incompleto", "Pegá el enlace completo"],
    ["https://example.org/bloques#rutina=" + shareTokens.bruno, "Usá el enlace privado"],
    ["https://docs.google.com/spreadsheets/d/" + sheetB + "/edit", "Para abrir esta hoja por primera vez"],
    [origin + "/bloques#rutina=" + "c".repeat(64), "Este enlace ya no está activo"],
  ]) {
    await field.fill(value); await submit.click();
    await dialog.getByRole("alert").filter({ hasText: error }).waitFor();
  }
  await field.fill(origin + "/bloques#rutina=" + shareTokens.bruno); await submit.click();
  await heading("Rutina B").waitFor(); await s.edit();
  assert.equal(await s.note.inputValue(), "");
  await s.page.reload(); await heading("Rutina B").waitFor();
  await pencil.click();
  await dialog.getByRole("button", { name: "Rutina A" }).click();
  await heading("Rutina A").waitFor(); await s.edit();
  assert.equal(await s.note.inputValue(), "Última serie de A");
  await pencil.click();
  await field.fill("https://docs.google.com/spreadsheets/d/" + sheetB + "/edit?usp=sharing"); await submit.click();
  await heading("Rutina B").waitFor();
  assert.equal(await s.page.evaluate(() => location.hash), "");
  assert.deepEqual(s.pageErrors, []);
});

test("compartir abre la misma plantilla en otro navegador y ofrece copia manual si falta permiso", async t => {
  const db = new Map();
  const a = await device(db), b = await device(db);
  t.after(() => Promise.all([a.context.close(), b.context.close()]));
  const plan = { ...routine, spreadsheetId: "sheet_A", properties: { title: "Plantilla compartida" } };
  a.deviceState.routine = b.deviceState.routine = plan;
  await a.context.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => {
      if (window.denyClipboard) throw new Error("denegado");
      window.copied = text;
    } } });
    Object.defineProperty(navigator, "share", { configurable: true, value: async data => {
      if (window.cancelShare) throw new DOMException("Cancelado", "AbortError");
      window.shared = data;
    } });
  });
  await a.openLink("alicia");
  await a.page.waitForFunction(() => !location.hash);
  await a.page.getByRole("button", { name: "Compartir plantilla" }).click();
  const dialog = a.page.getByRole("dialog", { name: "Compartir plantilla" });
  const share = dialog.getByRole("button", { name: "Compartir Enlace de entrenamiento" });
  await share.click();
  const sent = await a.page.evaluate(() => window.shared);
  assert.deepEqual(sent, { title: plan.properties.title, url: origin + "/bloques#rutina=" + shareTokens.alicia });
  await b.page.goto(sent.url);
  await b.page.getByRole("heading", { name: plan.properties.title }).waitFor();
  await dialog.getByRole("button", { name: "Copiar Hoja de Google Sheets" }).click();
  assert.equal(await a.page.evaluate(() => window.copied), "https://docs.google.com/spreadsheets/d/sheet_A/edit");
  await a.page.evaluate(() => { window.denyClipboard = true; window.cancelShare = true; });
  await share.click();
  assert.equal(await dialog.getByRole("textbox").count(), 0);
  await dialog.getByRole("button", { name: "Copiar Enlace de entrenamiento" }).click();
  const manual = dialog.getByRole("textbox", { name: "Copiá este enlace" });
  assert.equal(await manual.inputValue(), sent.url);
  assert.equal(await manual.evaluate(el => el.selectionEnd - el.selectionStart), sent.url.length);
  assert.deepEqual([...a.pageErrors, ...b.pageErrors], []);
});

test("cancelar una verificación tardía conserva la plantilla y una reciente abre sin red", async t => {
  const s = await device(new Map());
  const gate = Promise.withResolvers();
  t.after(async () => { gate.resolve(); await s.context.close(); });
  s.deviceState.routines = {
    [athleteA]: { ...routine, properties: { title: "Principal" } },
    [athleteB]: { ...routine, properties: { title: "Alternativa" } },
  };
  const open = s.page.getByRole("button", { name: "Cambiar plantilla", exact: true });
  const dialog = s.page.getByRole("dialog", { name: "Cambiar plantilla" });
  const heading = name => s.page.getByRole("heading", { name, exact: true });
  await s.openLink("alicia");
  s.deviceState.openGate = gate.promise;
  const enterLink = async () => {
    await open.click();
    await dialog.getByRole("textbox").fill(origin + "/bloques#rutina=" + shareTokens.bruno);
    await dialog.getByRole("button", { name: "Abrir plantilla" }).click();
  };
  await enterLink();
  await waitFor(() => s.deviceState.waitingForPlan, "No se inició la verificación");
  await dialog.getByRole("button", { name: "Cerrar" }).click();
  gate.resolve();
  await heading("Principal").waitFor();
  await enterLink(); await heading("Alternativa").waitFor();
  await s.context.setOffline(true);
  await open.click();
  await dialog.getByRole("button", { name: "Principal" }).click();
  await heading("Principal").waitFor();
  assert.deepEqual(s.pageErrors, []);
});
