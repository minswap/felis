import { type Address, type NetworkEnvironment, PlutusData, type Utxo, Value } from "@minswap/felis-ledger-core";
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
    /** UTxO carrying the USDCx minting policy reference script. See USDCx.NetworkConfig.mintingRefScriptTxIn. */
    mintingRefScriptUtxo: Utxo;
    /** UTxO carrying the minting-logic withdraw script (executed via withdraw-0). See USDCx.NetworkConfig.mintingLogicRefScriptTxIn. */
    mintingLogicRefScriptUtxo: Utxo;
    burnIntentHex: string;
    burnAmount: bigint;
  };

  /**
   * Encode a hex-bytes payload as CBOR indefinite-length bytes:
   *   5f (58 40 <64 bytes>)* (58 <n> <remainder>) ff
   * The on-chain MintingLogic deserialises this redeemer field via `UnBData`, so it
   * must be a single Plutus Bytes — never a List of Bytes — but the CBOR encoding
   * must be chunked into ≤64-byte segments to satisfy Plutus's bytestring-literal limit.
   */
  function encodeIndefiniteBytesHex(hex: string): string {
    const bytes = hex.length / 2;
    const CHUNK = 64;
    let out = "5f";
    for (let off = 0; off < bytes; off += CHUNK) {
      const chunkBytes = Math.min(CHUNK, bytes - off);
      const header = chunkBytes < 24 ? `4${chunkBytes.toString(16)}` : `58${chunkBytes.toString(16).padStart(2, "0")}`;
      out += header + hex.slice(off * 2, (off + chunkBytes) * 2);
    }
    out += "ff";
    return out;
  }

  function buildBurnRedeemer(burnIntentHex: string): PlutusData {
    const hex = burnIntentHex.startsWith("0x") ? burnIntentHex.slice(2) : burnIntentHex;
    // Constr 1 with one field; CBOR tag for Constr 1 = d87a, indefinite-length = 9f…ff.
    // Field is a single Plutus Bytes, encoded as CBOR indefinite-length bytestring (5f…ff)
    // chunked into ≤64-byte segments per Plutus's bytestring-literal limit.
    const bytesCbor = encodeIndefiniteBytesHex(hex);
    const redeemerCborHex = `d87a9f${bytesCbor}ff`;
    return PlutusData.fromDataHex(redeemerCborHex);
  }

  export function build(options: Options): TxBuilder {
    const {
      txb,
      networkEnv,
      senderAddress,
      walletUtxos,
      usdcxUtxos,
      protocolParamsUtxo,
      mintingRefScriptUtxo,
      mintingLogicRefScriptUtxo,
      burnIntentHex,
      burnAmount,
    } = options;

    const protocolParams = USDCXProtocolParams.fromUtxo(protocolParamsUtxo, networkEnv);
    invariant(!protocolParams.isPaused, "USDCx protocol is paused");

    const mintingLogicStakeAddress = USDCXProtocolParams.getMintingLogicStakeAddress(protocolParams, networkEnv);
    const config = USDCx.getConfig(networkEnv);

    const burnRedeemer = buildBurnRedeemer(burnIntentHex);
    const mintValue = new Value().add(config.usdcxAsset, -burnAmount);

    // Force the USDCx-bearing UTxOs into the body (they hold the tokens we burn).
    // Pure-ADA UTxOs are passed to `complete({ walletUtxos })` so coin selection picks
    // just enough for fees and change — otherwise large wallets blow the 16KB tx limit.
    void walletUtxos;

    return txb
      .readFrom(protocolParamsUtxo, mintingRefScriptUtxo, mintingLogicRefScriptUtxo)
      .collectFromPubKey(...usdcxUtxos)
      .mintAssets(mintValue, PlutusData.fromDataHex("d87980"))
      .withdraw(mintingLogicStakeAddress, 0n, burnRedeemer)
      .addSigner(senderAddress);
  }
}
