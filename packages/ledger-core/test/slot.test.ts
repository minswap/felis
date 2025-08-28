import * as fc from "fast-check";
import { describe, test } from "vitest";
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
