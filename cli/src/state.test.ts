import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { baseDirectory, getEntry, removeEntry, setEntry } from "./state.js";

let dir: string;
let statePath: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "drop-share-test-"));
    statePath = join(dir, "state.json");
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe("state", () => {
    it("uses a file's containing directory as its base directory", () => {
        expect(baseDirectory(["/project/.ai/AGENTS.md"])).toBe("/project/.ai");
    });

    it("uses the common parent for bundled files", () => {
        expect(
            baseDirectory(["/project/.ai/AGENTS.md", "/project/.ai/API.md"]),
        ).toBe("/project/.ai");
    });

    it("uses an explicitly uploaded directory as its own base directory", () => {
        expect(baseDirectory(["/project/.ai"], new Set(["/project/.ai"]))).toBe(
            "/project/.ai",
        );
    });

    it("falls back to the newest legacy file entry in the same directory", () => {
        const aiDirectory = join(process.cwd(), ".ai");
        writeFileSync(
            statePath,
            JSON.stringify({
                "https://example.com|.ai/old.md": {
                    id: "old-id",
                    url: "/a/old-id/",
                    updatedAt: "2026-08-24T00:00:00.000Z",
                },
                "https://example.com|.ai/new.md": {
                    id: "new-id",
                    url: "/a/new-id/",
                    updatedAt: "2026-08-24T00:00:01.000Z",
                },
            }),
        );

        expect(getEntry(statePath, "https://example.com", aiDirectory)).toEqual(
            {
                id: "new-id",
                url: "/a/new-id/",
                updatedAt: "2026-08-24T00:00:01.000Z",
            },
        );
    });

    it("returns undefined for a path with no saved entry", () => {
        expect(
            getEntry(statePath, "https://example.com", "/some/path"),
        ).toBeUndefined();
    });

    it("round-trips a saved entry through separate calls", () => {
        setEntry(statePath, "https://example.com", "/some/path", {
            id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
            url: "/a/01ARZ3NDEKTSV4RRFFQ69G5FAV/",
            updatedAt: "2026-08-24T00:00:00.000Z",
        });

        const entry = getEntry(statePath, "https://example.com", "/some/path");
        expect(entry?.id).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    });

    it("keeps entries for different servers separate even for the same local path", () => {
        setEntry(statePath, "https://a.example.com", "/some/path", {
            id: "id-a",
            url: "/a/id-a/",
            updatedAt: "2026-08-24T00:00:00.000Z",
        });
        setEntry(statePath, "https://b.example.com", "/some/path", {
            id: "id-b",
            url: "/a/id-b/",
            updatedAt: "2026-08-24T00:00:00.000Z",
        });

        expect(
            getEntry(statePath, "https://a.example.com", "/some/path")?.id,
        ).toBe("id-a");
        expect(
            getEntry(statePath, "https://b.example.com", "/some/path")?.id,
        ).toBe("id-b");
    });

    it("removes an entry so it no longer resolves", () => {
        setEntry(statePath, "https://example.com", "/some/path", {
            id: "id-a",
            url: "/a/id-a/",
            updatedAt: "2026-08-24T00:00:00.000Z",
        });
        removeEntry(statePath, "https://example.com", "/some/path");

        expect(
            getEntry(statePath, "https://example.com", "/some/path"),
        ).toBeUndefined();
    });

    it("removes legacy entries under the same directory", () => {
        writeFileSync(
            statePath,
            JSON.stringify({
                "https://example.com|.ai/old.md": { id: "old-id" },
            }),
        );

        removeEntry(
            statePath,
            "https://example.com",
            join(process.cwd(), ".ai"),
        );

        expect(
            getEntry(
                statePath,
                "https://example.com",
                join(process.cwd(), ".ai"),
            ),
        ).toBeUndefined();
    });

    it("treats a missing state file as empty state rather than throwing", () => {
        const missingPath = join(dir, "does-not-exist", "state.json");
        expect(
            getEntry(missingPath, "https://example.com", "/some/path"),
        ).toBeUndefined();
    });

    it("treats malformed JSON as empty state rather than throwing", () => {
        writeFileSync(statePath, "not valid json{{{");
        expect(
            getEntry(statePath, "https://example.com", "/some/path"),
        ).toBeUndefined();
    });
});
