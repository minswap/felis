import { Asset, Bytes, NetworkEnvironment, type TxIn } from "@minswap/felis-ledger-core";
import invariant from "@minswap/tiny-invariant";

// hex("USDCXProtocolParameters")
const PROTOCOL_PARAMS_TOKEN_NAME_HEX = "555344435850726f746f636f6c506172616d6574657273";

function txIn(s: `${string}#${number}`): TxIn {
  const [hash, idx] = s.split("#");
  return { txId: Bytes.fromHex(hash), index: Number(idx) };
}

export namespace USDCx {
  export type NetworkConfig = {
    usdcxAsset: Asset;
    protocolParamsAsset: Asset;
    /** UTxO holding the USDCx minting policy reference script (for mint/burn). */
    mintingRefScriptTxIn: TxIn;
    /** UTxO holding the minting-logic withdraw reference script (executed during burn via withdraw-0). */
    mintingLogicRefScriptTxIn: TxIn;
    sdkApiUrl: string;
    xReserveApiUrl: string;
  };

  let _configMainnet: NetworkConfig | null = null;
  let _configPreprod: NetworkConfig | null = null;

  export function getConfig(networkEnv: NetworkEnvironment): NetworkConfig {
    switch (networkEnv) {
      case NetworkEnvironment.MAINNET: {
        if (!_configMainnet) {
          const usdcxPolicy = "1f3aec8bfe7ea4fe14c5f121e2a92e301afe414147860d557cac7e34";
          // TODO(mainnet): confirm the UpgradableParams minter policy hash that holds the
          // `USDCXProtocolParameters` NFT — it is NOT the USDCx minting policy.
          const upgradableParamsPolicy = usdcxPolicy;
          _configMainnet = {
            usdcxAsset: Asset.fromString(`${usdcxPolicy}.5553444378`),
            protocolParamsAsset: Asset.fromString(`${upgradableParamsPolicy}.${PROTOCOL_PARAMS_TOKEN_NAME_HEX}`),
            mintingRefScriptTxIn: txIn("86c9f9a54f11627a3b4c0b9577d0a5074eb366b08555192c1d6213239e2854e1#0"),
            // TODO(mainnet): confirm which of 86c9f9a5…#1 (script hash 55b72d99…) or #2 (a3d50528…)
            // is the minting-logic withdraw script by decoding the on-chain protocol-params datum.
            mintingLogicRefScriptTxIn: txIn("86c9f9a54f11627a3b4c0b9577d0a5074eb366b08555192c1d6213239e2854e1#1"),
            sdkApiUrl: "https://sdk.usdcx.aws.iohkdev.io",
            xReserveApiUrl: "https://xreserve-api.circle.com",
          };
        }
        return _configMainnet;
      }
      case NetworkEnvironment.TESTNET_PREPROD: {
        if (!_configPreprod) {
          const usdcxPolicy = "31dde3db98ad05feb688d4dbb146b3b6054e1246cbcef98c79b0bf66";
          // UpgradableParams minter — separate policy that holds the USDCXProtocolParameters NFT.
          const upgradableParamsPolicy = "99335d3e4748ce15502bc4ef8d091028133f643b23ee579ffc206d44";
          _configPreprod = {
            usdcxAsset: Asset.fromString(`${usdcxPolicy}.5553444378`),
            protocolParamsAsset: Asset.fromString(`${upgradableParamsPolicy}.${PROTOCOL_PARAMS_TOKEN_NAME_HEX}`),
            mintingRefScriptTxIn: txIn("52248549703460f1c2538d1ecdb9dbba0749f98983576bcc956f348c246ac4f0#0"),
            mintingLogicRefScriptTxIn: txIn("ca50ae63a4e887487d73955b785a031838b5920282a0011993df5bc31d489a00#0"),
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
