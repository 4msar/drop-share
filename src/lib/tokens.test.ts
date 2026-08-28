import { afterEach, describe, expect, it, vi } from "vitest";
import { getStoredToken, removeToken, saveToken, TOKENS_STORAGE_KEY } from "./tokens";

afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe("getStoredToken", () => {
    it("returns null when nothing has been stored", () => {
        expect(getStoredToken("abc123")).toBeNull();
    });

    it("returns null for an id that has no saved token", () => {
        saveToken("abc123", "secret-token");
        expect(getStoredToken("other-id")).toBeNull();
    });

    it("returns null instead of throwing when storage holds malformed JSON", () => {
        localStorage.setItem(TOKENS_STORAGE_KEY, "not json{{{");
        expect(getStoredToken("abc123")).toBeNull();
    });

    it("returns null instead of throwing when storage holds a non-object value", () => {
        localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(["not", "a", "map"]));
        expect(getStoredToken("abc123")).toBeNull();
    });
});

describe("saveToken", () => {
    it("saves a token that can then be read back", () => {
        saveToken("abc123", "secret-token");
        expect(getStoredToken("abc123")).toBe("secret-token");
    });

    it("keeps tokens for other artifacts when saving a new one", () => {
        saveToken("first", "token-1");
        saveToken("second", "token-2");

        expect(getStoredToken("first")).toBe("token-1");
        expect(getStoredToken("second")).toBe("token-2");
    });

    it("overwrites an existing token for the same artifact", () => {
        saveToken("abc123", "old-token");
        saveToken("abc123", "new-token");

        expect(getStoredToken("abc123")).toBe("new-token");
    });
});

describe("removeToken", () => {
    it("removes a stored token", () => {
        saveToken("abc123", "secret-token");
        removeToken("abc123");

        expect(getStoredToken("abc123")).toBeNull();
    });

    it("leaves other artifacts' tokens untouched", () => {
        saveToken("first", "token-1");
        saveToken("second", "token-2");
        removeToken("first");

        expect(getStoredToken("first")).toBeNull();
        expect(getStoredToken("second")).toBe("token-2");
    });

    it("is a no-op when the id has no saved token", () => {
        saveToken("first", "token-1");
        removeToken("missing");

        expect(getStoredToken("first")).toBe("token-1");
    });
});
