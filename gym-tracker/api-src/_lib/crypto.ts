import { webcrypto } from "node:crypto";

// AES-GCM encryption for sensitive data (refresh tokens)

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;

function toBase64(data: Uint8Array): string {
    // Node-compatible base64
    return Buffer.from(data).toString("base64");
}

function fromBase64(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, "base64"));
}

function getEncryptionKey(): string {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key || key.length < 32) {
        throw new Error("TOKEN_ENCRYPTION_KEY must be at least 32 characters");
    }
    return key;
}

async function deriveKey(password: string): Promise<webcrypto.CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await webcrypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    return webcrypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: encoder.encode("gym-tracker-salt"),
            iterations: 100000,
            hash: "SHA-256",
        },
        keyMaterial,
        { name: ALGORITHM, length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

export async function encrypt(plaintext: string): Promise<string> {
    const key = await deriveKey(getEncryptionKey());
    const encoder = new TextEncoder();
    const iv = webcrypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const encrypted = await webcrypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        encoder.encode(plaintext)
    );

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return toBase64(combined);
}

export async function decrypt(ciphertext: string): Promise<string> {
    const key = await deriveKey(getEncryptionKey());
    const combined = fromBase64(ciphertext);

    const iv = combined.slice(0, IV_LENGTH);
    const encrypted = combined.slice(IV_LENGTH);

    const decrypted = await webcrypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        encrypted
    );

    return new TextDecoder().decode(decrypted);
}

