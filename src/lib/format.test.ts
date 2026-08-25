import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./format";

const NOW = new Date("2026-08-25T12:00:00Z").getTime();

describe("formatRelativeTime", () => {
  it("reports timestamps under a minute old as just now", () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe("just now");
  });

  it("reports minutes for timestamps under an hour old", () => {
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("5m ago");
  });

  it("reports hours for timestamps under a day old", () => {
    expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3h ago");
  });

  it("reports days for timestamps under 30 days old", () => {
    expect(formatRelativeTime(NOW - 2 * 86_400_000, NOW)).toBe("2d ago");
  });
});
