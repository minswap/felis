import * as fc from "fast-check";

import { ADA, Asset, Bytes, Value } from "../src";

// an Asset is either ADA or a pair of CurrencySymbol (28 bytes) and TokenName (0-32 bytes)
export const arbAsset: fc.Arbitrary<Asset> = fc.oneof(
  fc.constant(ADA),
  fc
    .tuple(fc.uint8Array({ minLength: 28, maxLength: 28 }), fc.uint8Array({ minLength: 0, maxLength: 32 }))
    .map(([currencySymbol, tokenName]) => new Asset(new Bytes(currencySymbol), new Bytes(tokenName))),
);

// a Value is a list of (asset, amount) pair
// amount must be a positive 64-bit integer since CSL can't parse number above 64 bit
export const arbValue: fc.Arbitrary<Value> = fc
  .uniqueArray(
    fc.tuple(
      arbAsset,
      fc.bigIntN(64).filter((x) => x > 0),
    ),
    {
      comparator: ([asset1], [asset2]) => asset1.equals(asset2),
    },
  )
  .map((arr) => arr.reduce<Value>((val, [asset, amount]) => val.add(asset, amount), new Value()));
