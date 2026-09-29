import { describe, expect, it } from "vitest";
import { normaliseCode, resolveAvailability } from "./discount-code-availability";

describe("normaliseCode", () => {
  it("upper-cases and trims", () => {
    expect(normaliseCode("  summer20 ")).toBe("SUMMER20");
  });

  it("returns an empty string for nothing", () => {
    expect(normaliseCode(null)).toBe("");
  });
});

describe("resolveAvailability", () => {
  it("is available when nothing matches", () => {
    expect(
      resolveAvailability({ code: "NEW10", localMatches: [], momenceCodes: new Set() }),
    ).toEqual({
      code: "NEW10",
      available: true,
      takenBy: null,
      momenceChecked: true,
      message: "NEW10 is available.",
    });
  });

  it("is taken when an existing request already uses the code", () => {
    const result = resolveAvailability({
      code: "SUMMER20",
      localMatches: [{ code: "SUMMER20", status: "approved" }],
      momenceCodes: new Set(),
    });
    expect(result.available).toBe(false);
    expect(result.takenBy).toBe("request");
    expect(result.message).toContain("already requested");
  });

  it("is taken when Momence already holds the code", () => {
    const result = resolveAvailability({
      code: "SUMMER20",
      localMatches: [],
      momenceCodes: new Set(["SUMMER20"]),
    });
    expect(result.available).toBe(false);
    expect(result.takenBy).toBe("momence");
    expect(result.message).toContain("already exists in Momence");
  });

  it("compares case-insensitively", () => {
    const result = resolveAvailability({
      code: "summer20",
      localMatches: [],
      momenceCodes: new Set(["SUMMER20"]),
    });
    expect(result.available).toBe(false);
  });

  it("ignores a rejected request so its code can be reused", () => {
    const result = resolveAvailability({
      code: "SUMMER20",
      localMatches: [{ code: "SUMMER20", status: "rejected" }],
      momenceCodes: new Set(),
    });
    expect(result.available).toBe(true);
  });

  it("reports the code as taken by Momence even if a rejected request exists", () => {
    const result = resolveAvailability({
      code: "SUMMER20",
      localMatches: [{ code: "SUMMER20", status: "rejected" }],
      momenceCodes: new Set(["SUMMER20"]),
    });
    expect(result.available).toBe(false);
    expect(result.takenBy).toBe("momence");
  });

  it("stays usable, and says so, when Momence could not be checked", () => {
    const result = resolveAvailability({
      code: "NEW10",
      localMatches: [],
      momenceCodes: null,
    });
    expect(result.available).toBe(true);
    expect(result.momenceChecked).toBe(false);
    expect(result.message).toContain("could not be checked");
  });

  it("still blocks a local duplicate when Momence is unreachable", () => {
    const result = resolveAvailability({
      code: "SUMMER20",
      localMatches: [{ code: "SUMMER20", status: "pending" }],
      momenceCodes: null,
    });
    expect(result.available).toBe(false);
    expect(result.takenBy).toBe("request");
  });

  it("rejects an empty code", () => {
    const result = resolveAvailability({ code: "", localMatches: [], momenceCodes: new Set() });
    expect(result.available).toBe(false);
    expect(result.takenBy).toBe(null);
  });
});
