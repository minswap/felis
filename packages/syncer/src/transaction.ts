import { Bytes, TxIn, TxOut, type Value } from "@minswap/felis-ledger-core";
import { type ECSLTransaction, RustModule, safeFreeRustObjects } from "@minswap/felis-ledger-utils";
import { ECSLConverter } from "@minswap/felis-tx-builder";
import { PlutusDataHash } from "./types";

export type TransactionBody = {
  inputs: TxIn[];
  outputs: TxOut[];
  referenceInputs: TxIn[];
  mint: Value;
};

export type TransactionWitnessSet = {
  plutusData: Record<PlutusDataHash, Bytes>;
};

export type Transaction = {
  body: TransactionBody;
  witnessSet: TransactionWitnessSet;
};

export namespace Transaction {
  export function fromECSL(tx: ECSLTransaction): Transaction {
    const eBody = tx.body();
    const eWitnessSet = tx.witness_set();

    const plutusData: Record<PlutusDataHash, Bytes> = {};
    const ePlutusDataList = eWitnessSet.plutus_data();
    if (ePlutusDataList) {
      for (let i = 0; i < ePlutusDataList.len(); i++) {
        const ePlutusData = ePlutusDataList.get(i);
        const eDataHash = RustModule.getE.hash_plutus_data(ePlutusData);
        const hash = eDataHash.to_hex();
        plutusData[hash] = Bytes.fromHex(ePlutusData.to_hex());
        safeFreeRustObjects(ePlutusData, eDataHash);
      }
    }

    const transaction: Transaction = {
      body: {
        inputs: ECSLConverter.getInputs(eBody),
        outputs: ECSLConverter.getOutputs(eBody),
        referenceInputs: ECSLConverter.getReferenceInputs(eBody),
        mint: ECSLConverter.getMintValue(eBody),
      },
      witnessSet: {
        plutusData,
      },
    };
    safeFreeRustObjects(eBody, eWitnessSet, ePlutusDataList);
    return transaction;
  }
}
