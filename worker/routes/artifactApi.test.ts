import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://artifacts.example.com";

async function upload(files: { name: string; content: string }[]) {
  const form = new FormData();
  form.set("mode", "directory");
  for (const file of files) {
    form.append("files", new File([new TextEncoder().encode(file.content)], file.name));
  }
  const response = await exports.default.fetch(
    new Request(`${ORIGIN}/api/upload`, { method: "POST", body: form }),
  );
  return response.json() as Promise<{ id: string; url: string }>;
}

interface ListedFile {
  name: string;
  size: number;
  contentType?: string;
  previewable: boolean;
  markdown: boolean;
}

async function listing(id: string, path?: string) {
  const query = path === undefined ? "" : `?path=${encodeURIComponent(path)}`;
  const response = await exports.default.fetch(`${ORIGIN}/api/artifact/${id}${query}`);
  return {
    status: response.status,
    body: (await response.json()) as {
      success: boolean;
      path?: string;
      files: ListedFile[];
      directories: string[];
    },
  };
}

describe("GET /api/artifact/:id - subdirectory listings", () => {
  it("lists the immediate children of a subdirectory", async () => {
    const { id } = await upload([
      { name: "index.html", content: "root" },
      { name: "css/style.css", content: "css" },
      { name: "css/vendor/lib.css", content: "vendor" },
    ]);

    const { status, body } = await listing(id, "css/");
    expect(status).toBe(200);
    expect(body.path).toBe("css/");
    expect(body.files.map((f) => f.name)).toEqual(["style.css"]);
    expect(body.directories).toEqual(["vendor/"]);
  });

  it("accepts a subdirectory path with no trailing slash", async () => {
    const { id } = await upload([{ name: "css/style.css", content: "css" }]);
    const { status, body } = await listing(id, "css");
    expect(status).toBe(200);
    expect(body.files.map((f) => f.name)).toEqual(["style.css"]);
  });

  it("404s a subdirectory that holds nothing", async () => {
    const { id } = await upload([{ name: "index.html", content: "root" }]);
    expect((await listing(id, "nope/")).status).toBe(404);
  });

  it("404s a path-traversal attempt instead of listing outside the artifact", async () => {
    const { id } = await upload([{ name: "index.html", content: "root" }]);
    expect((await listing(id, "../")).status).toBe(404);
    expect((await listing(id, "a/../../")).status).toBe(404);
  });
});

describe("GET /api/artifact/:id - preview flags", () => {
  it("marks inline-safe files previewable and everything else not", async () => {
    const { id } = await upload([
      { name: "page.html", content: "<h1>hi</h1>" },
      { name: "photo.png", content: "not really a png" },
      { name: "archive.bin", content: "opaque bytes" },
    ]);

    const { body } = await listing(id);
    const byName = new Map(body.files.map((f) => [f.name, f]));
    expect(byName.get("page.html")?.previewable).toBe(true);
    expect(byName.get("photo.png")?.previewable).toBe(true);
    expect(byName.get("archive.bin")?.previewable).toBe(false);
  });

  it("flags markdown files so the client can offer a source toggle", async () => {
    const { id } = await upload([
      { name: "readme.md", content: "# hi" },
      { name: "notes.txt", content: "hi" },
    ]);

    const { body } = await listing(id);
    const byName = new Map(body.files.map((f) => [f.name, f]));
    expect(byName.get("readme.md")?.markdown).toBe(true);
    expect(byName.get("readme.md")?.previewable).toBe(true);
    expect(byName.get("notes.txt")?.markdown).toBe(false);
  });
});
