import assert from "node:assert/strict";
import test from "node:test";
import { parsePRData, parseWeekData } from "../sheets-parse";
import { parseSetSlots } from "../set-values";
import { buildRoutineEdits, buildWeekClears, type WorkoutSheet } from "./workout-sheet";

function legacyWeek(): WorkoutSheet {
    const exerciseNames = [[], ["DÍA 1"], ["Press"], [], ["Remo"], [], [], [], [], [], [], ["DIA 2"]];
    const rows: WorkoutSheet["rows"] = exerciseNames.map(() => []);
    rows[2][3] = { userEnteredValue: { stringValue: "Pausa al bajar" } };
    rows[2][5] = { userEnteredValue: { numberValue: 8 } };
    rows[2][6] = { userEnteredValue: { numberValue: 70 } };
    rows[2][9] = { userEnteredValue: { numberValue: 5 } };
    rows[2][10] = { userEnteredValue: { numberValue: 80 } };
    rows[4][5] = { userEnteredValue: { stringValue: "10" } };
    rows[4][6] = { userEnteredValue: { stringValue: "42,5" } };
    rows[4][7] = { userEnteredValue: { formulaValue: "=IFERROR(A5,0)" } };
    rows[9][5] = { userEnteredValue: { stringValue: "★★☆" } };
    return { id: 41, rowCount: 50, exerciseNames, rows };
}

test("routine reorder moves notes and set slots with the original exercise", () => {
    const result = buildRoutineEdits(legacyWeek(), 1, [
        { name: "Remo", prescribedSeries: "2 x 8" },
        { name: "Press", prescribedSeries: "3 x 8" },
    ]);
    assert.equal(result.status, 200);
    if (result.status !== 200) return;

    const [routine, notes, sets] = result.requests.map(({ updateCells }) => updateCells);
    assert.equal(result.range, "'Semana 1'!A3:B9");
    assert.equal(routine?.rows?.[0].values?.[0].userEnteredValue?.stringValue, "Remo");
    assert.equal(notes?.rows?.[1].values?.[0].userEnteredValue?.stringValue, "Pausa al bajar");
    assert.equal(sets?.rows?.[0].values?.[1].userEnteredValue?.stringValue, "42,5");
    assert.equal(sets?.rows?.[1].values?.[1].userEnteredValue?.numberValue, 70);
    assert.deepEqual(sets?.rows?.[1].values?.[2], {});
    assert.equal(sets?.rows?.[1].values?.[5].userEnteredValue?.numberValue, 80);
    assert.equal(sets?.range?.endRowIndex, 9);
});

test("routine edit rejects removing an exercise with entered sets", () => {
    const result = buildRoutineEdits(legacyWeek(), 1, [{ name: "Remo", prescribedSeries: "2 x 8" }]);
    assert.equal(result.status, 409);
    assert.match("message" in result ? result.message : "", /Press/);
});

test("copied weeks clear only entered loads and ratings within workout ranges", () => {
    const source = legacyWeek();
    const requests = buildWeekClears(source, 43);
    const ranges = requests.map(({ updateCells }) => updateCells?.range);
    assert.ok(ranges.every((range) => range?.sheetId === 43 && range.startColumnIndex! >= 5));
    assert.ok(ranges.some((range) => range?.startRowIndex === 9 && range.startColumnIndex === 5));
    assert.ok(ranges.some((range) => range?.startRowIndex === 4 && range.startColumnIndex === 5 && range.endColumnIndex === 7));
    assert.ok(!ranges.some((range) => range?.startRowIndex === 4 && range.startColumnIndex! <= 7 && range.endColumnIndex! > 7));
    assert.equal(source.rows[2][6].userEnteredValue?.numberValue, 70);
});

test("legacy weeks keep set positions, decimal weights and bodyweight sets", () => {
    const rows = Array.from({ length: 10 }, () => [] as unknown[]);
    rows[1] = ["DIA 1"];
    rows[2] = ["Remo", "3 x 8", "", "", "", 8, "42,5", "", "", 9, 0];
    rows[9] = ["", "", "", "", "", "★★☆"];
    const [day] = parseWeekData(rows, 1).days;
    assert.equal(day.stars, 2);
    assert.deepEqual(day.exercises[0].sets, [{ reps: 8, weight: 42.5 }, { reps: null, weight: null }, { reps: 9, weight: 0 }]);
    assert.equal(parsePRData([[], ["Remo", 50, 8, 46023, 60]])[0].date, "01/01/2026");
});

test("set payloads accept clearing and preserve explicit empty slots", () => {
    assert.deepEqual(parseSetSlots([]), []);
    assert.deepEqual(parseSetSlots([{ reps: 8, weight: 0 }, null, { reps: 8, weight: 42.5 }]), [
        { reps: 8, weight: 0 }, null, { reps: 8, weight: 42.5 },
    ]);
    assert.deepEqual(parseSetSlots([{ reps: null, weight: null }, { reps: 0, weight: 0 }]), [null, null]);
    assert.equal(parseSetSlots([{ reps: 0, weight: 42 }]), null);
    assert.equal(parseSetSlots([null, null, null, null, null]), null);
});
