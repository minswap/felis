import fc from "fast-check";
import { describe, expect } from "vitest";
import * as B from "../src";

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0;
  }
  if (k === 0 || k === n) {
    return 1;
  }
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

describe("example-based testing", () => {
  test("pick 1 of [1,2,3]", () => {
    expect([...B.UtxoSelection.pickCombination([1, 2, 3], 1)]).toEqual([[1], [2], [3]]);
  });

  test("pick 2 of [1,2,3]", () => {
    expect([...B.UtxoSelection.pickCombination([1, 2, 3], 2)]).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
  });

  test("pick 3 of [1,2,3]", () => {
    expect([...B.UtxoSelection.pickCombination([1, 2, 3], 3)]).toEqual([[1, 2, 3]]);
  });

  test("pick 2 of [1,2,3,4]", () => {
    expect([...B.UtxoSelection.pickCombination([1, 2, 3, 4], 2)]).toEqual([
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
      [3, 4],
    ]);
  });

  test("works with generic string type", () => {
    expect([...B.UtxoSelection.pickCombination(["a", "b", "c"], 2)]).toEqual([
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ]);
  });

  test("works with generic object type", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect([...B.UtxoSelection.pickCombination(items, 2)]).toEqual([
      [{ id: 1 }, { id: 2 }],
      [{ id: 1 }, { id: 3 }],
      [{ id: 2 }, { id: 3 }],
    ]);
  });

  test("preserves input order within each combination", () => {
    expect([...B.UtxoSelection.pickCombination([3, 1, 2], 2)]).toEqual([
      [3, 1],
      [3, 2],
      [1, 2],
    ]);
  });

  test("count = 0 yields nothing", () => {
    expect([...B.UtxoSelection.pickCombination([1, 2, 3], 0)]).toEqual([]);
  });

  test("count > items.length yields nothing", () => {
    expect([...B.UtxoSelection.pickCombination([1, 2], 3)]).toEqual([]);
  });

  test("negative count yields nothing", () => {
    expect([...B.UtxoSelection.pickCombination([1, 2, 3], -1)]).toEqual([]);
  });

  test("empty input yields nothing", () => {
    expect([...B.UtxoSelection.pickCombination<number>([], 1)]).toEqual([]);
  });

  test("each yielded combination is an independent array", () => {
    const combos = [...B.UtxoSelection.pickCombination([1, 2, 3], 2)];
    combos[0].push(999);
    expect(combos[1]).toEqual([1, 3]);
  });

  test("supports lazy iteration with early break", () => {
    const gen = B.UtxoSelection.pickCombination([1, 2, 3, 4, 5], 3);
    const first = gen.next();
    expect(first.value).toEqual([1, 2, 3]);
    expect(first.done).toBe(false);
    const second = gen.next();
    expect(second.value).toEqual([1, 2, 4]);
  });
});

describe("stopFn", () => {
  const sum = (combo: number[]) => combo.reduce((a, b) => a + b, 0);

  test("filters by sum >= threshold on descending items", () => {
    expect([...B.UtxoSelection.pickCombination([8, 6, 5, 2, 1], 2, (c) => sum(c) >= 11)]).toEqual([
      [8, 6],
      [8, 5],
      [6, 5],
    ]);
  });

  test("yields nothing when no combination passes", () => {
    expect([...B.UtxoSelection.pickCombination([1, 2, 3], 2, (c) => sum(c) >= 100)]).toEqual([]);
  });

  test("stopFn returning true for all yields every combination", () => {
    expect([...B.UtxoSelection.pickCombination([3, 2, 1], 2, () => true)]).toEqual([
      [3, 2],
      [3, 1],
      [2, 1],
    ]);
  });

  test("stopFn is always called with a length-count combo (look-ahead)", () => {
    const items = [5, 4, 3, 2, 1];
    const count = 3;
    const seen: number[][] = [];
    [
      ...B.UtxoSelection.pickCombination(items, count, (c) => {
        seen.push([...c]);
        return true;
      }),
    ];
    expect(seen.length).toBeGreaterThan(0);
    for (const c of seen) {
      expect(c.length).toBe(count);
    }
  });

  test("pruning skips dominated branches", () => {
    let calls = 0;
    const result = [
      ...B.UtxoSelection.pickCombination([8, 6, 5, 2, 1], 2, (c) => {
        calls++;
        return sum(c) >= 11;
      }),
    ];
    expect(result).toEqual([
      [8, 6],
      [8, 5],
      [6, 5],
    ]);
    expect(calls).toBeLessThan(binomial(5, 2));
  });

  test("pruning works at deeper levels with count=3", () => {
    expect([...B.UtxoSelection.pickCombination([8, 6, 5, 2, 1], 3, (c) => sum(c) >= 14)]).toEqual([
      [8, 6, 5],
      [8, 6, 2],
      [8, 6, 1],
      [8, 5, 2],
      [8, 5, 1],
    ]);
  });

  test("supports lazy iteration with stopFn", () => {
    const gen = B.UtxoSelection.pickCombination([8, 6, 5, 2, 1], 2, (c) => sum(c) >= 11);
    expect(gen.next().value).toEqual([8, 6]);
    expect(gen.next().value).toEqual([8, 5]);
    expect(gen.next().value).toEqual([6, 5]);
    expect(gen.next().done).toBe(true);
  });
});

describe("property-based testing", () => {
  test("count of yielded combinations equals C(n, k)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 8 }),
        fc.integer({ min: -2, max: 10 }),
        (items, count) => {
          const combos = [...B.UtxoSelection.pickCombination(items, count)];
          const expected = count <= 0 || count > items.length ? 0 : binomial(items.length, count);
          expect(combos.length).toBe(expected);
        },
      ),
    );
  });

  test("each combination has length equal to count", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 1, max: 8 }),
        (items, count) => {
          fc.pre(count <= items.length);
          for (const combo of B.UtxoSelection.pickCombination(items, count)) {
            expect(combo.length).toBe(count);
          }
        },
      ),
    );
  });

  test("all yielded combinations are unique", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer(), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 1, max: 8 }),
        (items, count) => {
          fc.pre(count <= items.length);
          const seen = new Set<string>();
          for (const combo of B.UtxoSelection.pickCombination(items, count)) {
            const key = JSON.stringify(combo);
            expect(seen.has(key)).toBe(false);
            seen.add(key);
          }
        },
      ),
    );
  });

  test("each combination preserves input order", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 1, max: 8 }),
        (items, count) => {
          fc.pre(count <= items.length);
          const indexOf = new Map<number, number>();
          items.forEach((v, i) => {
            if (!indexOf.has(v)) {
              indexOf.set(v, i);
            }
          });
          for (const combo of B.UtxoSelection.pickCombination(items, count)) {
            for (let i = 1; i < combo.length; i++) {
              const prev = items.indexOf(combo[i - 1]);
              const curr = items.indexOf(combo[i], prev + 1);
              expect(curr).toBeGreaterThan(prev);
            }
          }
        },
      ),
    );
  });
});
