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
    const bytes = new TextEncoder().encode(`${artifactId}:${password}`);
    const digest = await crypto.subtle.digest("SHA-1", bytes);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
