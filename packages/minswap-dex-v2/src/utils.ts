import { Asset } from "@repo/ledger-core";

export function normalizePair([a, b]: [Asset, Asset]): [Asset, Asset] {
  if (a.compare(b) > 0) {
    return [b, a];
  }
  return [a, b];
}
