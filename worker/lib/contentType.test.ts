import { describe, expect, it } from "vitest";
import { getContentType, isInlineSafe, isScriptCapableDocument } from "./contentType.js";

describe("getContentType", () => {
  it("maps common extensions to their MIME type", () => {
    expect(getContentType("index.html")).toBe("text/html; charset=utf-8");
    expect(getContentType("style.css")).toBe("text/css; charset=utf-8");
    expect(getContentType("app.js")).toBe("text/javascript; charset=utf-8");
    expect(getContentType("data.json")).toBe("application/json; charset=utf-8");
    expect(getContentType("photo.png")).toBe("image/png");
    expect(getContentType("photo.jpg")).toBe("image/jpeg");
    expect(getContentType("photo.jpeg")).toBe("image/jpeg");
    expect(getContentType("icon.svg")).toBe("image/svg+xml");
    expect(getContentType("doc.pdf")).toBe("application/pdf");
    expect(getContentType("archive.zip")).toBe("application/zip");
    expect(getContentType("notes.txt")).toBe("text/plain; charset=utf-8");
  });

  it("is case-insensitive on the extension", () => {
    expect(getContentType("PHOTO.PNG")).toBe("image/png");
  });

  it("falls back to application/octet-stream for unknown extensions", () => {
    expect(getContentType("mystery.xyz123")).toBe("application/octet-stream");
  });

  it("falls back to application/octet-stream for a filename with no extension", () => {
    expect(getContentType("README")).toBe("application/octet-stream");
  });
});

describe("isInlineSafe", () => {
  it("allows inline rendering for inert types", () => {
    expect(isInlineSafe("text/plain; charset=utf-8")).toBe(true);
    expect(isInlineSafe("text/css; charset=utf-8")).toBe(true);
    expect(isInlineSafe("application/json; charset=utf-8")).toBe(true);
    expect(isInlineSafe("image/png")).toBe(true);
    expect(isInlineSafe("image/jpeg")).toBe(true);
    expect(isInlineSafe("application/pdf")).toBe(true);
  });

  it("allows inline rendering for HTML, JS, and SVG (paired with the sandbox CSP where it matters)", () => {
    expect(isInlineSafe("text/html; charset=utf-8")).toBe(true);
    expect(isInlineSafe("text/javascript; charset=utf-8")).toBe(true);
    expect(isInlineSafe("image/svg+xml")).toBe(true);
  });

  it("forces download for unknown/binary types", () => {
    expect(isInlineSafe("application/octet-stream")).toBe(false);
    expect(isInlineSafe("application/zip")).toBe(false);
  });
});

describe("isScriptCapableDocument", () => {
  it("flags HTML and SVG - the only types that execute embedded script when opened directly", () => {
    expect(isScriptCapableDocument("text/html; charset=utf-8")).toBe(true);
    expect(isScriptCapableDocument("image/svg+xml")).toBe(true);
  });

  it("does not flag plain JS/CSS - opening them directly just displays text, it doesn't execute anything", () => {
    expect(isScriptCapableDocument("text/javascript; charset=utf-8")).toBe(false);
    expect(isScriptCapableDocument("text/css; charset=utf-8")).toBe(false);
  });

  it("does not flag images or other inert inline types", () => {
    expect(isScriptCapableDocument("image/png")).toBe(false);
    expect(isScriptCapableDocument("application/pdf")).toBe(false);
  });
});
