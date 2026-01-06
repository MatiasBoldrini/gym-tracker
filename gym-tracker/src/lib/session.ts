import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { nanoid } from "./nanoid";

const SESSION_COOKIE_NAME = "gym_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSessionSecret() {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error("SESSION_SECRET must be at least 32 characters");
    }
    return new TextEncoder().encode(secret);
}

export interface SessionPayload {
    userId: string;
    email?: string;
}

export async function createSession(payload: SessionPayload): Promise<string> {
    const token = await new SignJWT({ ...payload })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_MAX_AGE}s`)
        .sign(getSessionSecret());

    return token;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, getSessionSecret());
        return payload as unknown as SessionPayload;
    } catch {
        return null;
    }
}

export async function getSession(): Promise<SessionPayload | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return verifySession(token);
}

export async function setSessionCookie(token: string) {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE,
        path: "/",
    });
}

export async function clearSessionCookie() {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
}

export function generateUserId(): string {
    return nanoid();
}








