import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL only auto-cleans when vitest globals are enabled; they are not here.
afterEach(cleanup);
