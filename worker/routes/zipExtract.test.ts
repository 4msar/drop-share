import { exports } from "cloudflare:workers";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

function zipExtractRequest(zipBytes: Uint8Array, filename = "archive.zip"): Request {
  const form = new FormData();
  form.set("mode", "zip-extract");
  form.append("files", new File([zipBytes], filename));
  return new Request("https://artifacts.example.com/api/upload", { method: "POST", body: form });
}

function textZip(files: Record<string, string>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) encoded[name] = new TextEncoder().encode(content);
  return zipSync(encoded);
}

describe("POST /api/upload: mode=zip-extract", () => {
  it("extracts a valid archive into a browsable artifact", async () => {
    const zip = textZip({
      "index.html": "<h1>site</h1>",
      "css/style.css": "body{color:blue}",
    });
    const response = await exports.default.fetch(zipExtractRequest(zip));
    expect(response.status).toBe(200);
    const body = await response.json();

    const index = await exports.default.fetch(`https://artifacts.example.com${body.url}index.html`);
    expect(await index.text()).toBe("<h1>site</h1>");

    const css = await exports.default.fetch(`https://artifacts.example.com${body.url}css/style.css`);
    expect(await css.text()).toBe("body{color:blue}");
  });

  it("rejects a ZIP whose entries contain path traversal", async () => {
    const zip = textZip({ "../evil.txt": "bad" });
    const response = await exports.default.fetch(zipExtractRequest(zip));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it("rejects a ZIP file itself over the 10MB limit", async () => {
    // Not a real zip - the size check happens before any parsing is attempted.
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    const response = await exports.default.fetch(zipExtractRequest(oversized));
    expect(response.status).toBe(413);
  });

  it("rejects a ZIP whose extracted content would exceed the 10MB artifact limit", async () => {
    const zip = textZip({ "big.txt": "x".repeat(11 * 1024 * 1024) });
    const response = await exports.default.fetch(zipExtractRequest(zip));
    expect(response.status).toBe(413);
  });

  it("rejects a malformed (non-ZIP) archive", async () => {
    const garbage = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);
    const response = await exports.default.fetch(zipExtractRequest(garbage));
    expect(response.status).toBe(400);
  });
});
