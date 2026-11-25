const prefix = "gymtracker.account.v1";
const legacyKeys = [
    "home_cache_v1",
    "prs_cache_v1",
    "fatiga_cache_v1",
    "onboarding_completed_v1",
    "onboarding_dismissed_v1",
    "onboarding_sync_action_v1",
];

export function accountScope(userId: string, spreadsheetId?: string | null) {
    return `${encodeURIComponent(userId)}:${encodeURIComponent(spreadsheetId ?? "")}`;
}

export function readAccountStorage<T>(scope: string | null, name: string): T | null {
    if (!scope) return null;
    try {
        const raw = window.localStorage.getItem(`${prefix}:${scope}:${name}`);
        return raw === null ? null : JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function writeAccountStorage(scope: string | null, name: string, value: unknown) {
    if (!scope) return;
    try {
        const key = `${prefix}:${scope}:${name}`;
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage may be unavailable or full.
    }
}

export function clearLegacyAccountStorage() {
    try {
        for (const key of legacyKeys) window.localStorage.removeItem(key);
    } catch {
        // Storage may be unavailable.
    }
}

export function clearAccountStorage(userId: string) {
    try {
        const accountPrefix = `${prefix}:${accountScope(userId)}`;
        for (let index = window.localStorage.length - 1; index >= 0; index--) {
            const key = window.localStorage.key(index);
            if (key?.startsWith(accountPrefix)) window.localStorage.removeItem(key);
        }
    } catch {
        // Storage may be unavailable.
    }
}
