import { describe, expect, it } from "vitest";
import { generateArtifactId, isValidArtifactId } from "./ids.js";

describe("generateArtifactId", () => {
  it("produces a 26-character Crockford base32 ULID", () => {
    const id = generateArtifactId();
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("never reuses an id across many generations", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateArtifactId()));
    expect(ids.size).toBe(1000);
  });

  it("is lexicographically sortable by creation order", () => {
    // The random suffix can vary even for two ids sharing the same millisecond,
    // so only the 10-char timestamp prefix is guaranteed non-decreasing.
    const firstPrefix = generateArtifactId().slice(0, 10);
    const secondPrefix = generateArtifactId().slice(0, 10);
    expect(firstPrefix <= secondPrefix).toBe(true);
  });
});

describe("isValidArtifactId", () => {
  it("accepts a freshly generated id", () => {
    expect(isValidArtifactId(generateArtifactId())).toBe(true);
  });

  it("rejects ids with disallowed characters (I, L, O, U)", () => {
    expect(isValidArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FAI")).toBe(false);
    expect(isValidArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FAL")).toBe(false);
    expect(isValidArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FAO")).toBe(false);
    expect(isValidArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FAU")).toBe(false);
  });

  it("rejects the wrong length", () => {
    expect(isValidArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FA")).toBe(false);
    expect(isValidArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FA00")).toBe(false);
  });

  it("rejects path traversal and slashes", () => {
    expect(isValidArtifactId("../../etc/passwd")).toBe(false);
    expect(isValidArtifactId("01ARZ3NDEKTSV4RRFFQ6/G5FA")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidArtifactId("")).toBe(false);
  });
});
