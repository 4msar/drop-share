/**
 * Whether the given root's rendered scheme is dark: an explicit `dark`/`light`
 * class always wins, falling back to the system preference when neither is set.
 */
export function isDarkTheme(
    classList: DOMTokenList,
    prefersDark: boolean,
): boolean {
    const savedTheme = localStorage.getItem("theme");

    if (classList.contains("dark")) return true;
    if (classList.contains("light")) return false;
    if (savedTheme === "dark") return true;
    if (savedTheme === "light") return false;

    return prefersDark;
}

/** Applies the persisted scheme before the app renders. */
export function applySavedTheme(root: HTMLElement): void {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme !== "dark" && savedTheme !== "light") return;

    root.classList.remove(savedTheme === "dark" ? "light" : "dark");
    root.classList.add(savedTheme);
    root.style.colorScheme = savedTheme;
}

/** Flips the root's rendered scheme, forcing the opposite of what's currently shown. */
export function toggleTheme(
    root: HTMLElement,
    prefersDark: boolean,
): "dark" | "light" {
    const next = isDarkTheme(root.classList, prefersDark) ? "light" : "dark";
    localStorage.setItem("theme", next);
    root.classList.remove(next === "dark" ? "light" : "dark");
    root.classList.add(next);
    return next;
}
