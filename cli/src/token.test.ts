import { describe, expect, it } from "vitest";
import type { Args } from "./args.js";
import { derivePasswordToken, deriveShareToken, resolveToken, sharePath } from "./token.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
// Independently computed: printf '%s' "$ID:secret" | shasum -a 1
const SECRET_TOKEN = "1543315e2bc6de48ac9cba438f3a430c71326520";

function makeArgs(overrides: Partial<Args> = {}): Args {
    return {
        command: "upload",
        targetPaths: ["/abs/photo.png"],
        server: "https://example.com",
        extract: false,
        forceNew: false,
        ...overrides,
    };
}

const saved = { id: ID, url: `/a/${ID}/`, updatedAt: "", token: "saved" };

describe("derivePasswordToken", () => {
    it("matches the web viewer's SHA-1(<id>:<password>) derivation", () => {
        expect(derivePasswordToken(ID, "secret")).toBe(SECRET_TOKEN);
    });

    it("salts by artifact id", () => {
        expect(derivePasswordToken("01ARZ3NDEKTSV4RRFFQ69G5FAW", "secret")).not.toBe(
            SECRET_TOKEN,
        );
    });
});

describe("resolveToken", () => {
    const update = { action: "update" as const, id: ID };

    it("prefers an explicit --token", () => {
        expect(resolveToken(makeArgs({ token: "explicit" }), update, saved)).toBe(
            "explicit",
        );
    });

    it("derives --password against the artifact being updated, over a saved token", () => {
        expect(resolveToken(makeArgs({ password: "secret" }), update, saved)).toBe(
            SECRET_TOKEN,
        );
    });

    it("derives against an --id that differs from the saved entry", () => {
        const other = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
        expect(
            resolveToken(
                makeArgs({ command: "update", password: "secret" }),
                { action: "update", id: other },
                saved,
            ),
        ).toBe(derivePasswordToken(other, "secret"));
    });

    it("falls back to the saved token", () => {
        expect(resolveToken(makeArgs(), update, saved)).toBe("saved");
    });

    it("does not derive a password for a fresh upload", () => {
        expect(
            resolveToken(makeArgs({ password: "secret" }), { action: "create" }, undefined),
        ).toBeUndefined();
    });
});

describe("deriveShareToken / sharePath", () => {
    it("is SHA-1 of the lock token, matching the web viewer and Worker", () => {
        // SHA-1("abc"), the standard FIPS 180 test vector.
        expect(deriveShareToken("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    });

    it("builds a token-carrying path only for private artifacts", () => {
        expect(sharePath("ID", "private", "abc")).toBe(
            "/s/ID.a9993e364706816aba3e25717850c26c9cd0d89d/",
        );
        expect(sharePath("ID", "public", "abc")).toBe("/s/ID/");
        expect(sharePath("ID", "private", undefined)).toBe("/s/ID/");
    });
});
