import { describe, expect, it } from "vitest";
import {
  ARTIFACT_METADATA_FILENAME,
  createArtifactMetadata,
  deriveAuthStateForMetadata,
  generateArtifactToken,
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
    expect(created).toEqual({ label: "Client delivery", createdAt: "2026-08-28T12:00:00.000Z" });

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
    const protectedMeta = { label: "x", createdAt: "2026-08-28T12:00:00.000Z", token: "secret" };
    expect(parseArtifactMetadata(serializeArtifactMetadata(protectedMeta))).toEqual(protectedMeta);
  });

  it("preserves unknown fields across a parse", () => {
    const raw = JSON.stringify({ label: "x", createdAt: "2026-08-28T12:00:00.000Z", futureField: 42 });
    expect(parseArtifactMetadata(raw)).toEqual({
      label: "x",
      createdAt: "2026-08-28T12:00:00.000Z",
      futureField: 42,
    });
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

describe("timingSafeEqual", () => {
  it("returns true only for exactly equal strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("generateArtifactToken", () => {
  it("generates long, URL-safe, unpredictable tokens", () => {
    const a = generateArtifactToken();
    const b = generateArtifactToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("deriveAuthStateForMetadata", () => {
  const base = { label: "x", createdAt: "2026-08-28T12:00:00.000Z" };

  it("is unlocked and modifiable when there is no token", () => {
    expect(deriveAuthStateForMetadata(base, null)).toEqual({ locked: false, canModify: true });
  });

  it("is locked and not modifiable when a token exists but none was supplied", () => {
    expect(deriveAuthStateForMetadata({ ...base, token: "secret" }, null)).toEqual({
      locked: true,
      canModify: false,
    });
  });

  it("is locked and not modifiable when the supplied token is wrong", () => {
    expect(deriveAuthStateForMetadata({ ...base, token: "secret" }, "wrong")).toEqual({
      locked: true,
      canModify: false,
    });
  });

  it("is locked and modifiable when the supplied token matches", () => {
    expect(deriveAuthStateForMetadata({ ...base, token: "secret" }, "secret")).toEqual({
      locked: true,
      canModify: true,
    });
  });
});
