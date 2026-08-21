import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

function uploadRequest(
  mode: string,
  files: { name: string; content: string | Uint8Array }[],
  extraFields: Record<string, string> = {},
): Request {
  const form = new FormData();
  form.set("mode", mode);
  for (const [key, value] of Object.entries(extraFields)) form.set(key, value);
  for (const file of files) {
    const bytes = typeof file.content === "string" ? new TextEncoder().encode(file.content) : file.content;
    form.append("files", new File([bytes], file.name));
  }
  return new Request("https://artifacts.example.com/api/upload", { method: "POST", body: form });
}

describe("POST /api/upload: mode=file", () => {
  it("uploads a single file and returns an immutable artifact url", async () => {
    const response = await exports.default.fetch(uploadRequest("file", [{ name: "hello.txt", content: "hi" }]));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(body.url).toBe(`/a/${body.id}/`);
  });

  it("creates a distinct artifact id for a second upload of the same filename (never overwrites)", async () => {
    const first = await (
      await exports.default.fetch(uploadRequest("file", [{ name: "dup.txt", content: "first" }]))
    ).json();
    const second = await (
      await exports.default.fetch(uploadRequest("file", [{ name: "dup.txt", content: "second" }]))
    ).json();

    expect(first.id).not.toBe(second.id);

    const firstContent = await (await exports.default.fetch(`https://artifacts.example.com${first.url}dup.txt`)).text();
    const secondContent = await (
      await exports.default.fetch(`https://artifacts.example.com${second.url}dup.txt`)
    ).text();
    expect(firstContent).toBe("first");
    expect(secondContent).toBe("second");
  });

  it("supports unicode filenames", async () => {
    const response = await exports.default.fetch(
      uploadRequest("file", [{ name: "日本語ファイル.txt", content: "hello" }]),
    );
    const body = await response.json();
    expect(response.status).toBe(200);

    const fileResponse = await exports.default.fetch(`https://artifacts.example.com${body.url}日本語ファイル.txt`);
    expect(await fileResponse.text()).toBe("hello");
  });

  it("rejects a path-traversal filename", async () => {
    const response = await exports.default.fetch(
      uploadRequest("file", [{ name: "../../etc/passwd", content: "bad" }]),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it("allows an empty file", async () => {
    const response = await exports.default.fetch(uploadRequest("file", [{ name: "empty.txt", content: "" }]));
    expect(response.status).toBe(200);
  });

  it("rejects a file over the 10MB limit with 413", async () => {
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    const response = await exports.default.fetch(uploadRequest("file", [{ name: "big.bin", content: oversized }]));
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it("rejects more than one file for mode=file", async () => {
    const response = await exports.default.fetch(
      uploadRequest("file", [
        { name: "a.txt", content: "a" },
        { name: "b.txt", content: "b" },
      ]),
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/upload: mode=zip", () => {
  it("stores the zip unchanged and serves it as a download", async () => {
    const zipBytes = new Uint8Array([1, 2, 3, 4]); // content doesn't matter, it's stored as-is
    const response = await exports.default.fetch(uploadRequest("zip", [{ name: "release.zip", content: zipBytes }]));
    expect(response.status).toBe(200);
    const body = await response.json();

    const fileResponse = await exports.default.fetch(`https://artifacts.example.com${body.url}release.zip`);
    expect(fileResponse.headers.get("content-type")).toBe("application/zip");
    expect(fileResponse.headers.get("content-disposition")).toContain("attachment");
    const bytesBack = new Uint8Array(await fileResponse.arrayBuffer());
    expect(Array.from(bytesBack)).toEqual([1, 2, 3, 4]);
  });
});

describe("POST /api/upload: mode=directory", () => {
  it("preserves relative paths and creates a browsable directory artifact", async () => {
    const response = await exports.default.fetch(
      uploadRequest("directory", [
        { name: "index.html", content: "<h1>hi</h1>" },
        { name: "css/style.css", content: "body{}" },
        { name: "js/app.js", content: "console.log(1)" },
      ]),
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    const indexResponse = await exports.default.fetch(`https://artifacts.example.com${body.url}index.html`);
    expect(await indexResponse.text()).toBe("<h1>hi</h1>");

    const cssResponse = await exports.default.fetch(`https://artifacts.example.com${body.url}css/style.css`);
    expect(await cssResponse.text()).toBe("body{}");

    const dirPage = await exports.default.fetch(`https://artifacts.example.com${body.url}`);
    expect(dirPage.status).toBe(200);
    expect(dirPage.headers.get("content-type")).toContain("text/html");
  });

  it("rejects an unsafe relative path inside a directory upload", async () => {
    const response = await exports.default.fetch(
      uploadRequest("directory", [{ name: "../escape.txt", content: "bad" }]),
    );
    expect(response.status).toBe(400);
  });

  it("rejects when total directory size exceeds the 10MB artifact limit", async () => {
    const chunk = new Uint8Array(4 * 1024 * 1024); // 4MB each, 3 files = 12MB > 10MB
    const response = await exports.default.fetch(
      uploadRequest("directory", [
        { name: "a.bin", content: chunk },
        { name: "b.bin", content: chunk },
        { name: "c.bin", content: chunk },
      ]),
    );
    expect(response.status).toBe(413);
  });

  it("allows a directory whose total is under the 10MB limit", async () => {
    const chunk = new Uint8Array(3 * 1024 * 1024); // 3MB each, 3 files = 9MB <= 10MB
    const response = await exports.default.fetch(
      uploadRequest("directory", [
        { name: "a.bin", content: chunk },
        { name: "b.bin", content: chunk },
        { name: "c.bin", content: chunk },
      ]),
    );
    expect(response.status).toBe(200);
  });

  it("rejects a directory upload with more files than the configured maximum, even at zero total bytes", async () => {
    // Regression test: many empty files can't be caught by the byte-size
    // budget at all, so file *count* needs its own independent limit.
    const files = Array.from({ length: 2001 }, (_, i) => ({ name: `f${i}.txt`, content: "" }));
    const response = await exports.default.fetch(uploadRequest("directory", files));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

describe("POST /api/upload: validation", () => {
  it("rejects a missing mode", async () => {
    const form = new FormData();
    form.append("files", new File([new TextEncoder().encode("x")], "a.txt"));
    const response = await exports.default.fetch(
      new Request("https://artifacts.example.com/api/upload", { method: "POST", body: form }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a request with no files", async () => {
    const form = new FormData();
    form.set("mode", "file");
    const response = await exports.default.fetch(
      new Request("https://artifacts.example.com/api/upload", { method: "POST", body: form }),
    );
    expect(response.status).toBe(400);
  });
});
