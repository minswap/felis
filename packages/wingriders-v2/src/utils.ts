import type { Asset } from "@minswap/felis-ledger-core";

export function normalizePair([a, b]: [Asset, Asset]): [Asset, Asset] {
  if (a.compare(b) > 0) {
    return [b, a];
  }
  return [a, b];
}

export function isNormalizePair([a, b]: [Asset, Asset]): boolean {
  return a.compare(b) <= 0;
}
