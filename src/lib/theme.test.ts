import { afterEach, describe, expect, it } from "vitest";
import { applySavedTheme, isDarkTheme, toggleTheme } from "./theme";

function root(className = ""): HTMLElement {
    const el = document.createElement("html");
    el.className = className;
    return el;
}

afterEach(() => {
    document.documentElement.className = "";
    localStorage.clear();
});

describe("isDarkTheme", () => {
    it("is dark when the dark class is present, regardless of system preference", () => {
        expect(isDarkTheme(root("dark").classList, false)).toBe(true);
    });

    it("is light when the light class is present, regardless of system preference", () => {
        expect(isDarkTheme(root("light").classList, true)).toBe(false);
    });

    it("uses the saved mode when no class is present", () => {
        localStorage.setItem("theme", "light");
        expect(isDarkTheme(root().classList, true)).toBe(false);
    });

    it("lets an explicit class override the saved mode", () => {
        localStorage.setItem("theme", "light");
        expect(isDarkTheme(root("dark").classList, false)).toBe(true);
    });

    it("falls back to the system preference when neither class is present", () => {
        expect(isDarkTheme(root().classList, true)).toBe(true);
        expect(isDarkTheme(root().classList, false)).toBe(false);
    });
});

describe("applySavedTheme", () => {
    it("applies the saved mode to the root element", () => {
        const el = root("light");
        localStorage.setItem("theme", "dark");

        applySavedTheme(el);

        expect(el.classList.contains("dark")).toBe(true);
        expect(el.classList.contains("light")).toBe(false);
        expect(el.style.colorScheme).toBe("dark");
    });
});

describe("toggleTheme", () => {
    it("forces dark when the system is light and nothing has been forced yet", () => {
        const el = root();
        const result = toggleTheme(el, false);
        expect(el.classList.contains("dark")).toBe(true);
        expect(el.classList.contains("light")).toBe(false);
        expect(result).toBe("dark");
    });

    it("forces light when the system is dark and nothing has been forced yet", () => {
        const el = root();
        toggleTheme(el, true);
        expect(el.classList.contains("light")).toBe(true);
        expect(el.classList.contains("dark")).toBe(false);
    });

    it("flips a forced-dark element back to forced-light", () => {
        const el = root("dark");
        toggleTheme(el, false);
        expect(el.classList.contains("light")).toBe(true);
        expect(el.classList.contains("dark")).toBe(false);
    });

    it("flips a forced-light element back to forced-dark", () => {
        const el = root("light");
        toggleTheme(el, true);
        expect(el.classList.contains("dark")).toBe(true);
        expect(el.classList.contains("light")).toBe(false);
    });
});
