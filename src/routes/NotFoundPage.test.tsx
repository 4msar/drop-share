import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../contexts/AppProviders";
import NotFoundPage from "./NotFoundPage";

describe("catch-all route", () => {
  it("renders the not-found page for an unknown path", async () => {
    render(
      <AppProviders>
        <MemoryRouter initialEntries={["/no/such/page"]}>
          <Routes>
            <Route path="/" element={<p>home</p>} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </MemoryRouter>
      </AppProviders>,
    );
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go home" })).toBeTruthy();
    expect(document.title).toBe("Page not found · Drop Share");
  });
});
