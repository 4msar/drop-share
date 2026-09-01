import { use } from "react";
import {
    ThemeActionsContext,
    ThemeStateContext,
    type Theme,
    type ThemeActions,
} from "./theme-context";

/** The document's currently rendered theme. */
export function useTheme(): Theme {
    const value = use(ThemeStateContext);
    if (value === null) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return value;
}

/** Actions that change the theme. */
export function useThemeActions(): ThemeActions {
    const value = use(ThemeActionsContext);
    if (value === null) {
        throw new Error("useThemeActions must be used within a ThemeProvider");
    }
    return value;
}
