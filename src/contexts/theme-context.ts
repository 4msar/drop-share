import { createContext } from "react";

export type Theme = "dark" | "light";

export interface ThemeActions {
    toggleTheme: () => void;
}

export const ThemeStateContext = createContext<Theme | null>(null);
export const ThemeActionsContext = createContext<ThemeActions | null>(null);
