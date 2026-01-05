import { cookies } from "next/headers";
import { decrypt, encrypt } from "@/lib/crypto";

const STORE_COOKIE_NAME = "gym_store";
const STORE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export type UserStore = {
    refreshToken?: string; // sensitive, stored encrypted
    spreadsheetId?: string;
};

async function getCookieValue(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get(STORE_COOKIE_NAME)?.value ?? null;
}

export async function getUserStore(): Promise<UserStore> {
    const value = await getCookieValue();
    if (!value) return {};

    try {
        const json = await decrypt(value);
        const parsed = JSON.parse(json);
        if (!parsed || typeof parsed !== "object") return {};
        const store = parsed as UserStore;
        return {
            refreshToken: typeof store.refreshToken === "string" ? store.refreshToken : undefined,
            spreadsheetId: typeof store.spreadsheetId === "string" ? store.spreadsheetId : undefined,
        };
    } catch {
        // If decrypt/parse fails, treat as logged out/corrupt store
        return {};
    }
}

export async function setUserStore(next: UserStore): Promise<void> {
    const cookieStore = await cookies();
    const ciphertext = await encrypt(JSON.stringify(next));

    cookieStore.set(STORE_COOKIE_NAME, ciphertext, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: STORE_MAX_AGE,
        path: "/",
    });
}

export async function updateUserStore(patch: Partial<UserStore>): Promise<UserStore> {
    const current = await getUserStore();
    const next: UserStore = { ...current, ...patch };
    await setUserStore(next);
    return next;
}

export async function clearUserStore(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(STORE_COOKIE_NAME);
}

export function isUserAuthenticated(store: UserStore): boolean {
    return !!store.refreshToken;
}





