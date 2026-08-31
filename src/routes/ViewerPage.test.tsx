import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactFile } from "../lib/artifact";
import { addRecentItem, getRecentItems } from "../lib/recent";
import { getStoredToken, saveToken } from "../lib/tokens";
import ViewerPage from "./ViewerPage";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

function file(
    name: string,
    overrides: Partial<ArtifactFile> = {},
): ArtifactFile {
    return {
        name,
        size: 128,
        previewable: true,
        markdown: false,
        ...overrides,
    };
}

interface Listing {
    files?: ArtifactFile[];
    directories?: string[];
    path?: string;
    locked?: boolean;
    canModify?: boolean;
    label?: string;
}

const UPDATE_URL = `/api/artifact/${ID}`;

/**
 * A fetch stub that also models server-side auth state: `initial.locked`/
 * `initial.canModify` describe the artifact's state as of the first render
 * (an already-protected artifact stays exactly as declared - it doesn't
 * matter whether the URL happens to carry a token, since this mock has no
 * way to know what "the current valid token" is until a real lock call
 * generates one). Once this test itself PATCHes `lock: true`, the mock
 * switches to checking the request's token against the token that call
 * generated - the same way the real Worker behaves. Label edits go through
 * the same PATCH endpoint and are gated by the same auth.
 */
