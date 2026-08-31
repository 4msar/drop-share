import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { listArtifactChildren } from "../lib/r2.js";

function uploadRequest(
    mode: string,
    files: { name: string; content: string | Uint8Array }[],
): Request {
    const form = new FormData();
    form.set("mode", mode);
    for (const file of files) {
        const bytes =
            typeof file.content === "string"
                ? new TextEncoder().encode(file.content)
                : file.content;
        form.append("files", new File([bytes], file.name));
    }
    return new Request("https://artifacts.example.com/api/upload", {
        method: "POST",
        body: form,
    });
}

async function upload(
    mode: string,
    files: { name: string; content: string | Uint8Array }[],
) {
    const response = await exports.default.fetch(uploadRequest(mode, files));
    return response.json() as Promise<{
        success: boolean;
        id: string;
        url: string;
    }>;
}

describe("GET /a/:id/* : serving and browsing", () => {
    it("404s for an artifact that was never uploaded", async () => {
        const response = await exports.default.fetch(
            "https://artifacts.example.com/a/01ARZ3NDEKTSV4RRFFQ69G5FAV/",
        );
        expect(response.status).toBe(404);
    });

    it("404s for a malformed artifact id", async () => {
        const response = await exports.default.fetch(
            "https://artifacts.example.com/a/not-a-ulid/",
        );
        expect(response.status).toBe(404);
    });

    it("serves nested files", async () => {
        const { url } = await upload("directory", [
            { name: "index.html", content: "root" },
            { name: "css/style.css", content: "css content" },
            { name: "css/vendor/lib.css", content: "vendor content" },
        ]);

        const nested = await exports.default.fetch(
            `https://artifacts.example.com${url}css/vendor/lib.css`,
        );
        expect(await nested.text()).toBe("vendor content");
    });

    it("rejects an encoded path-traversal attempt that survives URL dot-segment collapsing", async () => {
        const { url } = await upload("file", [
            { name: "safe.txt", content: "safe" },
        ]);
        // %2e%2e is NOT collapsed by URL parsing (unlike a literal ".."), so this
        // exercises the app's own normalizeRelativePath defense, not the URL parser's.
        const response = await exports.default.fetch(
            `https://artifacts.example.com${url}%2e%2e/secret`,
        );
        expect(response.status).toBe(404);
    });

    it("returns 404 for a nested path that doesn't exist", async () => {
        const { url } = await upload("file", [
            { name: "safe.txt", content: "safe" },
        ]);
        const response = await exports.default.fetch(
            `https://artifacts.example.com${url}nope.txt`,
        );
        expect(response.status).toBe(404);
    });

    it("serves file bytes with a revalidate-always cache policy, since files can be updated in place", async () => {
        const { url } = await upload("file", [
            { name: "safe.txt", content: "safe" },
        ]);
        const response = await exports.default.fetch(
            `https://artifacts.example.com${url}safe.txt`,
        );
        expect(response.headers.get("cache-control")).toBe(
            "public, max-age=0, must-revalidate",
        );
        expect(response.headers.get("etag")).toBeTruthy();
    });

    it("returns 304 when the client's If-None-Match matches the file's current ETag", async () => {
        const { url } = await upload("file", [
            { name: "safe.txt", content: "safe" },
        ]);
        const first = await exports.default.fetch(
            `https://artifacts.example.com${url}safe.txt`,
        );
        const etag = first.headers.get("etag");
        expect(etag).toBeTruthy();

        const second = await exports.default.fetch(
            `https://artifacts.example.com${url}safe.txt`,
            {
                headers: { "If-None-Match": etag! },
            },
        );
        expect(second.status).toBe(304);
    });

    it("does not cache the artifact listing, since an artifact's contents can change", async () => {
        const { id } = await upload("directory", [
            { name: "a.txt", content: "a" },
            { name: "b.txt", content: "b" },
        ]);
        const response = await exports.default.fetch(
            `https://artifacts.example.com/api/artifact/${id}`,
        );
        expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("renders HTML inline, sandboxed into an opaque origin", async () => {
        const { url } = await upload("file", [
            { name: "page.html", content: "<script>alert(1)</script>" },
        ]);
        const response = await exports.default.fetch(
            `https://artifacts.example.com${url}page.html`,
        );
        expect(response.headers.get("content-disposition")).toContain("inline");
        const csp = response.headers.get("content-security-policy") ?? "";
        expect(csp).toContain("sandbox");
        expect(csp).not.toContain("allow-same-origin");
    });

    it("renders SVG inline, also sandboxed (it can carry <script> like HTML can)", async () => {
        const { url } = await upload("file", [
            { name: "icon.svg", content: "<svg onload='alert(1)'></svg>" },
        ]);
        const response = await exports.default.fetch(
            `https://artifacts.example.com${url}icon.svg`,
        );
        expect(response.headers.get("content-disposition")).toContain("inline");
        expect(response.headers.get("content-security-policy") ?? "").toContain(
            "sandbox",
        );
    });

    it("does not sandbox plain JS/CSS - they can't execute merely by being opened directly", async () => {
        const { url } = await upload("file", [
            { name: "app.js", content: "console.log(1)" },
        ]);
        const response = await exports.default.fetch(
            `https://artifacts.example.com${url}app.js`,
        );
        expect(response.headers.get("content-disposition")).toContain("inline");
        expect(response.headers.get("content-security-policy")).toBeNull();
    });

    it("allows inline rendering for genuinely inert types like plain text", async () => {
        const { url } = await upload("file", [
            { name: "notes.txt", content: "hello" },
        ]);
        const response = await exports.default.fetch(
            `https://artifacts.example.com${url}notes.txt`,
        );
        expect(response.headers.get("content-disposition")).toContain("inline");
    });

    it("renders markdown to sandboxed HTML when requested with ?render=html", async () => {
        const { url } = await upload("file", [
            { name: "notes.md", content: "# Hello\n\nSome *text*." },
        ]);
        const response = await exports.default.fetch(
            `https://artifacts.example.com${url}notes.md?render=html`,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/html");
        const csp = response.headers.get("content-security-policy") ?? "";
        expect(csp).toContain("sandbox");
        expect(csp).not.toContain("allow-same-origin");
        const html = await response.text();
        expect(html).toContain("<h1>Hello</h1>");
        expect(html).toContain("<em>text</em>");
    });

    it("still serves the raw markdown source when the render query param is absent", async () => {
        const { url } = await upload("file", [
            { name: "notes.md", content: "# Hello" },
        ]);
        const response = await exports.default.fetch(
            `https://artifacts.example.com${url}notes.md`,
        );

        expect(response.headers.get("content-type")).toContain("text/markdown");
        expect(await response.text()).toBe("# Hello");
    });

    it("redirects to add a trailing slash when a directory is requested without one", async () => {
        const { url } = await upload("directory", [
            { name: "css/style.css", content: "x" },
        ]);
        const withoutSlash = `${url}css`;
        const response = await exports.default.fetch(
            `https://artifacts.example.com${withoutSlash}`,
            {
                redirect: "manual",
            },
        );
        expect(response.status).toBe(301);
        expect(response.headers.get("location")).toBe(
            `https://artifacts.example.com${url}css/`,
        );
    });
});

describe("DELETE /api/artifact/:id", () => {
    it("deletes an artifact and its files stop resolving afterwards", async () => {
        const { id, url } = await upload("file", [
            { name: "bye.txt", content: "bye" },
        ]);

        const deleteResponse = await exports.default.fetch(
            `https://artifacts.example.com/api/artifact/${id}`,
            {
                method: "DELETE",
            },
        );
        expect(deleteResponse.status).toBe(200);

        const afterDelete = await exports.default.fetch(
            `https://artifacts.example.com${url}bye.txt`,
        );
        expect(afterDelete.status).toBe(404);
    });

    it("404s when deleting an artifact that doesn't exist", async () => {
        const response = await exports.default.fetch(
            "https://artifacts.example.com/api/artifact/01ARZ3NDEKTSV4RRFFQ69G5FAV",
            { method: "DELETE" },
        );
        expect(response.status).toBe(404);
    });

    it("does not allow GET/POST on the artifact id after deletion, and a fresh upload never reuses the id", async () => {
        const { id } = await upload("file", [
            { name: "once.txt", content: "x" },
        ]);
        await exports.default.fetch(
            `https://artifacts.example.com/api/artifact/${id}`,
            { method: "DELETE" },
        );

        const next = await upload("file", [{ name: "once.txt", content: "x" }]);
        expect(next.id).not.toBe(id);
    });
});

describe("GET /api/artifact/:id", () => {
    it("returns JSON listing for an existing artifact", async () => {
        const { id } = await upload("directory", [
            { name: "a.txt", content: "a" },
            { name: "dir/b.txt", content: "b" },
        ]);
        const response = await exports.default.fetch(
            `https://artifacts.example.com/api/artifact/${id}`,
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.directories).toContain("dir/");
        expect(body.files.map((f: { name: string }) => f.name)).toContain(
            "a.txt",
        );
    });

    it("sorts files alphabetically by name before listing them", async () => {
        const bucket = {
            list: async () => ({
                objects: [
                    {
                        key: "artifact/zeta.txt",
                        size: 1,
                        uploaded: new Date("2024-01-01T00:00:00Z"),
                        httpMetadata: {},
                    },
                    {
                        key: "artifact/alpha.txt",
                        size: 1,
                        uploaded: new Date("2024-01-03T00:00:00Z"),
                        httpMetadata: {},
                    },
                    {
                        key: "artifact/mid.txt",
                        size: 1,
                        uploaded: new Date("2024-01-02T00:00:00Z"),
                        httpMetadata: {},
                    },
                ],
                delimitedPrefixes: [],
                truncated: false,
                cursor: "",
            }),
        } as unknown as R2Bucket;

        const listing = await listArtifactChildren(bucket, "artifact/");
        expect(listing.files.map((file) => file.name)).toEqual([
            "alpha.txt",
            "mid.txt",
            "zeta.txt",
        ]);
    });

    it("sorts duplicate file names by newest upload date first", async () => {
        const bucket = {
            list: async () => ({
                objects: [
                    {
                        key: "artifact/report.txt",
                        size: 1,
                        uploaded: new Date("2024-01-01T00:00:00Z"),
                        httpMetadata: {},
                    },
                    {
                        key: "artifact/report.txt",
                        size: 2,
                        uploaded: new Date("2024-01-03T00:00:00Z"),
                        httpMetadata: {},
                    },
                ],
                delimitedPrefixes: [],
                truncated: false,
                cursor: "",
            }),
        } as unknown as R2Bucket;

        const listing = await listArtifactChildren(bucket, "artifact/");
        expect(
            listing.files.map((file) => file.uploaded.toISOString()),
        ).toEqual(["2024-01-03T00:00:00.000Z", "2024-01-01T00:00:00.000Z"]);
    });

    it("404s for a nonexistent artifact", async () => {
        const response = await exports.default.fetch(
            "https://artifacts.example.com/api/artifact/01ARZ3NDEKTSV4RRFFQ69G5FAV",
        );
        expect(response.status).toBe(404);
    });
});
