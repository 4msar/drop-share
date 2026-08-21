import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const response = await exports.default.fetch("https://artifacts.example.com/api/health");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, status: "ok" });
  });
});
