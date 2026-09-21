import { afterEach, describe, expect, it, vi } from "vitest";
import {
    lockArtifact,
    sortFiles,
    uploadIntoArtifact,
    type ArtifactFile,
} from "./artifact";

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

describe("lockArtifact", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("PATCHes the artifact with the given token", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify({ success: true }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await lockArtifact("artifact-1", "derived-hash");

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/artifact/artifact-1",
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ lock: true, token: "derived-hash" }),
            }),
        );
    });

    it("throws when the server rejects the lock", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            success: false,
                            error: "Artifact is already protected",
                        }),
                        {
                            status: 409,
                            headers: { "Content-Type": "application/json" },
                        },
                    ),
            ),
        );

        await expect(lockArtifact("artifact-1", "derived-hash")).rejects.toThrow(
            "Artifact is already protected",
        );
    });
});

describe("uploadIntoArtifact", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function okUpload() {
        const fetchMock = vi.fn<typeof fetch>(
            async () =>
                new Response(JSON.stringify({ success: true }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        );
        vi.stubGlobal("fetch", fetchMock);
        return fetchMock;
    }

    it("preserves each item's relative path under the current sub-path", async () => {
        const fetchMock = okUpload();

        await uploadIntoArtifact(
            "artifact-1",
            "css/",
            [
                { file: new File(["x"], "app.css"), relativePath: "app.css" },
                {
                    file: new File(["y"], "logo.svg"),
                    relativePath: "assets/logo.svg",
                },
            ],
            null,
        );

        const form = fetchMock.mock.calls[0]![1]!.body as FormData;
        expect(form.get("mode")).toBe("directory");
        expect(form.get("id")).toBe("artifact-1");
        const names = form.getAll("files").map((f) => (f as File).name);
        expect(names).toEqual(["css/app.css", "css/assets/logo.svg"]);
    });

    it("sends the token as X-Artifact-Token when provided", async () => {
        const fetchMock = okUpload();

        await uploadIntoArtifact(
            "artifact-1",
            "",
            [{ file: new File(["x"], "a.txt"), relativePath: "a.txt" }],
            "derived-hash",
        );

        const headers = fetchMock.mock.calls[0]![1]!.headers as Record<
            string,
            string
        >;
        expect(headers["X-Artifact-Token"]).toBe("derived-hash");
    });

    it("throws with the server's error message on failure", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({ success: false, error: "Forbidden" }),
                        {
                            status: 403,
                            headers: { "Content-Type": "application/json" },
                        },
                    ),
            ),
        );

        await expect(
            uploadIntoArtifact(
                "artifact-1",
                "",
                [{ file: new File(["x"], "a.txt"), relativePath: "a.txt" }],
                null,
            ),
        ).rejects.toThrow("Forbidden");
    });
});
