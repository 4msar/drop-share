/**
 * Derives the lock token from a user-chosen password. The artifact id acts
 * as a free per-artifact salt, so the same password on two artifacts never
 * produces the same token - the plaintext password itself never has to
 * leave the browser or be stored anywhere.
 */
export async function hashPassword(
    artifactId: string,
    password: string,
): Promise<string> {
    return sha1Hex(`${artifactId}:${password}`);
}

/**
 * Derives an artifact's read-only share token from its lock token:
 * SHA-1(token). The Worker recomputes the same value from the token it
 * stores, so nothing extra is persisted - and a hash can't be reversed, so
 * a share link never carries the token's modify access.
 */
export async function deriveShareToken(token: string): Promise<string> {
    return sha1Hex(token);
}

async function sha1Hex(input: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-1",
        new TextEncoder().encode(input),
    );
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
