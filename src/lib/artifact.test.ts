import { describe, expect, it } from "vitest";
import { sortFiles, type ArtifactFile } from "./artifact";

function file(name: string, uploaded: string): ArtifactFile {
    return {
        name,
        size: 1,
        uploaded,
        previewable: false,
        markdown: false,
    };
}

describe("sortFiles", () => {
    it("shows newest uploads first by default", () => {
        const files = [
            file("alpha.txt", "2024-01-01T00:00:00.000Z"),
            file("zeta.txt", "2024-01-03T00:00:00.000Z"),
            file("mid.txt", "2024-01-02T00:00:00.000Z"),
        ];

        expect(sortFiles(files).map((file) => file.name)).toEqual([
            "zeta.txt",
            "mid.txt",
            "alpha.txt",
        ]);
    });

    it("can sort alphabetically instead", () => {
        const files = [
            file("zeta.txt", "2024-01-03T00:00:00.000Z"),
            file("alpha.txt", "2024-01-01T00:00:00.000Z"),
            file("mid.txt", "2024-01-02T00:00:00.000Z"),
        ];

        expect(sortFiles(files, "name").map((file) => file.name)).toEqual([
            "alpha.txt",
            "mid.txt",
            "zeta.txt",
        ]);
    });
});
