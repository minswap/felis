import * as fc from "fast-check";
import { describe, expect, it, test } from "vitest";
import { getSlotFromTimeMagic, getTimeFromSlotMagic, NetworkEnvironment } from "../src";

describe("property-based testing", () => {
  test.each([NetworkEnvironment.MAINNET, NetworkEnvironment.TESTNET_PREVIEW, NetworkEnvironment.TESTNET_PREPROD])(
    "test round-trip time-slot conversion for network %s",
    async (networkEnv) => {
      fc.assert(
        fc.property(
          fc.nat(),
          (slot) => getSlotFromTimeMagic(networkEnv, getTimeFromSlotMagic(networkEnv, slot)) === slot,
        ),
      );
    },
  );

  test("getSlotFromTimeMagic should return integer", () =>
    fc.assert(
      fc.property(fc.date(), (date) => Number.isInteger(getSlotFromTimeMagic(NetworkEnvironment.MAINNET, date))),
    ));
});

describe("Check time to slot", () => {
  it("ttl", () => {
    const ttl = 106021908;
    const ttlDate = getTimeFromSlotMagic(NetworkEnvironment.TESTNET_PREVIEW, ttl);
    expect(ttlDate).toEqual(new Date("2026-03-05T02:31:48Z"));
  });
  it("ttl-round-trip", () => {
    const ttl = 106021908;
    const ttlDate = getTimeFromSlotMagic(NetworkEnvironment.TESTNET_PREVIEW, ttl);
    expect(getSlotFromTimeMagic(NetworkEnvironment.TESTNET_PREVIEW, ttlDate)).toEqual(ttl);
  });
});