function stubListing(initial: Listing, options: { lockToken?: string } = {}) {
    let locked = initial.locked ?? false;
    const baseCanModify = initial.canModify ?? true;
    let label = initial.label;
    let requiresTokenMatch = false;
    const lockToken = options.lockToken ?? "generated-token";

    const canModifyWith = (suppliedToken: string | null) =>
        requiresTokenMatch ? suppliedToken === lockToken : baseCanModify;

    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
        const url = String(args[0]);
        const init = args[1] as RequestInit | undefined;

        if (url === UPDATE_URL && init?.method === "PATCH") {
            const suppliedToken =
                (init.headers as Record<string, string> | undefined)?.["X-Artifact-Token"] ?? null;
            const body = JSON.parse(String(init.body)) as { label?: string; lock?: boolean };

            if (body.lock === true) {
                if (locked) {
                    return new Response(
                        JSON.stringify({ success: false, error: "Artifact is already protected" }),
                        { status: 409, headers: { "Content-Type": "application/json" } },
                    );
                }
                locked = true;
                requiresTokenMatch = true;
            } else if (locked && !canModifyWith(suppliedToken)) {
                return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
                    status: 403,
                    headers: { "Content-Type": "application/json" },
                });
            }

            if (typeof body.label === "string") label = body.label;

            return new Response(
                JSON.stringify({
                    success: true,
                    id: ID,
                    label,
                    locked,
                    canModify: true,
                    ...(body.lock === true ? { token: lockToken } : {}),
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        }

        if (url.startsWith("/api/artifact/")) {
            const suppliedToken = new URL(url, "http://localhost").searchParams.get("token");
            return new Response(
                JSON.stringify({
                    success: true,
                    id: ID,
                    path: initial.path ?? "",
                    files: initial.files ?? [],
                    directories: initial.directories ?? [],
                    locked,
                    canModify: canModifyWith(suppliedToken),
                    label,
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            );
        }
        return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

async function renderViewer(subPath = "") {
    function LocationProbe() {
        const location = useLocation();
        return <output data-testid="location-search">{location.search}</output>;
    }

    render(
        <MemoryRouter initialEntries={[`/a/${ID}/${subPath}`]}>
            <Routes>
                <Route path="/a/:id/*" element={<ViewerPage />} />
            </Routes>
            <LocationProbe />
        </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
}

async function renderViewerEntry(entry: string) {
    function LocationProbe() {
        const location = useLocation();
        return <output data-testid="location-search">{location.search}</output>;
    }

    render(
        <MemoryRouter initialEntries={[entry]}>
            <Routes>
                <Route path="/a/:id/*" element={<ViewerPage />} />
            </Routes>
            <LocationProbe />
        </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
}

beforeEach(() => {
    vi.stubGlobal(
        "confirm",
        vi.fn(() => true),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
});

describe("preview pane defaults", () => {
    it("restores the selected preview file from the file query param", async () => {
        stubListing({ files: [file("a.txt"), file("b.txt")] });
        await renderViewerEntry(`/a/${ID}/?file=b.txt`);

        const frame = screen.getByTitle("File preview") as HTMLIFrameElement;
        expect(frame.getAttribute("src")).toBe(`/a/${ID}/b.txt`);
    });

    it("updates the file query param when a previewable file is clicked", async () => {
        stubListing({ files: [file("a.txt"), file("b.txt")] });
        await renderViewer();

        screen.getByRole("link", { name: "b.txt" }).click();

        await waitFor(() =>
            expect(screen.getByTestId("location-search").textContent).toBe(
                "?file=b.txt",
            ),
        );
        expect(screen.getByTitle("File preview").getAttribute("src")).toBe(
            `/a/${ID}/b.txt`,
        );
    });

    it("defaults the preview pane to index.html when one is present", async () => {
        stubListing({ files: [file("about.html"), file("index.html")] });
        await renderViewer();

        const frame = screen.getByTitle("File preview") as HTMLIFrameElement;
        expect(frame.getAttribute("src")).toBe(`/a/${ID}/index.html`);
    });

    it("pre-selects the only file for a single-file artifact when it's previewable", async () => {
        stubListing({ files: [file("solo.txt")] });
        await renderViewer();

        const frame = screen.getByTitle("File preview") as HTMLIFrameElement;
        expect(frame.getAttribute("src")).toBe(`/a/${ID}/solo.txt`);
    });

    it("shows a placeholder and no iframe when nothing in the folder is previewable", async () => {
        stubListing({ files: [file("blob.bin", { previewable: false })] });
        await renderViewer();

        expect(screen.queryByTitle("File preview")).toBeNull();
        expect(screen.getByText(/no preview available/i)).toBeTruthy();
    });

    it("a folder with only subfolders points at the subfolders, not at missing previews", async () => {
        stubListing({ directories: ["nested/"] });
        await renderViewer();

        expect(screen.getByText(/only contains subfolders/i)).toBeTruthy();
    });
});

describe("markdown handling", () => {
    it("renders a markdown file through the Worker by default, with a source toggle", async () => {
        stubListing({ files: [file("readme.md", { markdown: true })] });
        await renderViewer();

        const frame = screen.getByTitle("File preview") as HTMLIFrameElement;
        expect(frame.getAttribute("src")).toBe(
            `/a/${ID}/readme.md?render=html`,
        );
        expect(
            screen.getByRole("button", { name: "Show source" }),
        ).toBeTruthy();
    });

    it("swaps the iframe to the raw source when the toggle is used", async () => {
        stubListing({ files: [file("readme.md", { markdown: true })] });
        await renderViewer();

        screen.getByRole("button", { name: "Show source" }).click();

        // The iframe is keyed on its URL so it remounts rather than reusing the
        // previous document - re-query instead of holding the old node.
        await waitFor(() =>
            expect(screen.getByTitle("File preview").getAttribute("src")).toBe(
                `/a/${ID}/readme.md`,
            ),
        );
        expect(
            screen.getByRole("button", { name: "Show rendered" }),
        ).toBeTruthy();
    });

    it("does not add a source toggle for non-markdown previewable files", async () => {
        stubListing({ files: [file("page.html")] });
        await renderViewer();

        expect(
            screen.queryByRole("button", { name: "Show source" }),
        ).toBeNull();
    });
});

describe("sidebar", () => {
    it("gives every file and folder its own open-in-new-tab link", async () => {
        stubListing({ files: [file("page.html")], directories: ["assets/"] });
        await renderViewer();

        const fileTab = screen.getByRole("link", {
            name: /open page\.html in a new tab/i,
        });
        expect(fileTab.getAttribute("href")).toBe(`/a/${ID}/page.html`);
        expect(fileTab.getAttribute("target")).toBe("_blank");

        const dirTab = screen.getByRole("link", {
            name: /open assets\/ in a new tab/i,
        });
        expect(dirTab.getAttribute("href")).toBe(`/a/${ID}/assets/`);
    });

    it("offers no parent link at the artifact root", async () => {
        stubListing({ files: [file("a.txt")] });
        await renderViewer();

        expect(
            screen.queryByRole("link", { name: /parent directory/i }),
        ).toBeNull();
    });

    it("links to the parent directory from inside a subfolder", async () => {
        stubListing({ files: [file("style.css")], path: "css/" });
        await renderViewer("css/");

        const parent = screen.getByRole("link", { name: /parent directory/i });
        expect(parent.getAttribute("href")).toBe(`/a/${ID}/`);
    });

    it("links a nested subfolder's parent to the folder above it, not to the root", async () => {
        stubListing({ files: [file("lib.css")], path: "css/vendor/" });
        await renderViewer("css/vendor/");

        const parent = screen.getByRole("link", { name: /parent directory/i });
        expect(parent.getAttribute("href")).toBe(`/a/${ID}/css/`);
    });

    it("links a non-previewable file straight at its bytes so it downloads", async () => {
        stubListing({ files: [file("blob.bin", { previewable: false })] });
        await renderViewer();

        const link = screen.getByRole("link", { name: /^blob\.bin$/ });
        expect(link.getAttribute("href")).toBe(`/a/${ID}/blob.bin`);
    });
});

describe("artifact actions", () => {
    it("scopes the upload control to the artifact root", async () => {
        const fetchMock = stubListing({ files: [file("a.txt")] });
        await renderViewer();

        const input = screen.getByLabelText(
            "Add files to this folder",
        ) as HTMLInputElement;
        Object.defineProperty(input, "files", {
            value: [new File(["x"], "new.txt")],
            configurable: true,
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));

        await waitFor(() => {
            const uploadCall = fetchMock.mock.calls.find(
                (call) => String(call[0]) === "/api/upload",
            );
            expect(uploadCall).toBeTruthy();
            const form = uploadCall![1]!.body as FormData;
            expect(form.get("mode")).toBe("directory");
            expect(form.get("id")).toBe(ID);
            expect((form.get("files") as File).name).toBe("new.txt");
        });
    });

    it("scopes the upload control to the current subfolder's path", async () => {
        const fetchMock = stubListing({
            files: [file("style.css")],
            path: "css/",
        });
        await renderViewer("css/");

        const input = screen.getByLabelText(
            "Add files to this folder",
        ) as HTMLInputElement;
        Object.defineProperty(input, "files", {
            value: [new File(["x"], "new.css")],
            configurable: true,
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));

        await waitFor(() => {
            const uploadCall = fetchMock.mock.calls.find(
                (call) => String(call[0]) === "/api/upload",
            );
            expect(uploadCall).toBeTruthy();
            const form = uploadCall![1]!.body as FormData;
            expect((form.get("files") as File).name).toBe("css/new.css");
        });
    });

    it("offers a delete control at the root only", async () => {
        stubListing({ files: [file("a.txt")] });
        await renderViewer();
        screen.getByRole("button", { name: "More actions" }).click();
        expect(
            await screen.findByRole("button", { name: "Delete" }),
        ).toBeTruthy();
    });

    it("hides the delete control inside a subfolder, since it deletes the whole artifact", async () => {
        stubListing({ files: [file("style.css")], path: "css/" });
        await renderViewer("css/");
        screen.getByRole("button", { name: "More actions" }).click();
        // Wait for the menu to actually open (via a control that's always
        // present) before asserting Delete is absent - otherwise this would
        // pass vacuously whether or not the menu ever opened.
        await screen.findByRole("button", { name: "Share" });
        expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    });

    it("confirms before deleting, then reports the artifact is gone", async () => {
        const fetchMock = stubListing({ files: [file("a.txt")] });
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        (await screen.findByRole("button", { name: "Delete" })).click();

        await waitFor(() => {
            expect(globalThis.confirm).toHaveBeenCalled();
            expect(
                fetchMock.mock.calls.some(
                    (call) =>
                        String(call[0]) === `/api/artifact/${ID}` &&
                        call[1]?.method === "DELETE",
                ),
            ).toBe(true);
        });
        expect(await screen.findByText(/artifact deleted/i)).toBeTruthy();
    });

    it("does not delete when the confirmation is declined", async () => {
        vi.stubGlobal(
            "confirm",
            vi.fn(() => false),
        );
        const fetchMock = stubListing({ files: [file("a.txt")] });
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        (await screen.findByRole("button", { name: "Delete" })).click();

        await waitFor(() => expect(globalThis.confirm).toHaveBeenCalled());
        expect(
            fetchMock.mock.calls.some((call) => call[1]?.method === "DELETE"),
        ).toBe(false);
    });
});

describe("protected artifacts", () => {
    it("hides upload-more and delete when the artifact can't be modified", async () => {
        stubListing({ files: [file("a.txt")], locked: true, canModify: false });
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        await screen.findByRole("button", { name: "Share" });
        expect(
            screen.queryByRole("button", { name: "Upload more" }),
        ).toBeNull();
        expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    });

    it("keeps upload-more and delete available for a legacy artifact with no protection metadata", async () => {
        stubListing({ files: [file("a.txt")] });
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        expect(
            await screen.findByRole("button", { name: "Upload more" }),
        ).toBeTruthy();
        expect(
            await screen.findByRole("button", { name: "Delete" }),
        ).toBeTruthy();
    });

    it("shows a Lock action for an unprotected artifact", async () => {
        stubListing({ files: [file("a.txt")], locked: false });
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        expect(await screen.findByRole("button", { name: "Lock" })).toBeTruthy();
    });

    it("hides the Lock action for an artifact that's already protected", async () => {
        stubListing({ files: [file("a.txt")], locked: true, canModify: true });
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        await screen.findByRole("button", { name: "Share" });
        expect(screen.queryByRole("button", { name: "Lock" })).toBeNull();
    });

    it("locks the artifact, shows the generated token once, and refreshes the action menu afterward", async () => {
        const fetchMock = stubListing(
            { files: [file("a.txt")], locked: false },
            { lockToken: "one-time-token" },
        );
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        (await screen.findByRole("button", { name: "Lock" })).click();

        await waitFor(() => {
            expect(
                fetchMock.mock.calls.some(
                    (call) =>
                        String(call[0]) === `/api/artifact/${ID}` &&
                        call[1]?.method === "PATCH" &&
                        JSON.parse(String(call[1]?.body)).lock === true,
                ),
            ).toBe(true);
        });

        expect(await screen.findByText("one-time-token")).toBeTruthy();

        // Locking carries the fresh token into the URL, so the follow-up
        // listing refresh sees canModify: true and the Lock action disappears.
        await waitFor(() =>
            expect(
                screen.getByTestId("location-search").textContent,
            ).toContain("token=one-time-token"),
        );
        screen.getByRole("button", { name: "Done" }).click();
        screen.getByRole("button", { name: "More actions" }).click();
        await waitFor(() =>
            expect(screen.queryByRole("button", { name: "Lock" })).toBeNull(),
        );
    });

    it("saves the generated token to localStorage after locking", async () => {
        stubListing(
            { files: [file("a.txt")], locked: false },
            { lockToken: "one-time-token" },
        );
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        (await screen.findByRole("button", { name: "Lock" })).click();

        await waitFor(() =>
            expect(getStoredToken(ID)).toBe("one-time-token"),
        );
    });

    it("removes the saved token when the artifact is deleted", async () => {
        saveToken(ID, "stale-token");
        stubListing({ files: [file("a.txt")], locked: true, canModify: true });
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        (await screen.findByRole("button", { name: "Delete" })).click();

        await waitFor(() => expect(getStoredToken(ID)).toBeNull());
    });

    it("shows an error and does not lock when the confirmation is declined", async () => {
        vi.stubGlobal(
            "confirm",
            vi.fn(() => false),
        );
        const fetchMock = stubListing({ files: [file("a.txt")], locked: false });
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        (await screen.findByRole("button", { name: "Lock" })).click();

        await waitFor(() => expect(globalThis.confirm).toHaveBeenCalled());
        expect(
            fetchMock.mock.calls.some(
                (call) => call[1]?.method === "PATCH" && call[0] === UPDATE_URL,
            ),
        ).toBe(false);
    });
});

describe("rename", () => {
    it("offers a Rename action at the root only, for a modifiable artifact", async () => {
        stubListing({ files: [file("a.txt")], label: "Original" });
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        expect(await screen.findByRole("button", { name: "Rename" })).toBeTruthy();
    });

    it("hides Rename inside a subfolder", async () => {
        stubListing({ files: [file("style.css")], path: "css/", label: "Original" });
        await renderViewer("css/");

        screen.getByRole("button", { name: "More actions" }).click();
        await screen.findByRole("button", { name: "Share" });
        expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    });

    it("hides Rename when the artifact can't be modified", async () => {
        stubListing({ files: [file("a.txt")], locked: true, canModify: false, label: "Original" });
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        await screen.findByRole("button", { name: "Share" });
        expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    });

    it("renames via the prompt and reloads the listing with the new label", async () => {
        vi.stubGlobal(
            "prompt",
            vi.fn(() => "New Label"),
        );
        const fetchMock = stubListing({ files: [file("a.txt")], label: "Original" });
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        (await screen.findByRole("button", { name: "Rename" })).click();

        await waitFor(() => {
            expect(
                fetchMock.mock.calls.some(
                    (call) =>
                        call[0] === UPDATE_URL &&
                        call[1]?.method === "PATCH" &&
                        JSON.parse(String(call[1]?.body)).label === "New Label",
                ),
            ).toBe(true);
        });
        expect(await screen.findAllByText(/New Label/)).not.toHaveLength(0);
    });

    it("does not rename when the prompt is cancelled", async () => {
        vi.stubGlobal(
            "prompt",
            vi.fn(() => null),
        );
        const fetchMock = stubListing({ files: [file("a.txt")], label: "Original" });
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        (await screen.findByRole("button", { name: "Rename" })).click();

        await waitFor(() => expect(globalThis.prompt).toHaveBeenCalled());
        expect(
            fetchMock.mock.calls.some((call) => call[1]?.method === "PATCH"),
        ).toBe(false);
    });
});

describe("token propagation", () => {
    it("includes the URL token when fetching the listing", async () => {
        const fetchMock = stubListing({ files: [file("a.txt")] });
        await renderViewerEntry(`/a/${ID}/?token=my-token`);

        await waitFor(() => {
            const call = fetchMock.mock.calls.find((c) =>
                String(c[0]).startsWith(`/api/artifact/${ID}`),
            );
            expect(String(call![0])).toContain("token=my-token");
        });
    });

    it("saves a valid URL token to localStorage when it isn't already stored", async () => {
        stubListing({ files: [file("a.txt")], locked: true, canModify: true });
        await renderViewerEntry(`/a/${ID}/?token=my-token`);

        await waitFor(() => expect(getStoredToken(ID)).toBe("my-token"));
    });

    it("does not save the URL token when it fails to authorize", async () => {
        stubListing({ files: [file("a.txt")], locked: true, canModify: false });
        await renderViewerEntry(`/a/${ID}/?token=wrong-token`);

        await screen.findByText(/a\.txt/);
        expect(getStoredToken(ID)).toBeNull();
    });

    it("preserves the token in a folder link", async () => {
        stubListing({ directories: ["css/"] });
        await renderViewerEntry(`/a/${ID}/?token=my-token`);

        const link = screen.getByRole("link", { name: "css/" });
        expect(link.getAttribute("href")).toBe(`/a/${ID}/css/?token=my-token`);
    });

    it("preserves the token in the parent-directory link", async () => {
        stubListing({ files: [file("style.css")], path: "css/" });
        await renderViewerEntry(`/a/${ID}/css/?token=my-token`);

        const parent = screen.getByRole("link", { name: /parent directory/i });
        expect(parent.getAttribute("href")).toBe(`/a/${ID}/?token=my-token`);
    });

    it("preserves the token when selecting a different file", async () => {
        stubListing({ files: [file("a.txt"), file("b.txt")] });
        await renderViewerEntry(`/a/${ID}/?token=my-token`);

        screen.getByRole("link", { name: "b.txt" }).click();

        await waitFor(() =>
            expect(
                screen.getByTestId("location-search").textContent,
            ).toContain("token=my-token"),
        );
    });

    it("sends the token as X-Artifact-Token when deleting", async () => {
        const fetchMock = stubListing({ files: [file("a.txt")] });
        await renderViewerEntry(`/a/${ID}/?token=my-token`);

        screen.getByRole("button", { name: "More actions" }).click();
        (await screen.findByRole("button", { name: "Delete" })).click();

        await waitFor(() => {
            const call = fetchMock.mock.calls.find(
                (c) =>
                    String(c[0]) === `/api/artifact/${ID}` &&
                    c[1]?.method === "DELETE",
            );
            expect(call).toBeTruthy();
            const headers = call![1]?.headers as Record<string, string>;
            expect(headers["X-Artifact-Token"]).toBe("my-token");
        });
    });

    it("sends the token as X-Artifact-Token when uploading more", async () => {
        const fetchMock = stubListing({ files: [file("a.txt")] });
        await renderViewerEntry(`/a/${ID}/?token=my-token`);

        const input = screen.getByLabelText(
            "Add files to this folder",
        ) as HTMLInputElement;
        Object.defineProperty(input, "files", {
            value: [new File(["x"], "new.txt")],
            configurable: true,
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));

        await waitFor(() => {
            const call = fetchMock.mock.calls.find(
                (c) => String(c[0]) === "/api/upload",
            );
            expect(call).toBeTruthy();
            const headers = call![1]?.headers as Record<string, string>;
            expect(headers["X-Artifact-Token"]).toBe("my-token");
        });
    });

    it("omits the token header entirely when no token is present", async () => {
        const fetchMock = stubListing({ files: [file("a.txt")] });
        await renderViewer();

        screen.getByRole("button", { name: "More actions" }).click();
        (await screen.findByRole("button", { name: "Delete" })).click();

        await waitFor(() => {
            const call = fetchMock.mock.calls.find(
                (c) => c[1]?.method === "DELETE",
            );
            expect(call).toBeTruthy();
            expect(call![1]?.headers).toBeUndefined();
        });
    });
});

describe("recent artifacts", () => {
    it("records the viewed artifact in the recent list", async () => {
        stubListing({ files: [file("a.txt")] });
        await renderViewer();

        await waitFor(() =>
            expect(getRecentItems().some((item) => item.id === ID)).toBe(true),
        );
    });

    it("stores the artifact's label from the listing response in the recent list", async () => {
        stubListing({ files: [file("a.txt")], label: "My Cool Site" });
        await renderViewer();

        await waitFor(() =>
            expect(
                getRecentItems().find((item) => item.id === ID)?.label,
            ).toBe("My Cool Site"),
        );
    });

    it("leaves the recent item without a label for a legacy artifact that has none", async () => {
        stubListing({ files: [file("a.txt")] });
        await renderViewer();

        await waitFor(() =>
            expect(getRecentItems().some((item) => item.id === ID)).toBe(true),
        );
        expect(
            getRecentItems().find((item) => item.id === ID)?.label,
        ).toBeUndefined();
    });

    it("shows a recent artifact's label instead of its id, falling back to the id when there is none", async () => {
        addRecentItem("labeled-artifact", Date.now() - 60_000, "My Cool Site");
        addRecentItem("plain-artifact", Date.now() - 30_000);
        stubListing({ files: [file("a.txt")] });
        await renderViewer();

        await waitFor(() => expect(getRecentItems().length).toBe(3));

        screen.getByRole("button", { name: /switch artifact/i }).click();

        expect(
            await screen.findByRole("link", { name: /my cool site/i }),
        ).toBeTruthy();
        expect(screen.queryByText("labeled-artifact")).toBeNull();
        expect(
            await screen.findByRole("link", { name: /plain-artifact/i }),
        ).toBeTruthy();
    });

    it("does not show a switcher when this is the only recent artifact", async () => {
        stubListing({ files: [file("a.txt")] });
        await renderViewer();

        await waitFor(() => expect(getRecentItems().length).toBe(1));
        expect(
            screen.queryByRole("button", { name: /switch artifact/i }),
        ).toBeNull();
    });

    it("offers a switcher to other recent artifacts and links to the selected one", async () => {
        addRecentItem("other-artifact", Date.now() - 60_000);
        stubListing({ files: [file("a.txt")] });
        await renderViewer();

        await waitFor(() => expect(getRecentItems().length).toBe(2));

        screen.getByRole("button", { name: /switch artifact/i }).click();

        const link = await waitFor(() =>
            screen.getByRole("link", { name: /other-artifact/i }),
        );
        expect(link.getAttribute("href")).toBe("/a/other-artifact/");
    });

    it("auto-injects a saved token when switching to a recent artifact that was previously locked", async () => {
        addRecentItem("other-artifact", Date.now() - 60_000);
        saveToken("other-artifact", "other-token");
        stubListing({ files: [file("a.txt")] });
        await renderViewer();

        await waitFor(() => expect(getRecentItems().length).toBe(2));

        screen.getByRole("button", { name: /switch artifact/i }).click();

        const link = await waitFor(() =>
            screen.getByRole("link", { name: /other-artifact/i }),
        );
        expect(link.getAttribute("href")).toBe(
            "/a/other-artifact/?token=other-token",
        );
    });
});

describe("failure states", () => {
    it("reports a missing artifact instead of an empty viewer", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(JSON.stringify({ success: false }), {
                        status: 404,
                    }),
            ),
        );
        render(
            <MemoryRouter initialEntries={[`/a/${ID}/`]}>
                <Routes>
                    <Route path="/a/:id/*" element={<ViewerPage />} />
                </Routes>
            </MemoryRouter>,
        );
        expect(
            await screen.findByText(/doesn't exist, or was deleted/i),
        ).toBeTruthy();
    });
});
