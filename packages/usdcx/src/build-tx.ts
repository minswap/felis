import {
  type Address,
  Bytes,
  type NetworkEnvironment,
  PlutusBytes,
  PlutusData,
  type Utxo,
  Value,
} from "@minswap/felis-ledger-core";
import type { TxBuilder } from "@minswap/felis-tx-builder";
import invariant from "@minswap/tiny-invariant";
import { USDCx } from "./constants.js";
import { USDCXProtocolParams } from "./protocol-params.js";

export namespace USDCxBurnTx {
  export type Options = {
    txb: TxBuilder;
    networkEnv: NetworkEnvironment;
    senderAddress: Address;
    walletUtxos: Utxo[];
    usdcxUtxos: Utxo[];
    protocolParamsUtxo: Utxo;
    burnIntentHex: string;
    burnAmount: bigint;
  };

  function buildBurnRedeemer(burnIntentHex: string): PlutusData {
    return {
      constructor: 1,
      fields: [PlutusBytes.wrap(Bytes.fromHex(burnIntentHex))],
    };
  }

  export function build(options: Options): TxBuilder {
    const { txb, networkEnv, senderAddress, walletUtxos, usdcxUtxos, protocolParamsUtxo, burnIntentHex, burnAmount } =
      options;

    const protocolParams = USDCXProtocolParams.fromUtxo(protocolParamsUtxo, networkEnv);
    invariant(!protocolParams.isPaused, "USDCx protocol is paused");

    const mintingLogicStakeAddress = USDCXProtocolParams.getMintingLogicStakeAddress(protocolParams, networkEnv);
    const config = USDCx.getConfig(networkEnv);

    const burnRedeemer = buildBurnRedeemer(burnIntentHex);
    const mintValue = new Value().add(config.usdcxAsset, -burnAmount);

    return txb
      .readFrom(protocolParamsUtxo)
      .collectFromPubKey(...usdcxUtxos)
      .collectFromPubKey(...walletUtxos)
      .mintAssets(mintValue, PlutusData.fromDataHex("d87980"))
      .withdraw(mintingLogicStakeAddress, 0n, burnRedeemer)
      .addSigner(senderAddress);
  }
}
