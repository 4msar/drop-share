import { afterEach, describe, expect, it } from "vitest";
import { isDarkTheme, toggleTheme } from "./theme";

function root(className = ""): HTMLElement {
  const el = document.createElement("html");
  el.className = className;
  return el;
}

afterEach(() => {
  document.documentElement.className = "";
});

describe("isDarkTheme", () => {
  it("is dark when the dark class is present, regardless of system preference", () => {
    expect(isDarkTheme(root("dark").classList, false)).toBe(true);
  });

  it("is light when the light class is present, regardless of system preference", () => {
    expect(isDarkTheme(root("light").classList, true)).toBe(false);
  });

  it("falls back to the system preference when neither class is present", () => {
    expect(isDarkTheme(root().classList, true)).toBe(true);
    expect(isDarkTheme(root().classList, false)).toBe(false);
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
