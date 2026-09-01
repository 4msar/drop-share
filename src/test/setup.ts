import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL only auto-cleans when vitest globals are enabled; they are not here.
afterEach(cleanup);

// jsdom doesn't implement matchMedia; ThemeProvider reads it to seed the
// initial theme from the system preference. A plain assignment (not
// vi.stubGlobal) so it survives any test file's own vi.unstubAllGlobals().
if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
        ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        }) as MediaQueryList;
}
