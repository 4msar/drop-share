import { describe, expect, it } from "vitest";
import { disambiguateNames } from "./names.js";

describe("disambiguateNames", () => {
  it("uses the bare filename when there are no collisions", () => {
    expect(disambiguateNames(["/a/photo.png", "/b/readme.md"])).toEqual(["photo.png", "readme.md"]);
  });

  it("prefixes the parent directory when basenames collide", () => {
    expect(disambiguateNames(["/a/logo.png", "/b/logo.png"])).toEqual(["a-logo.png", "b-logo.png"]);
  });

  it("keeps growing context uniformly for the whole batch until unique", () => {
    expect(disambiguateNames(["/x/a/logo.png", "/y/a/logo.png"])).toEqual(["x-a-logo.png", "y-a-logo.png"]);
  });

  it("returns unique names for a single path", () => {
    expect(disambiguateNames(["/a/photo.png"])).toEqual(["photo.png"]);
  });
});
