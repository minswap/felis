import { expect, test } from "vitest";
import { Maybe } from "../src";

test("mapTakeJust", () => {
  expect(Maybe.mapTakeJust([1, 2, 3, 4, 5], (x) => (x % 2 === 0 ? x * 5 : null))).toEqual([10, 20]);
});
