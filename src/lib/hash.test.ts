import { describe, expect, it } from "vitest";
import { deriveShareToken, hashPassword } from "./hash";

describe("hashPassword", () => {
    it("returns a 40-character lowercase hex digest", async () => {
        const hash = await hashPassword("artifact-1", "hunter2");
        const pass = await hashPassword(
            "01M0YHXS3AZRN9DSRQMFS52QPE",
            "msar#6727",
        );

        console.log({ pass });

        expect(hash).toMatch(/^[0-9a-f]{40}$/);
    });

    it("is deterministic for the same artifact id and password", async () => {
        const a = await hashPassword("artifact-1", "hunter2");
        const b = await hashPassword("artifact-1", "hunter2");
        expect(a).toBe(b);
    });

    it("differs for different passwords on the same artifact", async () => {
        const a = await hashPassword("artifact-1", "hunter2");
        const b = await hashPassword("artifact-1", "hunter3");
        expect(a).not.toBe(b);
    });

    it("differs for the same password on different artifacts", async () => {
        const a = await hashPassword("artifact-1", "hunter2");
        const b = await hashPassword("artifact-2", "hunter2");
        expect(a).not.toBe(b);
    });
});

describe("deriveShareToken", () => {
    it("is SHA-1 of the lock token, matching the Worker's derivation", async () => {
        // SHA-1("abc"), the standard FIPS 180 test vector.
        expect(await deriveShareToken("abc")).toBe(
            "a9993e364706816aba3e25717850c26c9cd0d89d",
        );
    });

    it("never equals the token it was derived from", async () => {
        const token = await hashPassword("artifact-1", "hunter2");
        expect(await deriveShareToken(token)).not.toBe(token);
    });
});
