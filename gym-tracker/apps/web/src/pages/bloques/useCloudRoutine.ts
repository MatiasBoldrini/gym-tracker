import { useCallback, useEffect, useRef, useState } from "react";
import { accountPrefix, linkedClient, routineRequest, type PlanAccess } from "./planLink";
import { changeRow, openWorkoutDatabase, readScope, readSessions, receiveWorkout, type CloudWorkout, type WorkoutConflict } from "./cloudWorkoutStorage";
import { dayForSession, newWorkout, parseRoutine, sessionKey, updateExercise, type Day, type ExerciseEdit, type Routine, type Workout, type WorkoutLog } from "./routine";
import { reconcileWorkout, sameValue, type Choices } from "./reconcileWorkout";
import { readWorkouts } from "./workoutStorage";

type Plan = { plan_id: string; plan_revision: number; routine: Routine };
type SheetProblem = { session_key: string; sheet_row: number | null; reason: string };
type Snapshot = {
    routine?: Routine; sourceId: string; loading: boolean; log: WorkoutLog; offlinePlanUnavailable?: boolean;
    error: string; status: string; conflicts: WorkoutConflict[]; rejected: string[]; sheetProblems: SheetProblem[];
};
const initial = (): Snapshot => ({ sourceId: "", loading: true, log: {}, error: "", status: "", conflicts: [], rejected: [], sheetProblems: [] });

const cacheError = "No se pudo guardar en este dispositivo. Revisá el espacio disponible.";

class WorkoutSync {
    readonly userId: string;
    readonly client: ReturnType<typeof linkedClient>;
    private readonly account: string;
    private readonly onRevoked: () => void;
    private readonly signal: AbortSignal;
    private readonly render: (value: Snapshot) => void;
    private readonly notice?: BroadcastChannel;
    private state = initial();
    private db?: IDBDatabase;
    private scope = "";
    private cachedPlan?: Plan;
    private readonly planId: string;
    private fetching = false;
    private fetchAgain = false;
    private refreshPlan = true;
    private pendingWrites = 0;
    private readonly pendingSessions = new Set<string>();
    private activeReads = 0;
    private refreshAfterWrites = false;
    private timer?: ReturnType<typeof setTimeout>;
    private retryMs = 1_000;
    private generation = 0;

    constructor(access: PlanAccess, signal: AbortSignal, render: (value: Snapshot) => void, onRevoked: () => void) {
        this.userId = access.id;
        this.planId = access.planId;
        this.account = accountPrefix + access.id;
        this.client = linkedClient(access.token);
        this.onRevoked = onRevoked;
        this.signal = signal;
        this.render = render;
        if (typeof BroadcastChannel !== "undefined") {
            this.notice = new BroadcastChannel(this.account);
            this.notice.onmessage = ({ data }) => {
                const keys = typeof data === "string" && data !== "import" ? [data] : undefined;
                void this.reloadView(keys).catch(() => this.show({ error: cacheError }));
            };
        }
        signal.addEventListener("abort", () => { clearTimeout(this.timer); this.notice?.close(); this.db?.close(); });
    }

    private show(patch: Partial<Snapshot>) {
        if (this.signal.aborted || (Object.keys(patch) as (keyof Snapshot)[]).every(key => this.state[key] === patch[key])) return;
        this.state = { ...this.state, ...patch };
        this.render(this.state);
    }

    private async usePlan(plan: Plan) {
        this.cachedPlan = plan;
        const scope = this.account + ":" + plan.plan_id;
        if (this.scope !== scope) {
            this.pendingSessions.clear();
            this.scope = scope;
            this.show({ routine: undefined, log: {}, conflicts: [], rejected: [], sheetProblems: [], loading: true });
        }
        this.show({ routine: plan.routine, sourceId: scope });
        await this.reloadView();
    }

