import { describe, expect, it } from "vitest";
import { hashPassword } from "./hash";

describe("hashPassword", () => {
    it("returns a 40-character lowercase hex digest", async () => {
        const hash = await hashPassword("artifact-1", "hunter2");
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
