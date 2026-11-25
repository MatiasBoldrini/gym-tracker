import type { Day, Workout } from "./routine";
import { reconcileWorkout, sameValue } from "./reconcileWorkout.ts";

export type RemoteWorkout = { workout: Workout; revision: number };
export type CloudWorkout = RemoteWorkout & {
    scope: string;
    key: string;
    pending: boolean;
    // Last shared workout before this device's first unacknowledged edit.
    base?: Workout;
    rejected?: boolean;
    // Keep the exact request until its acknowledgment survives a reload.
    sending?: RemoteWorkout & { id: string };
    conflict?: RemoteWorkout;
};

const table = "sessions";

export type WorkoutConflict = { key: string; local: Workout; remote: RemoteWorkout; base?: Workout };

export function receiveWorkout(scope: string, key: string, remote: RemoteWorkout, local?: CloudWorkout, day?: Day): CloudWorkout {
    if (local && remote.revision <= Math.max(local.revision, local.conflict?.revision ?? 0)) return local;
    const saved = { scope, key, workout: remote.workout, revision: remote.revision, pending: false };
    if (!local?.pending || sameValue(remote.workout, local.workout)) return saved;
    // A lost acknowledgment supplies the new base even when more edits have been typed since.
    if (local.sending && sameValue(remote.workout, local.sending.workout))
        return { ...local, revision: remote.revision, base: remote.workout, sending: undefined, conflict: undefined };
    if (day && local.base) {
        const result = reconcileWorkout(local.base, local.workout, remote.workout, day);
        if (!result.differences.length) {
            if (sameValue(result.workout, remote.workout)) return saved;
            return { ...saved, workout: result.workout, base: remote.workout, pending: true };
        }
    }
    return { ...local, sending: undefined, rejected: undefined, conflict: remote };
}

export async function openWorkoutDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("gym-block-workouts-v1", 1);
        request.onupgradeneeded = () => {
            const sessions = request.result.createObjectStore(table, { keyPath: ["scope", "key"] });
            sessions.createIndex("scope", "scope");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function readScope(db: IDBDatabase, scope: string): Promise<CloudWorkout[]> {
    return new Promise((resolve, reject) => {
        const request = db.transaction(table).objectStore(table).index("scope").getAll(scope);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function readSessions(db: IDBDatabase, scope: string, keys: readonly string[]): Promise<CloudWorkout[]> {
    const store = db.transaction(table).objectStore(table);
    return Promise.all(keys.map(key => new Promise<CloudWorkout | undefined>((resolve, reject) => {
        const request = store.get([scope, key]);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }))).then(rows => rows.filter((row): row is CloudWorkout => !!row));
}

// Read, change and persist in a single transaction, including when two tabs edit the same set.
export function changeRow(db: IDBDatabase, scope: string, key: string,
    update: (row?: CloudWorkout) => CloudWorkout | undefined): Promise<CloudWorkout | undefined> {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(table, "readwrite");
        const store = transaction.objectStore(table);
        const request = store.get([scope, key]);
        let next: CloudWorkout | undefined;
        request.onsuccess = () => {
            try {
                next = update(request.result);
                if (next && next !== request.result) store.put(next);
            } catch (error) {
                transaction.abort();
                reject(error);
            }
        };
        transaction.oncomplete = () => resolve(next);
        transaction.onabort = () => reject(transaction.error ?? new Error("Registro interrumpido"));
    });
}
