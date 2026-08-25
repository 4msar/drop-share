/**
 * Whether the given root's rendered scheme is dark: an explicit `dark`/`light`
 * class always wins, falling back to the system preference when neither is set.
 */
export function isDarkTheme(classList: DOMTokenList, prefersDark: boolean): boolean {
  if (classList.contains("dark")) return true;
  if (classList.contains("light")) return false;
  return prefersDark;
}

/** Flips the root's rendered scheme, forcing the opposite of what's currently shown. */
export function toggleTheme(root: HTMLElement, prefersDark: boolean): "dark" | "light" {
  const next = isDarkTheme(root.classList, prefersDark) ? "light" : "dark";
  root.classList.remove(next === "dark" ? "light" : "dark");
  root.classList.add(next);
  return next;
}
