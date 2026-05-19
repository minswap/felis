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
   *   5f <chunk>* ff
   * Each <chunk> is a definite-length bytestring of ≤64 bytes.
   *
   * The on-chain MintingLogic deserialises this redeemer field via `UnBData`, so it
   * must be a single Plutus Bytes — never a List of Bytes — but the CBOR encoding
   * must be chunked into ≤64-byte segments to satisfy Plutus's bytestring-literal limit.
   */
  export function encodeIndefiniteBytesHex(hex: string): string {
    const bytes = hex.length / 2;
    const CHUNK = 64;
    let out = "5f";
    for (let off = 0; off < bytes; off += CHUNK) {
      const chunkBytes = Math.min(CHUNK, bytes - off);
      out += cborBytestringHeader(chunkBytes) + hex.slice(off * 2, (off + chunkBytes) * 2);
    }
    out += "ff";
    return out;
  }

  /**
   * Encode CBOR definite-length bytestring header (major type 2) for `n` bytes.
   * Per RFC 8949 §3.1 (https://www.rfc-editor.org/rfc/rfc8949#section-3.1):
   *   n < 24        -> 1 byte:  0x40 | n
   *   n < 2^8       -> 2 bytes: 0x58 <n>
   *   n < 2^16      -> 3 bytes: 0x59 <n:u16 BE>
   *   n < 2^32      -> 5 bytes: 0x5a <n:u32 BE>
   *   n < 2^64      -> 9 bytes: 0x5b <n:u64 BE>
   *
   * The earlier `\`4${n.toString(16)}\`` shortcut emits invalid CBOR for n in [16,23]
   * because `n.toString(16)` is then two hex chars ("10".."17") — the major-type
   * nibble swallows the high length nibble and the result decodes off-by-one.
   */
  export function cborBytestringHeader(n: number): string {
    if (n < 24) return (0x40 | n).toString(16).padStart(2, "0");
    if (n < 0x100) return `58${n.toString(16).padStart(2, "0")}`;
    if (n < 0x10000) return `59${n.toString(16).padStart(4, "0")}`;
    if (n < 0x100000000) return `5a${n.toString(16).padStart(8, "0")}`;
    return `5b${n.toString(16).padStart(16, "0")}`;
  }

  export function buildBurnRedeemer(burnIntentHex: string): PlutusData {
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
