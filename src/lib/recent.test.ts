import { afterEach, describe, expect, it, vi } from "vitest";
import { addRecentItem, getRecentItems, removeRecentItem } from "./recent";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("getRecentItems", () => {
  it("returns an empty array when nothing has been stored", () => {
    expect(getRecentItems()).toEqual([]);
  });
});

describe("addRecentItem", () => {
  it("adds a new item to the front of the list", () => {
    const items = addRecentItem("abc123", 1000);
    expect(items).toEqual([{ id: "abc123", visitedAt: 1000 }]);
    expect(getRecentItems()).toEqual([{ id: "abc123", visitedAt: 1000 }]);
  });

  it("moves an existing id to the front with an updated timestamp instead of duplicating it", () => {
    addRecentItem("first", 1000);
    addRecentItem("second", 2000);
    const items = addRecentItem("first", 3000);

    expect(items).toEqual([
      { id: "first", visitedAt: 3000 },
      { id: "second", visitedAt: 2000 },
    ]);
  });

  it("evicts the oldest entry and retries when the store is full", () => {
    addRecentItem("old", 1000);
    addRecentItem("mid", 2000);

    const originalSetItem = Storage.prototype.setItem.bind(localStorage);
    vi.spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new DOMException("exceeded quota", "QuotaExceededError");
      })
      .mockImplementation(originalSetItem);

    const items = addRecentItem("new", 3000);

    // "old" (visitedAt 1000) is the oldest of the three and gets dropped so
    // the write can succeed.
    expect(items).toEqual([
      { id: "new", visitedAt: 3000 },
      { id: "mid", visitedAt: 2000 },
    ]);
  });
});

describe("removeRecentItem", () => {
  it("removes the matching id from recent items", () => {
    addRecentItem("first", 1000);
    addRecentItem("second", 2000);

    const items = removeRecentItem("second");

    expect(items).toEqual([{ id: "first", visitedAt: 1000 }]);
    expect(getRecentItems()).toEqual([{ id: "first", visitedAt: 1000 }]);
  });

  it("returns the current list when the id is not present", () => {
    addRecentItem("first", 1000);

    const items = removeRecentItem("missing");

    expect(items).toEqual([{ id: "first", visitedAt: 1000 }]);
  });
});
