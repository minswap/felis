import { Result, RustModule } from "@repo/ledger-utils";
import * as fc from "fast-check";
import { isDeepEqual } from "remeda";
import { beforeAll, describe, test } from "vitest";
import { CardanoAddress } from "../src";
import { arbAddress } from "./arb-things";

beforeAll(async () => {
  await RustModule.load();
});

describe("property-based testing", () => {
  test("can do round-trip bech32 conversion", () => {
    fc.assert(
      fc.property(arbAddress, (addr) => {
        return isDeepEqual(CardanoAddress.decodeCardanoAddress(Result.unwrap(CardanoAddress.toBech32(addr))), addr);
      }),
    );
  });

  test("convert to bech32 like CSL", () => {
    fc.assert(
      fc.property(arbAddress, (addr) => {
        return Result.unwrap(CardanoAddress.toBech32(addr)) === CardanoAddress.toCSL(addr).to_bech32();
      }),
    );
  });

  test("parse bech32 like CSL", () => {
    const CSL = RustModule.get;
    fc.assert(
      fc.property(arbAddress, (addr) => {
        return isDeepEqual(
          CardanoAddress.fromCSL(CSL.Address.from_bech32(Result.unwrap(CardanoAddress.toBech32(addr)))),
          addr,
        );
      }),
    );
  });
});
