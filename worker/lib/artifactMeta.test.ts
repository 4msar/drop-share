import { describe, expect, it } from "vitest";
import {
  ARTIFACT_METADATA_FILENAME,
  createArtifactMetadata,
  deriveArtifactLabel,
  deriveAuthStateForMetadata,
  deriveShareToken,
  metadataObjectKey,
  parseArtifactMetadata,
  serializeArtifactMetadata,
  timingSafeEqual,
} from "./artifactMeta.js";

describe("metadataObjectKey", () => {
  it("builds the reserved key under the artifact root", () => {
    expect(metadataObjectKey("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(
      `01ARZ3NDEKTSV4RRFFQ69G5FAV/${ARTIFACT_METADATA_FILENAME}`,
    );
  });
});

describe("createArtifactMetadata / serializeArtifactMetadata / parseArtifactMetadata", () => {
  it("round-trips a freshly created, unprotected metadata object", () => {
    const created = createArtifactMetadata("Client delivery", new Date("2026-08-28T12:00:00.000Z"));
    expect(created).toEqual({
      label: "Client delivery",
      createdAt: "2026-08-28T12:00:00.000Z",
      visibility: "public",
    });

    const parsed = parseArtifactMetadata(serializeArtifactMetadata(created));
    expect(parsed).toEqual(created);
  });

  it("defaults createdAt to now, as ISO 8601, when no date is given", () => {
    const before = Date.now();
    const created = createArtifactMetadata("");
    const after = Date.now();
    const parsedTime = new Date(created.createdAt).getTime();
    expect(parsedTime).toBeGreaterThanOrEqual(before);
    expect(parsedTime).toBeLessThanOrEqual(after);
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
  });

  it("round-trips a protected metadata object", () => {
    const protectedMeta = {
      label: "x",
      createdAt: "2026-08-28T12:00:00.000Z",
      token: "secret",
      visibility: "private" as const,
    };
    expect(parseArtifactMetadata(serializeArtifactMetadata(protectedMeta))).toEqual(protectedMeta);
  });

  it("preserves unknown fields across a parse", () => {
    const raw = JSON.stringify({ label: "x", createdAt: "2026-08-28T12:00:00.000Z", futureField: 42 });
    expect(parseArtifactMetadata(raw)).toEqual({
      label: "x",
      createdAt: "2026-08-28T12:00:00.000Z",
      futureField: 42,
      visibility: "public",
    });
  });

  it("defaults a missing visibility to public", () => {
    const raw = JSON.stringify({ label: "x", createdAt: "2026-08-28T12:00:00.000Z" });
    expect(parseArtifactMetadata(raw)?.visibility).toBe("public");
  });

  it("rejects an unknown visibility value", () => {
    const raw = JSON.stringify({ label: "x", createdAt: "x", token: "t", visibility: "secret" });
    expect(parseArtifactMetadata(raw)).toBeNull();
  });

  it("rejects a private artifact without a token", () => {
    const raw = JSON.stringify({ label: "x", createdAt: "x", visibility: "private" });
    expect(parseArtifactMetadata(raw)).toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseArtifactMetadata("not json{{{")).toBeNull();
  });

  it("rejects a JSON value that isn't a plain object", () => {
    expect(parseArtifactMetadata("[]")).toBeNull();
    expect(parseArtifactMetadata("42")).toBeNull();
    expect(parseArtifactMetadata("null")).toBeNull();
  });

  it("rejects a missing or non-string label/createdAt", () => {
    expect(parseArtifactMetadata(JSON.stringify({ createdAt: "2026-08-28T12:00:00.000Z" }))).toBeNull();
    expect(parseArtifactMetadata(JSON.stringify({ label: "x" }))).toBeNull();
    expect(parseArtifactMetadata(JSON.stringify({ label: 1, createdAt: "x" }))).toBeNull();
  });

  it("rejects a non-string or empty-string token", () => {
    const base = { label: "x", createdAt: "2026-08-28T12:00:00.000Z" };
    expect(parseArtifactMetadata(JSON.stringify({ ...base, token: "" }))).toBeNull();
    expect(parseArtifactMetadata(JSON.stringify({ ...base, token: 123 }))).toBeNull();
  });
});

