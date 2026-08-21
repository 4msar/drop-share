import { describe, expect, it } from "vitest";
import { buildObjectKey, normalizeRelativePath } from "./paths.js";

describe("normalizeRelativePath", () => {
  it("accepts a plain filename", () => {
    expect(normalizeRelativePath("index.html")).toBe("index.html");
  });

  it("accepts a nested relative path", () => {
    expect(normalizeRelativePath("css/style.css")).toBe("css/style.css");
  });

  it("strips a leading ./", () => {
    expect(normalizeRelativePath("./index.html")).toBe("index.html");
  });

  it("collapses duplicate slashes", () => {
    expect(normalizeRelativePath("a//b.txt")).toBe("a/b.txt");
  });

  it("preserves unicode filenames", () => {
    expect(normalizeRelativePath("日本語ファイル.txt")).toBe("日本語ファイル.txt");
  });

  it("rejects path traversal anywhere in the path", () => {
    expect(normalizeRelativePath("../etc/passwd")).toBeNull();
    expect(normalizeRelativePath("css/../../etc/passwd")).toBeNull();
    expect(normalizeRelativePath("a/b/../../../c")).toBeNull();
    expect(normalizeRelativePath("..")).toBeNull();
  });

  it("rejects absolute unix paths", () => {
    expect(normalizeRelativePath("/etc/passwd")).toBeNull();
  });

  it("rejects absolute windows drive paths", () => {
    expect(normalizeRelativePath("C:\\Windows\\file")).toBeNull();
    expect(normalizeRelativePath("C:/Windows/file")).toBeNull();
  });

  it("rejects any backslash (ambiguous path separator)", () => {
    expect(normalizeRelativePath("css\\style.css")).toBeNull();
  });

  it("rejects null bytes and other control characters", () => {
    expect(normalizeRelativePath("file\u0000.txt")).toBeNull();
    expect(normalizeRelativePath("file\u0001.txt")).toBeNull();
  });

  it("rejects empty or root-only paths", () => {
    expect(normalizeRelativePath("")).toBeNull();
    expect(normalizeRelativePath(".")).toBeNull();
    expect(normalizeRelativePath("/")).toBeNull();
  });

  it("rejects a trailing slash (directory, not a file)", () => {
    expect(normalizeRelativePath("folder/")).toBeNull();
  });

  it("rejects paths longer than 1024 characters", () => {
    expect(normalizeRelativePath("a".repeat(1025))).toBeNull();
  });
});

describe("buildObjectKey", () => {
  it("joins the artifact id and a normalized relative path", () => {
    expect(buildObjectKey("01ARZ3NDEKTSV4RRFFQ69G5FAV", "css/style.css")).toBe(
      "01ARZ3NDEKTSV4RRFFQ69G5FAV/css/style.css",
    );
  });

  it("throws if given an invalid artifact id", () => {
    expect(() => buildObjectKey("../etc", "file.txt")).toThrow();
  });

  it("throws if given a path that fails normalization", () => {
    expect(() => buildObjectKey("01ARZ3NDEKTSV4RRFFQ69G5FAV", "../etc/passwd")).toThrow();
  });
});
