import {
  Address,
  Asset,
  Bytes,
  type DatumSource,
  DatumSourceType,
  PlutusVersion,
  type ScriptReference,
  type TxIn,
  TxOut,
  Value,
} from "@repo/ledger-core";
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

  export function getOutputs(transactionBody: ECSLTransactionBody): TxOut[] {
    const cOutputs = transactionBody.outputs();
    const outputs: TxOut[] = [];
    for (let i = 0; i < cOutputs.len(); i++) {
      const cOutput = cOutputs.get(i);
      const cAddress = cOutput.address();
      const cValue = cOutput.amount();
      const cDatumHash = cOutput.data_hash();
      const cPlutusData = cOutput.plutus_data();
      const cScriptRef = cOutput.script_ref();
      const cPlutusScript = cScriptRef?.plutus_script();
      const cLanguageVersion = cPlutusScript?.language_version();

      const datumSource: DatumSource | undefined = cPlutusData
        ? { type: DatumSourceType.INLINE_DATUM, data: new Bytes(cPlutusData.to_bytes()) }
        : cDatumHash
          ? { type: DatumSourceType.DATUM_HASH, hash: new Bytes(cDatumHash.to_bytes()) }
          : undefined;

      const scriptRef: Maybe<ScriptReference> =
        cPlutusScript && cLanguageVersion
          ? { plutusVersion: PlutusVersion.fromECSL(cLanguageVersion), script: new Bytes(cPlutusScript.to_bytes()) }
          : null;

      const txOut = new TxOut(
        Address.fromBech32(cAddress.to_bech32()),
        Value.fromHex(cValue.to_hex()),
        datumSource,
        scriptRef,
      );
      outputs.push(txOut);
      safeFreeRustObjects(
        cOutput,
        cAddress,
        cValue,
        cDatumHash,
        cPlutusData,
        cScriptRef,
        cPlutusScript,
        cLanguageVersion,
      );
    }
    safeFreeRustObjects(cOutputs);
    return outputs;
  }

  export function getInputs(transactionBody: ECSLTransactionBody): TxIn[] {
    const cInputs = transactionBody.inputs();
    const inputs: TxIn[] = [];
    for (let i = 0; i < cInputs.len(); i++) {
      const cInput = cInputs.get(i);
      const txId = cInput.transaction_id();
      inputs.push({
        txId: new Bytes(txId.to_bytes()),
        index: cInput.index(),
      });
      safeFreeRustObjects(cInput, txId);
    }
    safeFreeRustObjects(cInputs);
    return inputs;
  }

  export function getReferenceInputs(transactionBody: ECSLTransactionBody): TxIn[] {
    const cReferenceInputs = transactionBody.reference_inputs();
    if (Maybe.isNothing(cReferenceInputs)) {
      return [];
    }
    const referenceInputs: TxIn[] = [];
    for (let i = 0; i < cReferenceInputs.len(); i++) {
      const cInput = cReferenceInputs.get(i);
      const txId = cInput.transaction_id();
      referenceInputs.push({
        txId: new Bytes(txId.to_bytes()),
        index: cInput.index(),
      });
      safeFreeRustObjects(cInput, txId);
    }
    safeFreeRustObjects(cReferenceInputs);
    return referenceInputs;
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
