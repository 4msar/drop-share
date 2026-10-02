import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { saveToken } from "../lib/tokens";
import { RecentList } from "./RecentList";

const A = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

afterEach(() => localStorage.clear());

function renderItems(items: Parameters<typeof RecentList>[0]["items"]) {
  render(
    <MemoryRouter>
      <RecentList items={items} />
    </MemoryRouter>,
  );
}

describe("RecentList links", () => {
  it("reopens a share-link visit through its read-only share URL", () => {
    renderItems([{ id: A, visitedAt: 1, label: "Shared", shareUrl: `/s/${A}.abc/` }]);
    expect(screen.getByRole("link", { name: /shared/i }).getAttribute("href")).toBe(`/s/${A}.abc/`);
  });

  it("prefers the owner's saved token over a remembered share URL", () => {
    saveToken(A, "owner");
    renderItems([{ id: A, visitedAt: 1, label: "Mine", shareUrl: `/s/${A}.abc/` }]);
    expect(screen.getByRole("link", { name: /mine/i }).getAttribute("href")).toBe(`/a/${A}/?token=owner`);
  });

  it("falls back to the plain viewer URL", () => {
    renderItems([{ id: A, visitedAt: 1, label: "Plain" }]);
    expect(screen.getByRole("link", { name: /plain/i }).getAttribute("href")).toBe(`/a/${A}/`);
  });
});
