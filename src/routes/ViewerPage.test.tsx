import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactFile } from "../lib/artifact";
import ViewerPage from "./ViewerPage";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

function file(name: string, overrides: Partial<ArtifactFile> = {}): ArtifactFile {
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
}

function stubListing(listing: Listing) {
  const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
    const url = String(args[0]);
    if (url.startsWith("/api/artifact/")) {
      return new Response(
        JSON.stringify({
          success: true,
          id: ID,
          path: listing.path ?? "",
          files: listing.files ?? [],
          directories: listing.directories ?? [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderViewer(subPath = "") {
  render(
    <MemoryRouter initialEntries={[`/a/${ID}/${subPath}`]}>
      <Routes>
        <Route path="/a/:id/*" element={<ViewerPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
}

beforeEach(() => {
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("preview pane defaults", () => {
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
    expect(frame.getAttribute("src")).toBe(`/a/${ID}/readme.md?render=html`);
    expect(screen.getByRole("button", { name: "Show source" })).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "Show rendered" })).toBeTruthy();
  });

  it("does not add a source toggle for non-markdown previewable files", async () => {
    stubListing({ files: [file("page.html")] });
    await renderViewer();

    expect(screen.queryByRole("button", { name: "Show source" })).toBeNull();
  });
});

describe("sidebar", () => {
  it("gives every file and folder its own open-in-new-tab link", async () => {
    stubListing({ files: [file("page.html")], directories: ["assets/"] });
    await renderViewer();

    const fileTab = screen.getByRole("link", { name: /open page\.html in a new tab/i });
    expect(fileTab.getAttribute("href")).toBe(`/a/${ID}/page.html`);
    expect(fileTab.getAttribute("target")).toBe("_blank");

    const dirTab = screen.getByRole("link", { name: /open assets\/ in a new tab/i });
    expect(dirTab.getAttribute("href")).toBe(`/a/${ID}/assets/`);
  });

  it("offers no parent link at the artifact root", async () => {
    stubListing({ files: [file("a.txt")] });
    await renderViewer();

    expect(screen.queryByRole("link", { name: /parent directory/i })).toBeNull();
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

    const input = screen.getByLabelText("Add files to this folder") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [new File(["x"], "new.txt")],
      configurable: true,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find((call) => String(call[0]) === "/api/upload");
      expect(uploadCall).toBeTruthy();
      const form = uploadCall![1]!.body as FormData;
      expect(form.get("mode")).toBe("directory");
      expect(form.get("id")).toBe(ID);
      expect((form.get("files") as File).name).toBe("new.txt");
    });
  });

  it("scopes the upload control to the current subfolder's path", async () => {
    const fetchMock = stubListing({ files: [file("style.css")], path: "css/" });
    await renderViewer("css/");

    const input = screen.getByLabelText("Add files to this folder") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [new File(["x"], "new.css")],
      configurable: true,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find((call) => String(call[0]) === "/api/upload");
      expect(uploadCall).toBeTruthy();
      const form = uploadCall![1]!.body as FormData;
      expect((form.get("files") as File).name).toBe("css/new.css");
    });
  });

  it("offers a delete control at the root only", async () => {
    stubListing({ files: [file("a.txt")] });
    await renderViewer();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("hides the delete control inside a subfolder, since it deletes the whole artifact", async () => {
    stubListing({ files: [file("style.css")], path: "css/" });
    await renderViewer("css/");
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("confirms before deleting, then reports the artifact is gone", async () => {
    const fetchMock = stubListing({ files: [file("a.txt")] });
    await renderViewer();

    screen.getByRole("button", { name: "Delete" }).click();

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
    vi.stubGlobal("confirm", vi.fn(() => false));
    const fetchMock = stubListing({ files: [file("a.txt")] });
    await renderViewer();

    screen.getByRole("button", { name: "Delete" }).click();

    await waitFor(() => expect(globalThis.confirm).toHaveBeenCalled());
    expect(
      fetchMock.mock.calls.some(
        (call) => call[1]?.method === "DELETE",
      ),
    ).toBe(false);
  });
});

describe("failure states", () => {
  it("reports a missing artifact instead of an empty viewer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 404 })),
    );
    render(
      <MemoryRouter initialEntries={[`/a/${ID}/`]}>
        <Routes>
          <Route path="/a/:id/*" element={<ViewerPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/doesn't exist, or was deleted/i)).toBeTruthy();
  });
});
