import { Asset, Bytes, Value } from "@repo/ledger-core";
import {
  blake2b256,
  type ECSLTransaction,
  type ECSLTransactionBody,
  Maybe,
  RustModule,
  safeFreeRustObjects,
  unwrapRustVec,
} from "@repo/ledger-utils";

export namespace ECSLConverter {
  export function getTransactionFromHex(data: string): ECSLTransaction {
    const ECSL = RustModule.getE;
    const transaction = ECSL.Transaction.from_hex(data);
    return transaction;
  }

  /**
   * Formula: txHash = hash(TransactionBody)
   * From Conway Era, Transaction Body has some new fields: voting_procedures, voting_proposals, donation, current_treasury_value.
   * Therefore, CSL11 is not compatible.
   * Solution: Using ECSL to adapt those changes.
   */
  export function getTxHash(transaction: ECSLTransaction): string {
    const transactionBody = transaction.body();
    const txHash = blake2b256(Buffer.from(transactionBody.to_bytes()));

    safeFreeRustObjects(transactionBody);

    return txHash;
  }

  export function getMintValue(transactionBody: ECSLTransactionBody): Value {
    const mintValue: Value = new Value();

    const mint = transactionBody.mint();
    if (Maybe.isNothing(mint)) {
      return mintValue;
    }

    const mintKeys = mint.keys(); // ScriptHashes
    for (const mintKey of unwrapRustVec(mintKeys)) {
      const mintsAssets = mint.get(mintKey);
      if (Maybe.isNothing(mintsAssets)) {
        continue;
      }

      for (const mintAssets of unwrapRustVec(mintsAssets)) {
        if (Maybe.isNothing(mintAssets)) {
          continue;
        }

        const assetNames = mintAssets.keys();
        for (const assetName of unwrapRustVec(assetNames)) {
          const amount = mintAssets.get(assetName);
          if (Maybe.isNothing(amount)) {
            continue;
          }
          const asset = new Asset(Bytes.fromHex(mintKey.to_hex()), new Bytes(assetName.name()));
          mintValue.add(asset, BigInt(amount.to_str()));
          safeFreeRustObjects(amount);
        }
        safeFreeRustObjects(mintAssets, assetNames);
      }
      safeFreeRustObjects(mintsAssets);
    }
    safeFreeRustObjects(mint, mintKeys);

    return mintValue.trim();
  }
}
