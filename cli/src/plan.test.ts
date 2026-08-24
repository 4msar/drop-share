import { describe, expect, it } from "vitest";
import type { Args } from "./args.js";
import { NoSavedArtifactError, planUpload } from "./plan.js";

function makeArgs(overrides: Partial<Args> = {}): Args {
  return {
    command: "upload",
    targetPath: "/abs/photo.png",
    server: "https://example.com",
    extract: false,
    forceNew: false,
    ...overrides,
  };
}

describe("planUpload", () => {
  it("creates fresh when uploading with no saved entry", () => {
    expect(planUpload(makeArgs(), undefined)).toEqual({ action: "create" });
  });

  it("updates the saved artifact when uploading a previously-published path", () => {
    const existing = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", url: "/a/01ARZ3NDEKTSV4RRFFQ69G5FAV/", updatedAt: "x" };
    expect(planUpload(makeArgs(), existing)).toEqual({ action: "update", id: existing.id });
  });

  it("creates fresh even with a saved entry when --new is passed", () => {
    const existing = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", url: "/a/01ARZ3NDEKTSV4RRFFQ69G5FAV/", updatedAt: "x" };
    expect(planUpload(makeArgs({ forceNew: true }), existing)).toEqual({ action: "create" });
  });

  it("update command uses the saved entry's id when --id isn't given", () => {
    const existing = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", url: "/a/01ARZ3NDEKTSV4RRFFQ69G5FAV/", updatedAt: "x" };
    expect(planUpload(makeArgs({ command: "update" }), existing)).toEqual({ action: "update", id: existing.id });
  });

  it("update command prefers an explicit --id over the saved entry", () => {
    const existing = { id: "saved-id", url: "/a/saved-id/", updatedAt: "x" };
    expect(planUpload(makeArgs({ command: "update", id: "explicit-id" }), existing)).toEqual({
      action: "update",
      id: "explicit-id",
    });
  });

  it("update command throws without any saved entry or --id, making no network call", () => {
    expect(() => planUpload(makeArgs({ command: "update" }), undefined)).toThrow(NoSavedArtifactError);
  });

  it("falls back to create when a saved entry has a missing/empty id (corrupted state.json)", () => {
    const corrupted = { id: "", url: "/a//", updatedAt: "x" };
    expect(planUpload(makeArgs(), corrupted)).toEqual({ action: "create" });
  });
});
