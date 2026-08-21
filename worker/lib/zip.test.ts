import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { PayloadTooLargeError } from "./validation.js";
import { ZipValidationError, extractZipSafely } from "./zip.js";

const DEFAULT_LIMITS = { maxTotalBytes: 10 * 1024 * 1024, maxEntryCount: 2000 };

function textEntries(files: Record<string, string>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    encoded[name] = new TextEncoder().encode(content);
  }
  return zipSync(encoded, { level: 6 });
}

/** Little-endian uint32 signature search, used to locate headers to tamper with in tests. */
function findSignature(bytes: Uint8Array, signature: number, from = 0): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = from; i <= bytes.length - 4; i++) {
    if (view.getUint32(i, true) === signature) return i;
  }
  throw new Error("signature not found");
}

function patchUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function patchUint16LE(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, true);
}

describe("extractZipSafely: happy path", () => {
  it("extracts a simple archive preserving relative paths and contents", async () => {
    const zip = textEntries({
      "index.html": "<h1>hi</h1>",
      "css/style.css": "body { color: red; }",
      "js/app.js": "console.log('hi')",
    });

    const files = await extractZipSafely(zip, DEFAULT_LIMITS);
    const byPath = new Map(files.map((f): [string, (typeof files)[number]] => [f.path, f]));

    expect(byPath.size).toBe(3);
    expect(new TextDecoder().decode(byPath.get("index.html")!.data)).toBe("<h1>hi</h1>");
    expect(new TextDecoder().decode(byPath.get("css/style.css")!.data)).toBe("body { color: red; }");
    expect(new TextDecoder().decode(byPath.get("js/app.js")!.data)).toBe("console.log('hi')");
  });

  it("skips explicit directory entries without erroring", async () => {
    const zip = zipSync({
      "dir/": new Uint8Array(0),
      "dir/file.txt": new TextEncoder().encode("content"),
    });
    const files = await extractZipSafely(zip, DEFAULT_LIMITS);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("dir/file.txt");
  });

  it("supports unicode filenames", async () => {
    const zip = textEntries({ "日本語ファイル.txt": "hello" });
    const files = await extractZipSafely(zip, DEFAULT_LIMITS);
    expect(files[0].path).toBe("日本語ファイル.txt");
  });
});

describe("extractZipSafely: malicious paths", () => {
  it("rejects entries that traverse above the artifact root", async () => {
    const zip = textEntries({ "../evil.txt": "bad" });
    await expect(extractZipSafely(zip, DEFAULT_LIMITS)).rejects.toThrow(ZipValidationError);
  });

  it("rejects absolute unix paths", async () => {
    const zip = textEntries({ "/etc/passwd": "bad" });
    await expect(extractZipSafely(zip, DEFAULT_LIMITS)).rejects.toThrow(ZipValidationError);
  });
});

describe("extractZipSafely: malformed / unsupported archives", () => {
  it("rejects a buffer that isn't a ZIP at all", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await expect(extractZipSafely(garbage, DEFAULT_LIMITS)).rejects.toThrow(ZipValidationError);
  });

  it("rejects an archive with more entries than the configured maximum", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) files[`file${i}.txt`] = "x";
    const zip = textEntries(files);
    await expect(extractZipSafely(zip, { ...DEFAULT_LIMITS, maxEntryCount: 5 })).rejects.toThrow(
      ZipValidationError,
    );
  });

  it("rejects an encrypted entry", async () => {
    const zip = textEntries({ "secret.txt": "shh" });
    const centralOffset = findSignature(zip, 0x02014b50);
    const currentFlags = new DataView(zip.buffer).getUint16(centralOffset + 8, true);
    patchUint16LE(zip, centralOffset + 8, currentFlags | 0x1);
    await expect(extractZipSafely(zip, DEFAULT_LIMITS)).rejects.toThrow(ZipValidationError);
  });

  it("rejects an unsupported compression method", async () => {
    const zip = textEntries({ "file.txt": "hello" });
    const centralOffset = findSignature(zip, 0x02014b50);
    patchUint16LE(zip, centralOffset + 10, 99);
    await expect(extractZipSafely(zip, DEFAULT_LIMITS)).rejects.toThrow(ZipValidationError);
  });

  it("rejects a unix symlink entry", async () => {
    const zip = textEntries({ "link.txt": "target" });
    const centralOffset = findSignature(zip, 0x02014b50);
    // version made by: high byte 3 = Unix host
    patchUint16LE(zip, centralOffset + 4, (3 << 8) | 20);
    // external attributes: upper 16 bits carry the unix mode; 0xA1FF = symlink
    patchUint32LE(zip, centralOffset + 38, 0xa1ff << 16);
    await expect(extractZipSafely(zip, DEFAULT_LIMITS)).rejects.toThrow(ZipValidationError);
  });
});

describe("extractZipSafely: size limits", () => {
  it("rejects when the declared uncompressed size exceeds the limit", async () => {
    const zip = textEntries({ "big.txt": "x".repeat(5000) });
    await expect(extractZipSafely(zip, { ...DEFAULT_LIMITS, maxTotalBytes: 1000 })).rejects.toThrow(
      PayloadTooLargeError,
    );
  });

  it("rejects based on actual decompressed bytes even when the declared size lies", async () => {
    // Highly compressible content: 20,000 repeated bytes compress to a tiny payload.
    const zip = textEntries({ "bomb.txt": "A".repeat(20000) });

    const centralOffset = findSignature(zip, 0x02014b50);
    const localOffset = findSignature(zip, 0x04034b50);
    // Lie in both headers: declare only 10 uncompressed bytes.
    patchUint32LE(zip, localOffset + 22, 10);
    patchUint32LE(zip, centralOffset + 24, 10);

    // The lied-about declared size (10 bytes) is well within budget, so only
    // the live decompression ceiling - not the cheap metadata pre-check - can
    // catch this.
    await expect(extractZipSafely(zip, { ...DEFAULT_LIMITS, maxTotalBytes: 1000 })).rejects.toThrow(
      PayloadTooLargeError,
    );
  });
});
