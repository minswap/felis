import { RustModule } from "@repo/ledger-utils";
import { beforeAll, describe, expect, test } from "vitest";
import { Bytes, PlutusBytes, PlutusInt, Redeemer, RedeemerType } from "../src";

beforeAll(async () => {
  await RustModule.load();
});

describe("Redeemer test", () => {
  test("CSL and Minswap serialization comparison", () => {
    const redeemers: Redeemer[] = [
      {
        type: RedeemerType.SPEND,
        index: 0,
        redeemerData: {
          constructor: 0,
          fields: [PlutusInt.wrap(10), PlutusBytes.wrap(Bytes.fromHex("ff"))],
        },
        exUnit: {
          memory: 100000n,
          step: 200000n,
        },
      },
      {
        type: RedeemerType.MINT,
        index: 0,
        redeemerData: {
          constructor: 0,
          fields: [PlutusInt.wrap(10), PlutusBytes.wrap(Bytes.fromHex("ff"))],
        },
        exUnit: {
          memory: 100000n,
          step: 200000n,
        },
      },
      {
        type: RedeemerType.REWARD,
        index: 0,
        redeemerData: {
          constructor: 0,
          fields: [PlutusInt.wrap(10), PlutusBytes.wrap(Bytes.fromHex("ff"))],
        },
        exUnit: {
          memory: 100000n,
          step: 200000n,
        },
      },
      {
        type: RedeemerType.CERT,
        index: 0,
        redeemerData: {
          constructor: 0,
          fields: [PlutusInt.wrap(10), PlutusBytes.wrap(Bytes.fromHex("ff"))],
        },
        exUnit: {
          memory: 100000n,
          step: 200000n,
        },
      },
    ];

    expect(Redeemer.toCSL(redeemers).to_hex()).toEqual(Redeemer.toHex(redeemers));
  });
});