    async start() {
        try {
            const db = await openWorkoutDatabase();
            if (this.signal.aborted) { db.close(); return; }
            this.db = db;
            const raw = localStorage.getItem(this.account);
            if (raw) {
                const cached = JSON.parse(raw) as Plan;
                if (cached.plan_id === this.planId) await this.usePlan({ ...cached, routine: parseRoutine(cached.routine) });
            }
        } catch { this.show({ error: cacheError }); }
        if (!this.signal.aborted && this.db) this.schedule(true, 0);
        else this.show({ loading: false });
    }

    private async reloadView(keys?: string[]) {
        if (!this.db || !this.scope || this.signal.aborted) return;
        if (this.pendingWrites) { this.refreshAfterWrites = true; return; }
        // When refreshes overlap, the newest full read must cover both sets of keys.
        const partial = keys && !this.activeReads && !this.refreshAfterWrites;
        this.refreshAfterWrites = false;
        const scope = this.scope;
        const generation = ++this.generation;
        this.activeReads++;
        try {
            const rows = partial ? await readSessions(this.db, scope, keys) : await readScope(this.db, scope);
            if (scope !== this.scope || generation !== this.generation) return;
            let log: WorkoutLog = partial ? this.state.log : {};
            const conflicts = partial ? this.state.conflicts.filter(item => !keys.includes(item.key)) : [];
            const rejected = partial ? this.state.rejected.filter(key => !keys.includes(key)) : [];
            if (partial) {
                for (const key of keys) this.pendingSessions.delete(key);
            } else this.pendingSessions.clear();
            for (const row of rows) {
                if (!partial || JSON.stringify(log[row.key]) !== JSON.stringify(row.workout)) {
                    if (log === this.state.log) log = { ...log };
                    log[row.key] = row.workout;
                }
                if (row.pending) this.pendingSessions.add(row.key);
                if (row.conflict) conflicts.push({ key: row.key, local: row.workout, base: row.base, remote: row.conflict });
                if (row.pending && row.rejected) rejected.push(row.key);
            }
            this.show({ loading: false, log, conflicts, rejected,
                status: !navigator.onLine ? "Sin conexión" : this.pendingSessions.size ? "Esperando sincronización" : "Sincronizado" });
        } finally { this.activeReads--; }
    }

