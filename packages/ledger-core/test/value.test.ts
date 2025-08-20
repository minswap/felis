import { RustModule } from "@repo/ledger-utils";
import * as fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { ADA, Asset, Bytes, Value } from "../src";
import { arbValue } from "./arb-things";

beforeAll(async () => {
  await RustModule.load();
});

describe("example-based testing", () => {
  it("works", () => {
    const value = new Value();
    const tMIN = new Asset(
      Bytes.fromHex("c13eaa5804a65587ec36db51d21bcd8847efea3627e8a07e12cf304b"),
      Bytes.fromString("tMIN"),
    );
    value.add(ADA, 100_000_000n);
    expect(value.has(ADA)).toBeTruthy();
    expect(value.get(ADA)).toEqual(100_000_000n);

    expect(value.has(tMIN)).toBeFalsy();
    expect(value.get(tMIN)).toEqual(0n);

    value.add(tMIN, 50_000_000n);

    const spendValue = new Value().add(ADA, 50_000_000n).add(tMIN, 25_000_000n);

    value.subtractAll(spendValue).addAll(spendValue);

    expect(value.get(ADA)).toEqual(100_000_000n);
    expect(value.get(tMIN)).toEqual(50_000_000n);
  });

  it("can do round-trip CSL conversion", () => {
    const tMIN = new Asset(
      Bytes.fromHex("c13eaa5804a65587ec36db51d21bcd8847efea3627e8a07e12cf304b"),
      Bytes.fromString("tMIN"),
    );
    const val = new Value().add(ADA, 1_000_000n).add(tMIN, 1_500_000n);
    const val2 = Value.fromHex(val.toCSL().to_hex());
    expect(val.equals(val2)).toBeTruthy();
  });
});

describe("property-based testing", () => {
  it("can do round-trip CSL conversion", () => {
    fc.assert(fc.property(arbValue, (val) => val.equals(Value.fromHex(val.toCSL().to_hex()))));
  });
});
