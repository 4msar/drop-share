import { describe, expect, it } from "vitest";
import { PayloadTooLargeError, SizeBudget, checkFileSize } from "./validation.js";

describe("checkFileSize", () => {
  it("allows a file at exactly the limit", () => {
    expect(() => checkFileSize(10, 10, "a.txt")).not.toThrow();
  });

  it("allows a file under the limit", () => {
    expect(() => checkFileSize(5, 10, "a.txt")).not.toThrow();
  });

  it("rejects a file over the limit with PayloadTooLargeError", () => {
    expect(() => checkFileSize(11, 10, "a.txt")).toThrow(PayloadTooLargeError);
  });

  it("rejects an empty budget check but allows zero-byte files", () => {
    expect(() => checkFileSize(0, 10, "empty.txt")).not.toThrow();
  });
});

describe("SizeBudget", () => {
  it("tracks cumulative size across multiple adds", () => {
    const budget = new SizeBudget(10);
    budget.add(4);
    budget.add(4);
    expect(budget.used).toBe(8);
  });

  it("allows reaching exactly the max", () => {
    const budget = new SizeBudget(10);
    budget.add(6);
    expect(() => budget.add(4)).not.toThrow();
    expect(budget.used).toBe(10);
  });

  it("throws PayloadTooLargeError once the cumulative total exceeds the max", () => {
    const budget = new SizeBudget(10);
    budget.add(6);
    expect(() => budget.add(5)).toThrow(PayloadTooLargeError);
  });

  it("does not partially apply an add that would exceed the budget", () => {
    const budget = new SizeBudget(10);
    budget.add(6);
    try {
      budget.add(5);
    } catch {
      // expected
    }
    expect(budget.used).toBe(6);
  });

  it("rejects a single add larger than the entire budget", () => {
    const budget = new SizeBudget(10);
    expect(() => budget.add(11)).toThrow(PayloadTooLargeError);
  });
});
