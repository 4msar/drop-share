import { describe, expect, it } from "vitest";
import { getContentType, isInlineSafe } from "./contentType.js";

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

  it("forces download for anything that can execute script in a browser", () => {
    expect(isInlineSafe("text/html; charset=utf-8")).toBe(false);
    expect(isInlineSafe("text/javascript; charset=utf-8")).toBe(false);
    expect(isInlineSafe("application/javascript")).toBe(false);
    expect(isInlineSafe("image/svg+xml")).toBe(false);
  });

  it("forces download for unknown/binary types", () => {
    expect(isInlineSafe("application/octet-stream")).toBe(false);
    expect(isInlineSafe("application/zip")).toBe(false);
  });
});
