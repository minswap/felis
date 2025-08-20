import { describe, expect, it } from "vitest";
import { parseIntSafe } from "../src";

describe("parseIntSafe", () => {
  it("valid positive integers", () => {
    expect(parseIntSafe("123")).toBe(123);
  });

  it("valid negative integers", () => {
    expect(parseIntSafe("-123")).toBe(-123);
  });

  it("throw an error for non-numeric strings", () => {
    expect(() => parseIntSafe("123n")).toThrow();
    expect(() => parseIntSafe("safsdf")).toThrow();
    expect(() => parseIntSafe("asdad123")).toThrow();
    expect(() => parseIntSafe("123safdsf")).toThrow();
    expect(() => parseIntSafe("123sa12312fdsf")).toThrow();
  });
});
