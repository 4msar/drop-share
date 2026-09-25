import { describe, expect, it } from "vitest";
import { slugifyFileName } from "./slugify.js";

describe("slugifyFileName", () => {
    it("lowercases and hyphenates the base name, keeping the extension", () => {
        expect(slugifyFileName("My Photo!.PNG")).toBe("my-photo.png");
    });

    it("collapses runs of punctuation/whitespace into a single hyphen", () => {
        expect(slugifyFileName("  a   b--c.txt")).toBe("a-b-c.txt");
    });

    it("strips diacritics", () => {
        expect(slugifyFileName("café.txt")).toBe("cafe.txt");
    });

    it("trims leading/trailing hyphens from the base name", () => {
        expect(slugifyFileName("-hello-.txt")).toBe("hello.txt");
    });

    it("passes through a name with no extension", () => {
        expect(slugifyFileName("Dockerfile")).toBe("dockerfile");
    });

    it("treats a leading dot as not an extension separator", () => {
        expect(slugifyFileName(".env")).toBe("env");
    });

    it("returns null for an empty or whitespace-only name", () => {
        expect(slugifyFileName("")).toBeNull();
        expect(slugifyFileName("   ")).toBeNull();
    });

    it("returns null when the name has no letters or digits to keep", () => {
        expect(slugifyFileName("!!!.txt")).toBeNull();
        expect(slugifyFileName("...")).toBeNull();
    });

    it("returns null for a name longer than 255 characters", () => {
        expect(slugifyFileName(`${"a".repeat(256)}.txt`)).toBeNull();
    });
});
