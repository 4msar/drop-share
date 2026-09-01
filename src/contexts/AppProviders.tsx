import type { ReactNode } from "react";
import { RecentItemsProvider } from "./RecentItemsProvider";
import { ThemeProvider } from "./ThemeProvider";

/** Every app-wide context provider, combined into one wrapper. */
export function AppProviders({ children }: { children: ReactNode }) {
    return (
        <ThemeProvider>
            <RecentItemsProvider>{children}</RecentItemsProvider>
        </ThemeProvider>
    );
}