    schedule(pull: boolean, delay = 550) {
        if (this.signal.aborted) return;
        if (pull) this.refreshPlan = true;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { void this.sync(); }, delay);
    }

    private async pull() {
        const { data, error } = await routineRequest(this.signal, signal => this.client.from("block_plans").select("plan_id,plan_revision")
            .eq("user_id", this.userId).abortSignal(signal).maybeSingle());
        if (error) throw error;
        if (this.signal.aborted) return;
        if (!data) {
            this.scope = "";
            this.cachedPlan = undefined;
            localStorage.removeItem(this.account);
            this.show({ ...initial(), loading: false });
            this.onRevoked();
            return;
        }
        let plan = this.cachedPlan;
        const newPlan = !plan || plan.plan_id !== data.plan_id || plan.plan_revision !== data.plan_revision;
        if (!plan || newPlan) {
            const { data: row, error: planError } = await routineRequest(this.signal, signal => this.client.from("block_plans").select("plan_id,plan_revision,routine")
                .eq("user_id", this.userId).eq("plan_id", data.plan_id).abortSignal(signal).maybeSingle());
            if (planError || !row) throw planError ?? new Error("Cambió la asignación");
            plan = { plan_id: String(row.plan_id), plan_revision: row.plan_revision, routine: parseRoutine(row.routine) };
        }
        const scope = this.account + ":" + plan.plan_id;
        const local = await readScope(this.db!, scope);
        const known = new Map(local.map(row => [row.key, row]));
        // On foreground polls download workout bodies only for newly changed revisions.
        for (let offset = 0; ; offset += 500) {
            const { data: rows, error: readError } = await routineRequest(this.signal, signal => this.client.from("block_workouts")
                .select("session_key,revision").eq("user_id", this.userId).eq("plan_id", plan.plan_id)
                .order("session_key").range(offset, offset + 499).abortSignal(signal));
            if (readError) throw readError;
            if (this.signal.aborted) return;
            const changed = rows.filter(row => {
                const prior = known.get(row.session_key);
                return !prior || Math.max(prior.revision, prior.conflict?.revision ?? 0) < row.revision;
            });
            if (changed.length) {
                const query = () => this.client.from("block_workouts").select("session_key,revision,workout")
                    .eq("user_id", this.userId).eq("plan_id", plan.plan_id);
                // Session keys contain literal JSON punctuation. Equality filters preserve them exactly.
                // A first sync with many missing sessions is cheaper as one page.
                const results = changed.length <= 4
                    ? await Promise.all(changed.map(row => routineRequest(this.signal, signal => query().eq("session_key", row.session_key).abortSignal(signal))))
                    : [await routineRequest(this.signal, signal => query().order("session_key").range(offset, offset + 499).abortSignal(signal))];
                if (this.signal.aborted) return;
                for (const result of results) {
                    if (result.error) throw result.error;
                    await Promise.all(result.data.map(row => changeRow(this.db!, scope, row.session_key, existing =>
                        receiveWorkout(scope, row.session_key, row, existing, dayForSession(plan.routine, row.session_key)))));
                }
            }
            if (rows.length < 500) break;
        }
        if (this.signal.aborted) return;
        if (newPlan || this.state.offlinePlanUnavailable) {
            try {
                localStorage.setItem(this.account, JSON.stringify(plan));
                this.show({ offlinePlanUnavailable: false });
            } catch { this.show({ offlinePlanUnavailable: true }); }
        }
        await this.usePlan(plan);
        const { data: problems, error: problemError } = await routineRequest(this.signal, signal => this.client.from("block_sheet_conflicts")
            .select("session_key,sheet_row,reason").eq("user_id", this.userId).eq("plan_id", plan.plan_id).abortSignal(signal));
        if (!problemError) this.show({ sheetProblems: problems });
    }

    private async push(row: CloudWorkout) {
        const db = this.db!;
        const { scope, key } = row;
        const latest = await changeRow(db, scope, key, current => {
            if (!current?.pending || current.conflict || current.rejected || current.sending) return current;
            return { ...current, sending: { id: crypto.randomUUID?.() ?? String(Date.now()) + "-" + Math.random(),
                revision: current.revision, workout: current.workout } };
        });
        const sending = latest?.sending;
        if (!sending || latest?.conflict || this.signal.aborted) return;
        const planId = scope.slice(this.account.length + 1);
        const { data, error, status } = await routineRequest(this.signal, signal => this.client.rpc("save_linked_block_workout", { p_plan_id: planId,
            p_session_key: key, p_workout: sending.workout, p_expected_revision: sending.revision }).abortSignal(signal));
        if (this.signal.aborted) return;
        if (error?.code === "42501") { this.onRevoked(); return; }
        if (error?.code === "22023" || status === 413) {
            // The server definitely rejected this snapshot. A newer local edit can be sent immediately.
            const updated = await changeRow(db, scope, key, current => current?.sending?.id === sending.id
                ? { ...current, sending: undefined, rejected: JSON.stringify(current.workout) === JSON.stringify(sending.workout) } : current);
            if (updated?.pending && !updated.rejected) this.schedule(false, 0);
        } else if (error?.code === "40001") {
            const { data: remote, error: readError } = await routineRequest(this.signal, signal => this.client.from("block_workouts").select("revision,workout")
                .eq("user_id", this.userId).eq("plan_id", planId).eq("session_key", key).abortSignal(signal).single());
            if (readError) throw readError;
            if (this.signal.aborted) return;
            if (!remote) throw new Error("Falta la revisión de la sesión");
            const updated = await changeRow(db, scope, key, current => current?.sending?.id === sending.id
                ? receiveWorkout(scope, key, remote, current, dayForSession(this.cachedPlan?.routine, key)) : current);
            if (updated?.pending && !updated.conflict) this.schedule(false, 0);
        } else {
            if (error) throw error;
            if (!Number.isInteger(data)) throw new Error("Respuesta de guardado inválida");
            const committed = await changeRow(db, scope, key, current => {
                if (current?.sending?.id !== sending.id) return current;
                const pending = !sameValue(current.workout, sending.workout);
                return { ...current, sending: undefined, revision: data, pending, base: pending ? sending.workout : undefined };
            });
            // A reloaded tab may first acknowledge an old request and still owe a newer edit.
            if (committed?.pending && !committed.conflict) this.schedule(false, 0);
        }
        if (!this.signal.aborted) this.notice?.postMessage(key);
    }

    private async sync() {
        if (this.fetching) { this.fetchAgain = true; return; }
        if (!this.db || this.signal.aborted) return;
        if (!navigator.onLine) {
            this.show({ status: "Sin conexión", loading: false });
            return;
        }
        this.fetching = true;
        try {
            if (this.refreshPlan) { this.refreshPlan = false; await this.pull(); }
            if (!this.scope || this.signal.aborted) return;
            const keys = [...this.pendingSessions];
            const rows = keys.length ? await readSessions(this.db, this.scope, keys) : [];
            let failed = false;
            const pending = rows.filter(row => row.pending && !row.conflict && !row.rejected);
            for (const row of pending) {
                if (this.signal.aborted) return;
                try { await this.push(row); } catch { failed = true; }
            }
            if (pending.length) await this.reloadView(pending.map(row => row.key));
            if (failed) throw new Error("Quedan sesiones pendientes");
            this.retryMs = 1_000;
            this.show({ error: "" });
        } catch {
            if (this.signal.aborted) return;
            this.show({ loading: false, status: "Sin sincronizar", error: "No se pudo sincronizar tu rutina. Se reintentará automáticamente." });
            this.schedule(true, this.retryMs);
            this.retryMs = Math.min(this.retryMs * 2, 60_000);
        } finally {
            this.fetching = false;
            if (this.fetchAgain) { this.fetchAgain = false; this.schedule(false, 0); }
        }
    }

    async save(key: string, rating: Day["rating"], update: (w: Workout) => Workout) {
        if (!this.db || !this.scope || this.signal.aborted) return false;
        const scope = this.scope;
        const initialWorkout = newWorkout(rating);
        this.pendingWrites++;
        this.generation++;
        // If an external refresh overlaps this edit, read again once local transactions finish.
        if (this.activeReads) this.refreshAfterWrites = true;
        const optimistic = update(this.state.log[key] ?? initialWorkout);
        this.show({ log: { ...this.state.log, [key]: optimistic },
            status: navigator.onLine ? "Esperando sincronización" : "Sin conexión" });
        try {
            const saved = await changeRow(this.db, scope, key, current => {
                const draft = { ...current, scope, key, base: current?.pending ? current.base : current?.workout ?? initialWorkout,
                    workout: update(current?.workout ?? initialWorkout), revision: current?.revision ?? 0, pending: true, rejected: undefined };
                // The athlete can also correct a disputed value directly in the editor.
                return current?.conflict ? receiveWorkout(scope, key, current.conflict, { ...draft, conflict: undefined },
                    dayForSession(this.cachedPlan?.routine, key)) : draft;
            });
            if (this.scope !== scope || this.signal.aborted) return true;
            this.pendingSessions.add(key);
            // The transaction can include a sibling tab's edit. Never replace a newer local tap.
            if (saved && this.state.log[key] === optimistic &&
                JSON.stringify(saved.workout) !== JSON.stringify(optimistic)) {
                this.show({ log: { ...this.state.log, [key]: saved.workout } });
            }
            if (saved?.conflict || this.state.conflicts.some(c => c.key === key)) this.refreshAfterWrites = true;
            if (this.state.rejected.includes(key)) this.show({ rejected: this.state.rejected.filter(item => item !== key) });
            if (!this.signal.aborted) this.notice?.postMessage(key);
            this.schedule(false);
            return true;
        } catch {
            this.refreshAfterWrites = true;
            this.show({ error: cacheError });
            return false;
        } finally {
            this.pendingWrites--;
            if (!this.pendingWrites && this.refreshAfterWrites) await this.reloadView().catch(() => this.show({ error: cacheError }));
        }
    }

    async resolve(expected: WorkoutConflict, choices: Choices) {
        const { key } = expected;
        const day = dayForSession(this.cachedPlan?.routine, key);
        if (!this.db || !day) return;
        try {
            await changeRow(this.db, this.scope, key, row => {
                if (!row?.conflict || row.conflict.revision !== expected.remote.revision || !sameValue(row.workout, expected.local)) return row;
                const { workout, differences } = reconcileWorkout(row.base, row.workout, row.conflict.workout, day, choices);
                if (differences.some(d => !choices[d.id])) return row;
                const pending = !sameValue(workout, row.conflict.workout);
                return { ...row, workout, revision: row.conflict.revision, pending,
                    base: pending ? row.conflict.workout : undefined, sending: undefined, conflict: undefined, rejected: undefined };
            });
            this.notice?.postMessage(key);
            await this.reloadView([key]);
            this.schedule(false, 0);
        } catch { this.show({ error: cacheError }); }
    }

    async importLegacy() {
        if (!this.db || !this.state.routine) return;
        const routine = this.state.routine;
        let imported = 0;
        try {
            const localPlan = JSON.parse(localStorage.getItem("gym-bloques:imported-routine:v1") ?? "null") as Routine | null;
            if (localPlan?.spreadsheetId && routine.spreadsheetId && localPlan.spreadsheetId !== routine.spreadsheetId) {
                this.show({ error: "Los registros de este navegador corresponden a otra planilla." });
                return;
            }
            const old = readWorkouts();
            for (const b of routine.blocks) for (const w of b.weeks) for (const d of w.days) {
                const key = sessionKey(b, w, d);
                const workout = old[key];
                if (!workout) continue;
                const known = new Set(d.exercises.map(exercise => exercise.id));
                const recorded = [...Object.keys(workout.sets), ...Object.keys(workout.exerciseNotes ?? {}), ...Object.keys(workout.completed ?? {})];
                if (recorded.some(id => !known.has(id))) continue;
                await changeRow(this.db, this.scope, key, row => {
                    if (row) return row;
                    imported++;
                    return { scope: this.scope, key, workout, revision: 0, pending: true };
                });
            }
            await this.reloadView();
            this.notice?.postMessage("import");
            this.schedule(false);
            return imported;
        } catch { this.show({ error: cacheError }); }
    }
}

