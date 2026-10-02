import { afterEach, describe, expect, it } from "vitest";
import {
    SIDEBAR_STORAGE_KEY,
    defaultSidebarOpen,
    getSavedSidebarOpen,
    saveSidebarOpen,
} from "./sidebar";

afterEach(() => localStorage.clear());

describe("sidebar preference", () => {
    it("has no saved preference until one is saved", () => {
        expect(getSavedSidebarOpen()).toBeNull();
    });

    it("round-trips both states", () => {
        saveSidebarOpen(false);
        expect(getSavedSidebarOpen()).toBe(false);
        saveSidebarOpen(true);
        expect(getSavedSidebarOpen()).toBe(true);
    });

    it("ignores an unrecognised stored value", () => {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, "maybe");
        expect(getSavedSidebarOpen()).toBeNull();
    });

    it("defaults open beside the preview and closed when stacked", () => {
        expect(defaultSidebarOpen(1024)).toBe(true);
        expect(defaultSidebarOpen(768)).toBe(true);
        expect(defaultSidebarOpen(500)).toBe(false);
    });
});
