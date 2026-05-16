import {
  Address,
  Bytes,
  DatumSource,
  type NetworkEnvironment,
  PlutusConstr,
  PlutusData,
  PlutusInt,
  RewardAddress,
  type Utxo,
} from "@minswap/felis-ledger-core";
import invariant from "@minswap/tiny-invariant";

export type USDCXProtocolParams = {
  mintingLogicScriptHash: Bytes;
  feeScriptAddress: Address;
  usdcxPolicyId: Bytes;
  isPaused: boolean;
  minDepositFee: bigint;
  nonceListScriptHash: Bytes;
};

export namespace USDCXProtocolParams {
  export function fromUtxo(utxo: Utxo, networkEnv: NetworkEnvironment): USDCXProtocolParams {
    const datum = DatumSource.getDatumData(utxo.output.datumSource);
    invariant(datum, "Protocol params UTxO must have inline datum");

    const plutusData = PlutusData.fromDataHex(datum.hex);
    const { fields } = PlutusConstr.unwrap(plutusData, { [0]: 11 });

    invariant(fields.length >= 11, "Protocol params datum must have at least 11 fields");

    // Field 0: ScriptHash — bare 28-byte bytes (NOT wrapped in Credential constr)
    const field0 = fields[0];
    invariant(field0, "Field 0 (minting logic) is missing");
    const mintingLogicScriptHash = Bytes.fromHex((field0 as { bytes: string }).bytes);

    // Field 1: Address
    const field1 = fields[1];
    invariant(field1, "Field 1 (fee script address) is missing");
    const feeScriptAddress = Address.fromPlutusJson(field1, networkEnv);

    // Field 2: CurrencySymbol — bare bytes (Plutus CurrencySymbol is a newtype over BuiltinByteString)
    const field2 = fields[2];
    invariant(field2, "Field 2 (usdcx policy) is missing");
    const usdcxPolicyId = Bytes.fromHex((field2 as { bytes: string }).bytes);

    // Field 8: Bool (isPaused) — Plutus encodes Bool as Constr 0 (False) / Constr 1 (True)
    const field8 = fields[8];
    invariant(field8, "Field 8 (isPaused) is missing");
    const isPausedData = field8 as { int: string } | { constructor: number };
    const isPaused = "int" in isPausedData ? isPausedData.int !== "0" : isPausedData.constructor !== 0;

    // Field 9: ScriptHash (nonceListScript) — bare 28-byte bytes
    const field9 = fields[9];
    invariant(field9, "Field 9 (nonce list script) is missing");
    const nonceListScriptHash = Bytes.fromHex((field9 as { bytes: string }).bytes);

    // Field 10: Integer (minDepositFee)
    const field10 = fields[10];
    invariant(field10, "Field 10 (minDepositFee) is missing");
    const minDepositFee = PlutusInt.unwrapToBigInt(field10);

    return {
      mintingLogicScriptHash,
      feeScriptAddress,
      usdcxPolicyId,
      isPaused,
      minDepositFee,
      nonceListScriptHash,
    };
  }

  export function getMintingLogicStakeAddress(
    params: USDCXProtocolParams,
    networkEnv: NetworkEnvironment,
  ): RewardAddress {
    return RewardAddress.fromScriptHash(networkEnv, params.mintingLogicScriptHash);
  }
}
