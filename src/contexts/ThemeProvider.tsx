import { useCallback, useMemo, useState, type ReactNode } from "react";
import { isDarkTheme, toggleTheme as flipThemeClass } from "../lib/theme";
import {
    ThemeActionsContext,
    ThemeStateContext,
    type Theme,
    type ThemeActions,
} from "./theme-context";

function prefersDarkScheme(): boolean {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function currentTheme(): Theme {
    return isDarkTheme(document.documentElement.classList, prefersDarkScheme())
        ? "dark"
        : "light";
}

/**
 * Provides the document's rendered color scheme app-wide. `main.tsx` already
 * applies any saved theme to the DOM before this ever mounts, so the initial
 * state read here just mirrors what's already on screen.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>(currentTheme);

    const toggleTheme = useCallback(() => {
        const next = flipThemeClass(document.documentElement, prefersDarkScheme());
        document.documentElement.style.colorScheme = next;
        setTheme(next);
    }, []);

    const actions = useMemo<ThemeActions>(() => ({ toggleTheme }), [toggleTheme]);

    return (
        <ThemeStateContext value={theme}>
            <ThemeActionsContext value={actions}>{children}</ThemeActionsContext>
        </ThemeStateContext>
    );
}
