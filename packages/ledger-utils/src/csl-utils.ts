import { blake2b256, type ECSLTransaction, RustModule, safeFreeRustObjects } from ".";

export namespace CSLUtils {
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
}
