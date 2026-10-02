import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../contexts/AppProviders";
import { deriveShareToken, hashPassword } from "../lib/hash";
import { getStoredToken, saveToken } from "../lib/tokens";
import { getRecentItems } from "../lib/recent";
import { getSavedSidebarOpen } from "../lib/sidebar";
import ViewerPage from "./ViewerPage";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const OWNER_TOKEN = "owner-token";
const SHARE = "share-token";

interface StubOptions {
  visibility?: "public" | "private";
  locked?: boolean;
  /** Which token query param makes canModify true. */
  ownerToken?: string;
}

function stubApi({ visibility = "public", locked = true, ownerToken = OWNER_TOKEN }: StubOptions = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    if (init?.method === "PATCH") {
      return Response.json({ success: true, id: ID, visibility: "public", locked: true });
    }
    const suppliedToken = url.searchParams.get("token");
    const suppliedShare = url.searchParams.get("share");
    const canRead =
      visibility === "public" ||
      suppliedToken === ownerToken ||
      suppliedShare === SHARE ||
      suppliedShare === (await deriveShareToken(ownerToken));
    if (!canRead) {
      return Response.json({ success: false, error: "Artifact not found" }, { status: 404 });
    }
    return Response.json({
      success: true,
      id: ID,
      path: url.searchParams.get("path") ?? "",
      files: [
        { name: "index.html", size: 10, previewable: true, markdown: false },
        { name: "data.bin", size: 10, previewable: false, markdown: false },
      ],
      directories: ["css/"],
      locked,
      canModify: url.searchParams.get("token") === ownerToken,
      visibility,
      label: "Site",
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderAt(entry: string) {
  render(
    <AppProviders>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/a/:id/*" element={<ViewerPage />} />
          <Route path="/s/:seg/*" element={<ViewerPage shared />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
  await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  await screen.findByTitle("File preview");
}

async function renderUnavailable(entry: string) {
  render(
    <AppProviders>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/a/:id/*" element={<ViewerPage />} />
          <Route path="/s/:seg/*" element={<ViewerPage shared />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
  await screen.findByRole("heading", { name: "Artifact unavailable" });
}

async function openMenu() {
  screen.getByRole("button", { name: "More actions" }).click();
  await screen.findByRole("button", { name: "Share" });
}

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal("confirm", vi.fn(() => true));
  writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("read-only share route", () => {
  it("fetches with the share token and builds every link under the /s/ prefix", async () => {
    const fetchMock = stubApi({ visibility: "private" });
    await renderAt(`/s/${ID}.${SHARE}/`);

    const listingCall = String(fetchMock.mock.calls[0][0]);
    expect(listingCall).toContain(`share=${SHARE}`);
    expect(listingCall).not.toContain("token=");

    expect(screen.getByTitle("File preview").getAttribute("src")).toBe(`/s/${ID}.${SHARE}/index.html`);
    expect(screen.getByRole("link", { name: "data.bin" }).getAttribute("href")).toBe(
      `/s/${ID}.${SHARE}/data.bin`,
    );
    expect(screen.getByRole("link", { name: "css/" }).getAttribute("href")).toBe(`/s/${ID}.${SHARE}/css/`);
    expect(screen.getByText("View only")).toBeTruthy();
    expect(screen.getByText("Private")).toBeTruthy();
  });

  it("shows no modify controls, and ignores an owner token in the query", async () => {
    const fetchMock = stubApi({ visibility: "private" });
    await renderAt(`/s/${ID}.${SHARE}/?token=${OWNER_TOKEN}`);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("token=");

    await openMenu();
    for (const name of [/rename/i, /upload more/i, /^lock$/i, /^unlock$/i, /delete/i, /make public/i]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.getByRole("link", { name: /download as zip/i }).getAttribute("href")).toBe(
      `/api/artifact/${ID}/download?share=${SHARE}`,
    );
  });

  it("serves a public artifact under /s/<id>/ with no token", async () => {
    stubApi({ visibility: "public" });
    await renderAt(`/s/${ID}/`);
    expect(screen.getByTitle("File preview").getAttribute("src")).toBe(`/s/${ID}/index.html`);
    expect(screen.queryByText("Private")).toBeNull();
  });

  it("remembers the share URL in the recent list", async () => {
    stubApi({ visibility: "private" });
    await renderAt(`/s/${ID}.${SHARE}/`);
    await waitFor(() => expect(getRecentItems()[0]?.shareUrl).toBe(`/s/${ID}.${SHARE}/`));
  });
});

describe("owner view of a private artifact", () => {
  it("previews raw files through the derived share prefix", async () => {
    stubApi({ visibility: "private" });
    await renderAt(`/a/${ID}/?token=${OWNER_TOKEN}`);
    const share = await deriveShareToken(OWNER_TOKEN);
    expect(screen.getByTitle("File preview").getAttribute("src")).toBe(`/s/${ID}.${share}/index.html`);
    // In-app navigation stays on /a/ with the owner token.
    expect(screen.getByRole("link", { name: "css/" }).getAttribute("href")).toBe(
      `/a/${ID}/css/?token=${OWNER_TOKEN}`,
    );
  });

  it("copies a read-only /s/ link, never the owner token", async () => {
    stubApi({ visibility: "private" });
    await renderAt(`/a/${ID}/?token=${OWNER_TOKEN}`);
    await openMenu();
    screen.getByRole("button", { name: "Share" }).click();
    const share = await deriveShareToken(OWNER_TOKEN);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`http://localhost:3000/s/${ID}.${share}/`));
  });

  it("makes the artifact public after confirming", async () => {
    const fetchMock = stubApi({ visibility: "private" });
    await renderAt(`/a/${ID}/?token=${OWNER_TOKEN}`);
    await openMenu();
    screen.getByRole("button", { name: "Make public" }).click();
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((call) => call[1]?.method === "PATCH");
      expect(patch).toBeTruthy();
      expect(JSON.parse(String(patch![1]!.body))).toEqual({ visibility: "public" });
      expect((patch![1]!.headers as Record<string, string>)["X-Artifact-Token"]).toBe(OWNER_TOKEN);
    });
  });

  it("offers Make private only to the owner of a locked artifact", async () => {
    stubApi({ visibility: "public" });
    await renderAt(`/a/${ID}/?token=${OWNER_TOKEN}`);
    await openMenu();
    expect(screen.getByRole("button", { name: "Make private" })).toBeTruthy();
  });

  it("copies a public /s/ link for a public artifact", async () => {
    stubApi({ visibility: "public", locked: false });
    await renderAt(`/a/${ID}/`);
    await openMenu();
    expect(screen.queryByRole("button", { name: "Make private" })).toBeNull();
    screen.getByRole("button", { name: "Share" }).click();
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`http://localhost:3000/s/${ID}/`));
  });
});

describe("file list toggle", () => {
  it("remembers a closed file list across reloads", async () => {
    stubApi();
    await renderAt(`/a/${ID}/`);
    screen.getByRole("button", { name: "Close file list" }).click();
    await screen.findByRole("button", { name: "Open file list" });
    expect(getSavedSidebarOpen()).toBe(false);

    cleanup();
    await renderAt(`/a/${ID}/`);
    expect(screen.getByRole("button", { name: "Open file list" })).toBeTruthy();
  });

  it("does not let a resize override the saved choice", async () => {
    stubApi();
    await renderAt(`/a/${ID}/`);
    screen.getByRole("button", { name: "Close file list" }).click();
    await screen.findByRole("button", { name: "Open file list" });

    window.dispatchEvent(new Event("resize"));
    expect(screen.getByRole("button", { name: "Open file list" })).toBeTruthy();
  });
});

describe("owner corner cases on a private artifact", () => {
  it("downloads the ZIP through the share token (a link can't send the owner header)", async () => {
    stubApi({ visibility: "private" });
    await renderAt(`/a/${ID}/?token=${OWNER_TOKEN}`);
    await openMenu();
    const share = await deriveShareToken(OWNER_TOKEN);
    expect(screen.getByRole("link", { name: /download as zip/i }).getAttribute("href")).toBe(
      `/api/artifact/${ID}/download?share=${share}`,
    );
  });

  it("opens a folder in a new tab through the read-only share link", async () => {
    stubApi({ visibility: "private" });
    await renderAt(`/a/${ID}/?token=${OWNER_TOKEN}`);
    screen.getByRole("button", { name: "Actions for css/" }).click();
    const share = await deriveShareToken(OWNER_TOKEN);
    expect((await screen.findByRole("menuitem", { name: /open in new tab/i })).getAttribute("href")).toBe(
      `/s/${ID}.${share}/css/`,
    );
  });

  it("retries with this browser's saved token when the bare URL 404s", async () => {
    const fetchMock = stubApi({ visibility: "private" });
    saveToken(ID, OWNER_TOKEN);
    await renderAt(`/a/${ID}/`);
    expect(screen.queryByText("Artifact unavailable")).toBeNull();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes(`token=${OWNER_TOKEN}`))).toBe(true);
  });

  it("shows the unavailable page, without looping, when the saved token is stale", async () => {
    const fetchMock = stubApi({ visibility: "private" });
    saveToken(ID, "stale-token");
    await renderUnavailable(`/a/${ID}/`);
    // One bare attempt plus one retry with the saved token - then it stops.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  it("lets the owner unlock from the unavailable page on a new device", async () => {
    const ownerToken = await hashPassword(ID, "hunter2");
    stubApi({ visibility: "private", ownerToken });
    await renderUnavailable(`/a/${ID}/`);

    screen.getByRole("button", { name: /unlock with password/i }).click();
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "hunter2" } });
    fireEvent.submit(screen.getByLabelText("Password").closest("form")!);

    await screen.findByTitle("File preview");
    expect(getStoredToken(ID)).toBe(ownerToken);
  });

  it("reports a wrong password without revealing whether the artifact exists", async () => {
    stubApi({ visibility: "private", ownerToken: await hashPassword(ID, "hunter2") });
    await renderUnavailable(`/a/${ID}/`);

    screen.getByRole("button", { name: /unlock with password/i }).click();
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.submit(screen.getByLabelText("Password").closest("form")!);

    expect(await screen.findByText("Incorrect password, or this artifact doesn't exist.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Artifact unavailable" })).toBeTruthy();
  });

  it("offers no unlock on a share link with a bad token", async () => {
    stubApi({ visibility: "private" });
    await renderUnavailable(`/s/${ID}.wrong/`);
    expect(screen.queryByRole("button", { name: /unlock/i })).toBeNull();
  });
});

describe("share route corner cases", () => {
  it("treats an empty token after the dot as no token", async () => {
    const fetchMock = stubApi({ visibility: "public" });
    await renderAt(`/s/${ID}./`);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("share=");
    expect(screen.getByTitle("File preview").getAttribute("src")).toBe(`/s/${ID}/index.html`);
  });

  it("refuses a drag-and-drop upload with a view-only message", async () => {
    const fetchMock = stubApi({ visibility: "private" });
    await renderAt(`/s/${ID}.${SHARE}/`);
    fireEvent.drop(screen.getByRole("navigation", { name: /files in this artifact/i }), {
      dataTransfer: { items: [{ kind: "file", webkitGetAsEntry: () => null, getAsFile: () => new File(["x"], "x.txt") }] },
    });
    expect(await screen.findByText(/view-only link/i)).toBeTruthy();
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === "/api/upload")).toBe(false);
  });

  it("keeps folder navigation inside the share route", async () => {
    stubApi({ visibility: "private" });
    await renderAt(`/s/${ID}.${SHARE}/css/`);
    expect(screen.getByRole("link", { name: /parent directory/i }).getAttribute("href")).toBe(`/s/${ID}.${SHARE}/`);
  });

  it("never stores a share-link visit's token as an owner token", async () => {
    stubApi({ visibility: "private" });
    await renderAt(`/s/${ID}.${SHARE}/?token=${OWNER_TOKEN}`);
    expect(getStoredToken(ID)).toBeNull();
  });
});
