import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a basic upload command", () => {
    const args = parseArgs(["upload", "./photo.png"]);
    expect(args.command).toBe("upload");
    expect(args.targetPaths).toHaveLength(1);
    expect(args.targetPaths[0].endsWith("photo.png")).toBe(true);
    expect(args.forceNew).toBe(false);
    expect(args.id).toBeUndefined();
  });

  it("parses multiple target paths for a single bundled upload", () => {
    const args = parseArgs(["upload", "./a.png", "./b.png", "--server", "https://example.com"]);
    expect(args.targetPaths).toHaveLength(2);
    expect(args.targetPaths[0].endsWith("a.png")).toBe(true);
    expect(args.targetPaths[1].endsWith("b.png")).toBe(true);
  });

  it("parses target paths interspersed with flags", () => {
    const args = parseArgs(["upload", "./a.png", "--extract", "./b.png"]);
    expect(args.targetPaths).toHaveLength(2);
    expect(args.extract).toBe(true);
  });

  it("rejects --name when multiple paths are given", () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => parseArgs(["upload", "./a.png", "./b.png", "--name", "bundle"])).toThrow("exit");
  });

  it("parses --new on upload", () => {
    const args = parseArgs(["upload", "./photo.png", "--new"]);
    expect(args.forceNew).toBe(true);
  });

  it("parses update with --id", () => {
    const args = parseArgs(["update", "./photo.png", "--id", "01ARZ3NDEKTSV4RRFFQ69G5FAV"]);
    expect(args.command).toBe("update");
    expect(args.id).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });

  it("parses --server and --extract", () => {
    const args = parseArgs(["upload", "./release.zip", "--server", "https://example.com/", "--extract"]);
    expect(args.server).toBe("https://example.com");
    expect(args.extract).toBe(true);
  });

  it("exits with a usage error for an unrecognized command", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => parseArgs(["frobnicate", "./photo.png"])).toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits with a usage error for an unknown flag", () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => parseArgs(["upload", "./photo.png", "--bogus"])).toThrow("exit");
  });
});