describe("deriveArtifactLabel", () => {
  it("returns an empty label when there are no paths", () => {
    expect(deriveArtifactLabel([])).toBe("");
  });

  it("labels a single file after its own path", () => {
    expect(deriveArtifactLabel(["index.html"])).toBe("index.html");
    expect(deriveArtifactLabel(["assets/logo.png"])).toBe("assets/logo.png");
  });

  it("labels a shared top-level folder after that folder", () => {
    expect(deriveArtifactLabel(["site/index.html", "site/css/style.css"])).toBe("site");
  });

  it("falls back to a file count for loose files with no shared folder", () => {
    expect(deriveArtifactLabel(["a.txt", "b.txt"])).toBe("2 files");
  });

  it("falls back to a file count when only some files are inside a folder", () => {
    expect(deriveArtifactLabel(["a.txt", "dir/b.txt"])).toBe("2 files");
  });

  it("falls back to a file count when top-level folder names differ", () => {
    expect(deriveArtifactLabel(["one/a.txt", "two/b.txt"])).toBe("2 files");
  });
});

describe("timingSafeEqual", () => {
  it("returns true only for exactly equal strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("deriveShareToken", () => {
  it("is SHA-1 of the owner token as lowercase hex", async () => {
    // SHA-1("abc"), the standard FIPS 180 test vector.
    expect(await deriveShareToken("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });
});

describe("deriveAuthStateForMetadata", () => {
  const base = { label: "x", createdAt: "2026-08-28T12:00:00.000Z", visibility: "public" as const };
  const privateMeta = { ...base, token: "secret", visibility: "private" as const };

  it("is unlocked, modifiable and readable when there is no token", async () => {
    expect(await deriveAuthStateForMetadata(base, null)).toEqual({
      locked: false,
      canModify: true,
      readable: true,
    });
  });

  it("is locked and not modifiable when a token exists but none was supplied", async () => {
    expect(await deriveAuthStateForMetadata({ ...base, token: "secret" }, null)).toEqual({
      locked: true,
      canModify: false,
      readable: true,
    });
  });

  it("is locked and not modifiable when the supplied token is wrong", async () => {
    expect(await deriveAuthStateForMetadata({ ...base, token: "secret" }, "wrong")).toEqual({
      locked: true,
      canModify: false,
      readable: true,
    });
  });

  it("is locked and modifiable when the supplied token matches", async () => {
    expect(await deriveAuthStateForMetadata({ ...base, token: "secret" }, "secret")).toEqual({
      locked: true,
      canModify: true,
      readable: true,
    });
  });

  it("is not readable when private and no token is supplied", async () => {
    expect((await deriveAuthStateForMetadata(privateMeta, null)).readable).toBe(false);
  });

  it("is not readable when private and the share token is wrong", async () => {
    expect((await deriveAuthStateForMetadata(privateMeta, null, "wrong")).readable).toBe(false);
  });

  it("is readable but not modifiable when private with the matching share token", async () => {
    const share = await deriveShareToken("secret");
    expect(await deriveAuthStateForMetadata(privateMeta, null, share)).toEqual({
      locked: true,
      canModify: false,
      readable: true,
    });
  });

  it("never accepts the share token as the owner token", async () => {
    const share = await deriveShareToken("secret");
    expect((await deriveAuthStateForMetadata(privateMeta, share)).canModify).toBe(false);
  });

  it("is readable and modifiable when private with the owner token", async () => {
    expect(await deriveAuthStateForMetadata(privateMeta, "secret")).toEqual({
      locked: true,
      canModify: true,
      readable: true,
    });
  });
});
