import { NetworkEnvironment } from "@minswap/felis-ledger-core";
import { describe, expect, it } from "vitest";
import { USDCx } from "../src/constants.js";

describe("USDCx constants", () => {
  it("returns mainnet config", () => {
    const config = USDCx.getConfig(NetworkEnvironment.MAINNET);
    expect(config.usdcxAsset.currencySymbol.hex).toBe("1f3aec8bfe7ea4fe14c5f121e2a92e301afe414147860d557cac7e34");
    expect(config.sdkApiUrl).toBe("https://sdk.usdcx.aws.iohkdev.io");
    expect(config.xReserveApiUrl).toBe("https://xreserve-api.circle.com");
  });

  it("returns preprod config", () => {
    const config = USDCx.getConfig(NetworkEnvironment.TESTNET_PREPROD);
    expect(config.usdcxAsset.currencySymbol.hex).toBe("31dde3db98ad05feb688d4dbb146b3b6054e1246cbcef98c79b0bf66");
    expect(config.sdkApiUrl).toBe("https://a2-docker.preprod.usdcx.aws.iohkdev.io");
    expect(config.xReserveApiUrl).toBe("https://xreserve-api-testnet.circle.com");
  });

  it("caches config", () => {
    const config1 = USDCx.getConfig(NetworkEnvironment.MAINNET);
    const config2 = USDCx.getConfig(NetworkEnvironment.MAINNET);
    expect(config1).toBe(config2); // same object
  });
});
