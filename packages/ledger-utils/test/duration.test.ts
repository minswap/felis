import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { Duration, parseIntSafe } from "../src";

function fromString(s: string): number {
  const parts = s.split(" ");
  let ret = 0;
  for (const part of parts) {
    const x = parseIntSafe(part.slice(0, -1));
    const unit = part.slice(-1);
    switch (unit) {
      case "d":
        ret += x * 1000 * 3600 * 24;
        break;
      case "h":
        ret += x * 1000 * 3600;
        break;
      case "m":
        ret += x * 1000 * 60;
        break;
      case "s":
        ret += x * 1000;
        break;
      default:
        throw new Error(`unexpect unit when parse Duration from string: ${unit}`);
    }
  }
  return ret;
}

describe("example-based testing", () => {
  test("constructor", () => {
    expect(Duration.newWeeks(1).days).toBe(7);
    expect(Duration.newDays(1).hours).toBe(24);
    expect(Duration.newHours(1).minutes).toBe(60);
    expect(Duration.newMinutes(1).seconds).toBe(60);
    expect(Duration.newSeconds(1).milliseconds).toBe(1000);
  });

  test("toString", () => {
    expect(Duration.newWeeks(1).toString()).toBe("7d");
    expect(Duration.newDays(1).toString()).toBe("1d");
    expect(Duration.newHours(1).toString()).toBe("1h");
    expect(Duration.newMinutes(1).toString()).toBe("1m");
    expect(Duration.newSeconds(1).toString()).toBe("1s");
    expect(Duration.newMilliseconds(1).toString()).toBe("0.001s");
    expect(Duration.newMilliseconds(0).toString()).toBe("0s");

    expect(Duration.newMilliseconds(604800001).toString()).toBe("7d 0.001s");
    expect(Duration.newMilliseconds(90061001).toString()).toBe("1d 1h 1m 1.001s");
  });
});

describe("property-based testing", () => {
  test("constructor", () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000 }), (x) => {
        expect(Duration.newWeeks(x).weeks).toEqual(x);
        expect(Duration.newDays(x).days).toEqual(x);
        expect(Duration.newHours(x).hours).toEqual(x);
        expect(Duration.newMinutes(x).minutes).toEqual(x);
        expect(Duration.newSeconds(x).seconds).toEqual(x);
        expect(Duration.newMilliseconds(x).milliseconds).toEqual(x);
      }),
    );
  });

  test("before", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date(0) }), fc.nat(), (date, durationMs) => {
        const dateBefore = Duration.before(date, Duration.newMilliseconds(durationMs));
        expect(Duration.between(date, dateBefore).milliseconds).toEqual(durationMs);
      }),
    );
  });

  test("after", () => {
    fc.assert(
      fc.property(fc.date({ max: new Date(1e9) }), fc.nat(), (date, durationMs) => {
        const dateAfter = Duration.after(date, Duration.newMilliseconds(durationMs));
        expect(Duration.between(date, dateAfter).milliseconds).toEqual(durationMs);
      }),
    );
  });

  test("toString", () => {
    fc.assert(
      fc.property(fc.nat(), (ms) => {
        const str = Duration.newMilliseconds(ms).toString();
        expect(fromString(str)).toEqual(ms);
      }),
    );
  });
});
