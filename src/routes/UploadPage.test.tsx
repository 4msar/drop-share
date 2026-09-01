import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../contexts/AppProviders";
import { addRecentItem } from "../lib/recent";
import type { SelectedFile, UploadMode } from "../lib/upload";
import UploadPage from "./UploadPage";

const uploadArtifact = vi.hoisted(() => vi.fn());

vi.mock("../lib/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/upload")>()),
  uploadArtifact,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** A File whose reported size can exceed what we actually allocate. */
function fakeFile(name: string, size = 8): File {
  const file = new File(["x".repeat(8)], name);
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

function choose(label: string, files: File[]) {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function renderPage() {
  render(
    <AppProviders>
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("selection", () => {
  it("starts on the drop zone", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /drop files, zips, or folders here/i })).toBeTruthy();
  });

  it("asks how to handle a lone ZIP rather than guessing", () => {
    renderPage();
    choose("Choose files to upload", [fakeFile("bundle.zip")]);

    expect(screen.getByText(/how do you want to upload this zip/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload ZIP" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /extract & browse/i })).toBeTruthy();
  });

  it("goes straight to a single Upload action for ordinary files", () => {
    renderPage();
    choose("Choose files to upload", [fakeFile("a.txt"), fakeFile("b.txt")]);

    expect(screen.getByRole("button", { name: "Upload" })).toBeTruthy();
    expect(screen.getByText(/files selected/i).textContent).toMatch(/^2 files selected/);
  });

  it("reports the size cap client-side and does not attempt the upload", () => {
    renderPage();
    choose("Choose files to upload", [fakeFile("huge.bin", 11 * 1024 * 1024)]);

    expect(screen.getByRole("alert").textContent).toMatch(/exceeding the 10 MB maximum file size/i);
    expect(uploadArtifact).not.toHaveBeenCalled();
  });

  it("returns to the drop zone from the error state", () => {
    renderPage();
    choose("Choose files to upload", [fakeFile("huge.bin", 11 * 1024 * 1024)]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByRole("heading", { name: /drop files, zips, or folders here/i })).toBeTruthy();
  });
});

describe("uploading", () => {
  it("uploads a plain file as mode=file and shows the resulting link", async () => {
    uploadArtifact.mockResolvedValue({ id: "abc", url: "/a/abc/" });
    renderPage();
    choose("Choose files to upload", [fakeFile("a.txt")]);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(screen.getByText("Upload complete.")).toBeTruthy());
    expect(uploadArtifact).toHaveBeenCalledOnce();
    expect(uploadArtifact.mock.calls[0][0] as UploadMode).toBe("file");
    expect(screen.getByRole("link", { name: "/a/abc/" })).toBeTruthy();
  });

  it("uploads a multi-file selection as mode=directory", async () => {
    uploadArtifact.mockResolvedValue({ id: "abc", url: "/a/abc/" });
    renderPage();
    choose("Choose files to upload", [fakeFile("a.txt"), fakeFile("b.txt")]);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(uploadArtifact).toHaveBeenCalledOnce());
    expect(uploadArtifact.mock.calls[0][0] as UploadMode).toBe("directory");
  });

  it("sends the chosen ZIP mode through", async () => {
    uploadArtifact.mockResolvedValue({ id: "abc", url: "/a/abc/" });
    renderPage();
    choose("Choose files to upload", [fakeFile("bundle.zip")]);
    fireEvent.click(screen.getByRole("button", { name: /extract & browse/i }));

    await waitFor(() => expect(uploadArtifact).toHaveBeenCalledOnce());
    expect(uploadArtifact.mock.calls[0][0] as UploadMode).toBe("zip-extract");
  });

  it("preserves folder-relative paths for a directory selection", () => {
    renderPage();
    const nested = fakeFile("style.css");
    Object.defineProperty(nested, "webkitRelativePath", {
      value: "site/css/style.css",
      configurable: true,
    });
    choose("Choose a folder to upload", [nested]);

    expect(screen.getByRole("button", { name: "Upload" })).toBeTruthy();
  });

  it("surfaces a rejected upload instead of appearing to succeed", async () => {
    uploadArtifact.mockRejectedValue(new Error("Upload exceeds the maximum artifact size"));
    renderPage();
    choose("Choose files to upload", [fakeFile("a.txt")]);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(
        /^Upload exceeds the maximum artifact size/,
      ),
    );
  });

  it("reports progress while the upload runs", async () => {
    let reportProgress: ((fraction: number) => void) | undefined;
    uploadArtifact.mockImplementation(
      (_mode: UploadMode, _files: SelectedFile[], onProgress: (f: number) => void) => {
        reportProgress = onProgress;
        return new Promise(() => {});
      },
    );
    renderPage();
    choose("Choose files to upload", [fakeFile("a.txt")]);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(reportProgress).toBeDefined());
    reportProgress!(0.42);

    await waitFor(() => expect(screen.getByText(/uploading… 42%/i)).toBeTruthy());
  });
});

describe("recent artifacts", () => {
  it("shows no recent-artifacts toggle when nothing has been viewed yet", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: /recent artifacts/i })).toBeNull();
  });

  it("opens a drawer listing recently viewed artifacts and links to them", () => {
    addRecentItem("abc123", Date.now());
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /^recent artifacts$/i }));

    const link = screen.getByRole("link", { name: /abc123/i });
    expect(link.getAttribute("href")).toBe("/a/abc123/");
  });

  it("closes the drawer when clicking the backdrop behind it", () => {
    addRecentItem("abc123", Date.now());
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /^recent artifacts$/i }));
    expect(screen.getByRole("button", { name: /close recent artifacts/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /close recent artifacts/i }));

    expect(screen.queryByRole("button", { name: /close recent artifacts/i })).toBeNull();
    expect(
      screen.getByRole("button", { name: /^recent artifacts$/i }).getAttribute("aria-expanded"),
    ).toBe("false");
  });
});