export function useCloudRoutine(access: PlanAccess, onRevoked: () => void) {
    const [state, setState] = useState(initial);
    const store = useRef<WorkoutSync | undefined>(undefined);
    useEffect(() => {
        const controller = new AbortController();
        const sync = new WorkoutSync(access, controller.signal, setState, onRevoked);
        store.current = sync;
        void sync.start();
        const reconnect = () => sync.schedule(true, 0);
        const refresh = () => { if (!document.hidden) reconnect(); };
        window.addEventListener("online", reconnect);
        window.addEventListener("offline", reconnect);
        document.addEventListener("visibilitychange", refresh);
        const poll = window.setInterval(() => { if (!document.hidden && navigator.onLine) reconnect(); }, 30_000);
        return () => {
            window.clearInterval(poll);
            controller.abort();
            window.removeEventListener("online", reconnect);
            window.removeEventListener("offline", reconnect);
            document.removeEventListener("visibilitychange", refresh);
            store.current = undefined;
        };
    }, [access, onRevoked]);
    const saveWorkout = useCallback(async (key: string, rating: Day["rating"], update: (w: Workout) => Workout) =>
        await store.current?.save(key, rating, update) ?? false, []);
    const editExercise = useCallback((key: string, day: Day, exerciseId: string, edit: ExerciseEdit) => {
        const exercise = day.exercises.find(e => e.id === exerciseId);
        if (exercise) void saveWorkout(key, day.rating, w => updateExercise(w, day, exercise, edit));
    }, [saveWorkout]);
    return { ...state, saveWorkout, editExercise, resolve: (expected: WorkoutConflict, choices: Choices) => store.current?.resolve(expected, choices),
        retry: () => store.current?.schedule(true, 0), importLegacy: () => store.current?.importLegacy() };
}
