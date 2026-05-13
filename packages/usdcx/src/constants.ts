import { Asset, NetworkEnvironment } from "@minswap/felis-ledger-core";
import invariant from "@minswap/tiny-invariant";

export namespace USDCx {
  export type NetworkConfig = {
    usdcxAsset: Asset;
    sdkApiUrl: string;
    xReserveApiUrl: string;
  };

  let _configMainnet: NetworkConfig | null = null;
  let _configPreprod: NetworkConfig | null = null;

  export function getConfig(networkEnv: NetworkEnvironment): NetworkConfig {
    switch (networkEnv) {
      case NetworkEnvironment.MAINNET: {
        if (!_configMainnet) {
          _configMainnet = {
            usdcxAsset: Asset.fromString("1f3aec8bfe7ea4fe14c5f121e2a92e301afe414147860d557cac7e34.5553444378"),
            sdkApiUrl: "https://sdk.usdcx.aws.iohkdev.io",
            xReserveApiUrl: "https://xreserve-api.circle.com",
          };
        }
        return _configMainnet;
      }
      case NetworkEnvironment.TESTNET_PREPROD: {
        if (!_configPreprod) {
          _configPreprod = {
            usdcxAsset: Asset.fromString("31dde3db98ad05feb688d4dbb146b3b6054e1246cbcef98c79b0bf66.5553444378"),
            sdkApiUrl: "https://a2-docker.preprod.usdcx.aws.iohkdev.io",
            xReserveApiUrl: "https://xreserve-api-testnet.circle.com",
          };
        }
        return _configPreprod;
      }
      default:
        invariant(false, `USDCx config not defined for networkEnv=${networkEnv}`);
    }
  }
}
