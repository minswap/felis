import type * as Ogmios from "@cardano-ogmios/schema";
import invariant from "@minswap/tiny-invariant";
import * as cbor from "cbor";

import {
  CborHex,
  type CSLPlutusData,
  type CSLTransaction,
  type CSLTransactionInput,
  type CSLTransactionOutput,
  type CSLTransactionUnspentOutput,
  type CSLTransactionUnspentOutputs,
  CSLUtils,
  type ECSLTransaction,
  Maybe,
  parseIntSafe,
  Result,
  RustModule,
  safeFreeRustObjects,
  unwrapRustVec,
} from "@repo/ledger-utils";

import {
  ADA,
  Address,
  Asset,
  Bytes,
  DEFAULT_STABLE_PROTOCOL_PARAMS,
  KupoValue,
  type NetworkEnvironment,
  PlutusBytes,
  PlutusConstr,
  PlutusData,
  PlutusInt,
  Value,
  XJSON,
} from ".";
import { PlutusVersion, ScriptReference } from "./plutus";

export type TxIn = {
  txId: Bytes;
  index: number;
};

export namespace TxId {
  export function isValidTxId(s: string): boolean {
    // biome-ignore lint/performance/useTopLevelRegex: <explanation>
    return /^[a-f0-9]{64}$/i.test(s);
  }

  export function fromPlutusJson(data: PlutusData): Bytes {
    const { fields } = PlutusConstr.unwrap(data, { [0]: 1 });
    return PlutusBytes.unwrap(fields[0]);
  }

  export function toPlutusJson(data: Bytes): PlutusData {
    return {
      constructor: 0,
      fields: [data.toPlutusJson()],
    };
  }
}

export namespace TxIn {
  export function fromHex(input: CborHex<CSLTransactionInput>): TxIn {
    const CSL = RustModule.get;
    const transactionInput = CSL.TransactionInput.from_hex(input);
    const transactionHash = transactionInput.transaction_id();
    const txIn = {
      txId: new Bytes(transactionHash.to_bytes()),
      index: transactionInput.index(),
    };
    safeFreeRustObjects(transactionInput, transactionHash);
    return txIn;
  }

  export function fromPlutusJson(data: PlutusData): TxIn {
    const { fields } = PlutusConstr.unwrap(data, { [0]: 2 });
    return {
      txId: TxId.fromPlutusJson(fields[0]),
      index: PlutusInt.unwrapToNumber(fields[1]),
    };
  }

  export function toPlutusJson(data: TxIn, plutusVersion?: PlutusVersion): PlutusData {
    if (plutusVersion === PlutusVersion.V3) {
      return {
        constructor: 0,
        fields: [data.txId.toPlutusJson(), PlutusInt.wrap(data.index)],
      };
    }
    return {
      constructor: 0,
      fields: [TxId.toPlutusJson(data.txId), PlutusInt.wrap(data.index)],
    };
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>): TxIn {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData);
  }

  export function toDataHex(data: TxIn): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }

  export function toCSL(input: TxIn): CSLTransactionInput {
    const CSL = RustModule.get;
    return CSL.TransactionInput.new(CSL.TransactionHash.from_bytes(input.txId.bytes), input.index);
  }

  export function fromOgmios(i: Ogmios.TransactionOutputReference): TxIn {
    return {
      txId: Bytes.fromHex(i.transaction.id),
      index: i.index,
    };
  }

  export function toOgmios(i: TxIn): Ogmios.TransactionOutputReference {
    return {
      transaction: {
        id: i.txId.hex,
      },
      index: i.index,
    };
  }

  export function compare(a: TxIn, b: TxIn): number {
    if (a.txId.equals(b.txId)) {
      return a.index - b.index;
    }
    return a.txId.compare(b.txId);
  }

  export function equals(a: TxIn, b: TxIn): boolean {
    return a.txId.equals(b.txId) && a.index === b.index;
  }

  // biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
  export function toString(txIn: TxIn): string {
    return `${txIn.txId.hex}#${txIn.index}`;
  }

  export function fromString(s: string): TxIn {
    const parts = s.split("#");
    const txId = Bytes.fromHex(parts[0]);
    invariant(txId.length === 32, `txID must be in 32 bytes or 64 hex character`);
    return {
      txId: txId,
      index: parseIntSafe(parts[1]),
    };
  }

  export function getString(txId: string, index: number): string {
    return TxIn.toString(TxIn.fromString(`${txId}#${index}`));
  }

  export function clone(txIn: TxIn): TxIn {
    return {
      txId: Bytes.fromHex(txIn.txId.hex),
      index: txIn.index,
    };
  }

  export function getInputsFromTxRaw(txRaw: CborHex<ECSLTransaction>): TxIn[] {
    const ECSL = RustModule.getE;
    const tx = ECSL.Transaction.from_bytes(Bytes.fromHex(txRaw).bytes);
    const cslTxBody = tx.body();
    const cslInputs = cslTxBody.inputs();
    const inputsHex = unwrapRustVec(cslInputs).map((input) => input.to_hex());
    const txIns = inputsHex.map(TxIn.fromHex);

    safeFreeRustObjects(tx, cslTxBody, cslInputs);
    return txIns;
  }

  export function getCollateralsFromTxRaw(txRaw: CborHex<CSLTransaction>): TxIn[] | undefined {
    const ECSL = RustModule.getE;
    const tx = ECSL.Transaction.from_bytes(Bytes.fromHex(txRaw).bytes);
    const cslTxBody = tx.body();
    const cslCollaterals = cslTxBody.collateral();
    if (!cslCollaterals) {
      return undefined;
    }
    const inputsHex = unwrapRustVec(cslCollaterals).map((input) => input.to_hex());
    const txIns = inputsHex.map(TxIn.fromHex);

    safeFreeRustObjects(tx, cslTxBody, cslCollaterals);
    return txIns;
  }

  /**
   * Calculates the sorted indexes of transaction inputs (`TxIn[]`) based on their order
   * after sorting by TxID and TxIndex. This function determines the mapping of the original
   * input order to the sorted order.
   *
   * @param txIns - An array of transaction inputs (`TxIn[]`) to be sorted and indexed.
   * @returns An array of numbers representing the indexes of the original transaction inputs
   *          in the sorted order.
   *
   * @remarks
   * - The function first creates a sorted copy of the input array using the `TxIn.compare` method.
   * - It then iterates through the original array in reverse order and determines the position
   *   of each element in the sorted array.
   * - The resulting array is reversed before being returned to maintain the correct order.
   *
   * @example
   * ```typescript
   * const txIns = [
   *   { txId: 'abc', index: 1 },
   *   { txId: 'xyz', index: 0 },
   *   { txId: 'abc', index: 0 }
   * ];
   * const sortedIndexes = calculateSortedIndexes(txIns);
   * console.log(sortedIndexes); // Output: [2, 0, 1]
   * ```
   */
  export function calculateSortedIndexes(txIns: TxIn[]): number[] {
    // first, we need to sort order by TxID and TxIndex
    const tempTxIns = [...txIns];
    tempTxIns.sort((a, b) => TxIn.compare(a, b));
    // then, we loop the original orders backwards and add the indexes to resulting array
    const ret: number[] = [];
    for (let i = txIns.length - 1; i >= 0; i--) {
      for (let j = 0; j < tempTxIns.length; j++) {
        if (TxIn.compare(txIns[i], tempTxIns[j]) === 0) {
          ret.push(j);
          break;
        }
      }
    }
    return ret.reverse();
  }
}

/**
 * Datum Source has 3 types
 * - DATUM_HASH: It is the most common usage on Plutus V1 Script, it can be queried by Cardano Node
 * - OUTLINE_DATUM: It is extended DATUM_DASH, includes both Datum and its hash.
 *      It's necessary data to unlock a script and can only be found on transaction witnesss
 * - INLINE_DATUM: It is the most common usage on Plutus V2 Script.
 *      It is included directly on the Transaction Output and can be queried by Cardano Node
 */
export enum DatumSourceType {
  DATUM_HASH = "DatumHash",
  OUTLINE_DATUM = "OutlineDatum",
  INLINE_DATUM = "InlineDatum",
}
export type DatumHash = {
  type: DatumSourceType.DATUM_HASH;
  hash: Bytes;
};
export type OutlineDatum = {
  type: DatumSourceType.OUTLINE_DATUM;
  hash: Bytes;
  data: Bytes;
};
export type InlineDatum = {
  type: DatumSourceType.INLINE_DATUM;
  data: Bytes;
};
export type DatumSource = DatumHash | OutlineDatum | InlineDatum;

export namespace DatumSource {
  export function clone(ds: DatumSource): DatumSource {
    switch (ds.type) {
      case DatumSourceType.DATUM_HASH: {
        return {
          type: ds.type,
          hash: ds.hash.clone(),
        };
      }
      case DatumSourceType.OUTLINE_DATUM: {
        return {
          type: ds.type,
          hash: ds.hash.clone(),
          data: ds.data.clone(),
        };
      }
      case DatumSourceType.INLINE_DATUM: {
        return {
          type: ds.type,
          data: ds.data.clone(),
        };
      }
    }
  }

  export function newDatumHash(hash: Bytes): DatumSource {
    return {
      type: DatumSourceType.DATUM_HASH,
      hash: hash,
    };
  }

  export function newOutlineDatum(data: Bytes): DatumSource {
    const datumHash = PlutusData.hashPlutusData(PlutusData.fromDataHex(data.hex));
    return {
      type: DatumSourceType.OUTLINE_DATUM,
      hash: datumHash,
      data: data,
    };
  }

  export function newInlineDatum(data: Bytes): DatumSource {
    return {
      type: DatumSourceType.INLINE_DATUM,
      data: data,
    };
  }

  export function fromMaybeDatumHash(mdh: Maybe<Bytes>): Maybe<DatumSource> {
    return Maybe.map(mdh, newDatumHash);
  }
}

export class TxOut {
  readonly address: Address;
  readonly value: Value;
  readonly datumSource: Maybe<DatumSource>;

  readonly scriptRef: Maybe<ScriptReference>;

  constructor(address: Address, value: Value, datumSource?: Maybe<DatumSource>, scriptRef?: Maybe<ScriptReference>) {
    this.address = address;
    this.value = value;
    this.datumSource = datumSource;
    this.scriptRef = scriptRef;
    if (this.value.isNonNegative()) {
      // ❤️ all good
    } else {
      throw new Error(`TxOut value must be non-negative, got ${XJSON.stringify(this.value, 2)}`);
    }
  }

  static newPubKeyOut({ address, value }: { address: Address; value: Value }): TxOut {
    return new TxOut(address, value);
  }

  static newScriptOut({
    address,
    value,
    datumSource,
  }: {
    address: Address;
    value: Value;
    datumSource: DatumSource;
  }): TxOut {
    return new TxOut(address, value, datumSource);
  }

  static newReferencesScriptOut({
    address,
    value,
    datumSource,
    scriptRef,
  }: {
    address: Address;
    value: Value;
    datumSource?: DatumSource;
    scriptRef: ScriptReference;
  }): TxOut {
    return new TxOut(address, value, datumSource, scriptRef);
  }

  static fromHex(out: CborHex<CSLTransactionOutput>): TxOut {
    const ECSL = RustModule.getE;
    const transactionOutput = ECSL.TransactionOutput.from_hex(out);

    const address = transactionOutput.address();
    const value = transactionOutput.amount();
    const datumHash = transactionOutput.data_hash();
    const plutusData = transactionOutput.plutus_data();

    let datumSource: DatumSource | undefined = undefined;
    if (plutusData) {
      datumSource = {
        type: DatumSourceType.INLINE_DATUM,
        data: new Bytes(plutusData.to_bytes()),
      };
    } else if (datumHash) {
      datumSource = {
        type: DatumSourceType.DATUM_HASH,
        hash: new Bytes(datumHash.to_bytes()),
      };
    }
    const scriptRef = transactionOutput.script_ref();
    const plutusScript = scriptRef?.plutus_script();
    const languageVersion = plutusScript?.language_version();
    const txOut = new TxOut(
      Address.fromCSL(address),
      Value.fromHex(value.to_hex()),
      datumSource,
      plutusScript && languageVersion
        ? { plutusVersion: PlutusVersion.fromCSL(languageVersion), script: new Bytes(plutusScript.to_bytes()) }
        : undefined,
    );

    safeFreeRustObjects(transactionOutput, address, value, datumHash, plutusData, plutusScript, scriptRef);

    return txOut;
  }

  toOgmios(): Ogmios.TransactionOutput {
    const output: Ogmios.TransactionOutput = {
      address: this.address.bech32,
      value: this.value.toOgmios(),
      datum: undefined,
      datumHash: undefined,
      script: undefined,
    };
    const datumSource = this.datumSource;
    if (datumSource) {
      switch (datumSource.type) {
        case DatumSourceType.INLINE_DATUM: {
          output.datum = datumSource.data.hex;
          break;
        }
        case DatumSourceType.OUTLINE_DATUM:
        case DatumSourceType.DATUM_HASH: {
          output.datumHash = datumSource.hash.hex;
          break;
        }
      }
    }
    if (Maybe.isJust(this.scriptRef)) {
      // Ogmios Script is complied script, so it doesn't include CBOR encoding
      // We need to remove the encoding inside the @scriptRef
      const ogmiosScriptByte = cbor.decode(this.scriptRef.script.hex);
      const ogmiosScript = new Bytes(ogmiosScriptByte).hex;
      output.script = {
        language: PlutusVersion.toOgmios(this.scriptRef.plutusVersion),
        cbor: ogmiosScript,
      };
    } else {
      output.script = undefined;
    }
    return output;
  }

  static fromOgmios(o: Ogmios.TransactionOutput): TxOut {
    const CSL = RustModule.get;
    let datumSource: DatumSource | undefined = undefined;
    const datum = o.datum;
    const datumHash = o.datumHash;

    if (datum && datumHash) {
      // for whatever reason, when a output has datum hash, Ogmios returns both `datum` and `datumHash` field to be the same datum hash
      if (datum !== datumHash) {
        datumSource = {
          type: DatumSourceType.INLINE_DATUM,
          data: Bytes.fromHex(datum),
        };
      } else {
        datumSource = {
          type: DatumSourceType.DATUM_HASH,
          hash: Bytes.fromHex(datumHash),
        };
      }
    } else if (datum) {
      datumSource = {
        type: DatumSourceType.INLINE_DATUM,
        data: Bytes.fromHex(datum),
      };
    } else if (datumHash) {
      datumSource = {
        type: DatumSourceType.DATUM_HASH,
        hash: Bytes.fromHex(datumHash),
      };
    }

    let scriptRef: ScriptReference | undefined = undefined;
    if (o.script) {
      switch (o.script.language) {
        case "native":
        case "plutus:v1": {
          break;
        }
        case "plutus:v2": {
          const bytes_v2 = Bytes.fromHex(o.script.cbor);
          const plutusScript = CSL.PlutusScript.new_v2(bytes_v2.bytes);
          scriptRef = {
            plutusVersion: PlutusVersion.V2,
            script: Bytes.fromHex(plutusScript.to_hex()),
          };
          safeFreeRustObjects(plutusScript);
          break;
        }
        case "plutus:v3": {
          const bytes_v3 = Bytes.fromHex(o.script.cbor);
          const plutusScript = CSL.PlutusScript.new_v3(bytes_v3.bytes);
          scriptRef = {
            plutusVersion: PlutusVersion.V3,
            script: Bytes.fromHex(plutusScript.to_hex()),
          };
          safeFreeRustObjects(plutusScript);
          break;
        }
      }
    }

    return new TxOut(Address.fromOgmios(o.address), Value.fromOgmios(o.value), datumSource, scriptRef);
  }

  static sumValue(txOuts: TxOut[]): Value {
    return txOuts.reduce((pre, o) => pre.addAll(o.value), new Value());
  }

  static contains(outs: TxOut[], search: TxOut): boolean {
    return outs.some((out) => out.toHex() === search.toHex());
  }

  toCSL(): CSLTransactionOutput {
    const CSL = RustModule.get;
    const address = this.address.toCSL();
    const value = this.value.toCSL();
    const ret = CSL.TransactionOutput.new(address, value);
    if (Maybe.isJust(this.datumSource)) {
      switch (this.datumSource.type) {
        case DatumSourceType.OUTLINE_DATUM:
        case DatumSourceType.DATUM_HASH: {
          const dataHash = CSL.DataHash.from_bytes(this.datumSource.hash.bytes);
          ret.set_data_hash(dataHash);
          safeFreeRustObjects(dataHash);
          break;
        }
        case DatumSourceType.INLINE_DATUM: {
          const plutusData = CSL.PlutusData.from_bytes(this.datumSource.data.bytes);
          ret.set_plutus_data(plutusData);
          safeFreeRustObjects(plutusData);
          break;
        }
      }
    }
    if (this.scriptRef) {
      const language = PlutusVersion.toCSL(this.scriptRef.plutusVersion);
      const plutusScript = CSL.PlutusScript.from_bytes_with_version(this.scriptRef.script.bytes, language);
      const scriptRef = CSL.ScriptRef.new_plutus_script(plutusScript);
      ret.set_script_ref(scriptRef);
      safeFreeRustObjects(plutusScript, scriptRef, language);
    }

    safeFreeRustObjects(address, value);

    return ret;
  }

  toBytes(): Bytes {
    const transactionOutput = this.toCSL();
    const txBytes = new Bytes(transactionOutput.to_bytes());
    safeFreeRustObjects(transactionOutput);
    return txBytes;
  }

  toHex(): CborHex<CSLTransactionOutput> {
    return this.toBytes().hex;
  }

  getMissingMinimumADA(networkEnvironment: NetworkEnvironment): bigint {
    const minLovelace = this.getMinimumADA(networkEnvironment);
    if (this.value.get(ADA) < minLovelace) {
      return minLovelace - this.value.get(ADA);
    }
    return 0n;
  }

  getExtractableADA(networkEnvironment: NetworkEnvironment): bigint {
    return this.value.get(ADA) - this.getMinimumADA(networkEnvironment);
  }

  addMinimumADAIfRequired(networkEnvironment: NetworkEnvironment): TxOut {
    const minLovelace = this.getMinimumADA(networkEnvironment);
    if (this.value.get(ADA) < minLovelace) {
      this.value.set(ADA, minLovelace);
    }
    return this;
  }

  getMinimumADA(networkEnvironment: NetworkEnvironment): bigint {
    const CSL = RustModule.get;
    const utxoCostPerByte = DEFAULT_STABLE_PROTOCOL_PARAMS[networkEnvironment].utxoCostPerByte;
    const coinsPerByte = CSL.BigNum.from_str(utxoCostPerByte.toString());
    const dataCost = CSL.DataCost.new_coins_per_byte(coinsPerByte);
    const transactionOutput = this.toCSL();
    const minAda = CSL.min_ada_for_output(transactionOutput, dataCost);
    const minLovelace = BigInt(minAda.to_str());
    safeFreeRustObjects(coinsPerByte, dataCost, transactionOutput, minAda);
    return minLovelace;
  }

  includeInlineDatums(): boolean {
    if (Maybe.isJust(this.datumSource)) {
      return this.datumSource.type === DatumSourceType.INLINE_DATUM;
    } else {
      return false;
    }
  }

  incluneOutlineDatums(): boolean {
    if (Maybe.isJust(this.datumSource)) {
      return this.datumSource.type === DatumSourceType.OUTLINE_DATUM;
    } else {
      return false;
    }
  }

  getDatumHash(): Result<Bytes, Error> {
    if (!this.datumSource) {
      return Result.err(new Error("getDatumHash: Output doesn't contain any Datum Hash"));
    }
    if (this.datumSource.type === DatumSourceType.INLINE_DATUM) {
      return Result.err(
        new Error(`getDatumHash: Output contains ${this.datumSource.type}, use get${this.datumSource.type} instead of`),
      );
    }
    return Result.ok(this.datumSource.hash);
  }

  getOutlineDatum(): Result<Bytes, Error> {
    if (!this.datumSource) {
      return Result.err(new Error("getOutlineDatum: Output doesn't contain any Datum"));
    }
    if (this.datumSource.type !== DatumSourceType.OUTLINE_DATUM) {
      return Result.err(
        new Error(
          `getOutlineDatum: Output contains ${this.datumSource.type}, use get${this.datumSource.type} instead of`,
        ),
      );
    }
    return Result.ok(this.datumSource.data);
  }

  getInlineDatum(): Result<Bytes, Error> {
    if (!this.datumSource) {
      return Result.err(new Error("getDatum: Output doesn't contain any Datum"));
    }
    if (this.datumSource.type !== DatumSourceType.INLINE_DATUM) {
      return Result.err(
        new Error(
          `getInlineDatum: Output contains ${this.datumSource.type}, use get${this.datumSource.type} instead of`,
        ),
      );
    }
    return Result.ok(this.datumSource.data);
  }

  clone(): TxOut {
    return new TxOut(
      this.address.clone(),
      this.value.clone(),
      this.datumSource ? DatumSource.clone(this.datumSource) : undefined,
      this.scriptRef
        ? { plutusVersion: this.scriptRef.plutusVersion, script: this.scriptRef.script.clone() }
        : undefined,
    );
  }

  equals(out: TxOut): boolean {
    return this.toHex() === out.toHex();
  }

  private static minimumAdaForAdaOnlyOut: bigint | null = null;

  static getMinimumAdaForAdaOnlyOut(networkEnvironment: NetworkEnvironment): bigint {
    if (TxOut.minimumAdaForAdaOnlyOut !== null) {
      return TxOut.minimumAdaForAdaOnlyOut;
    }
    const fakeOut = new TxOut(
      Address.fromBech32(
        "addr_test1qzs4ca0t52t69fc95wwqqr7nczwrrs6yueszt78urx2v34kc0zqshqw4699rh032nmvrevagcx0uwgs03n2dxj2rhpqs3jhsgd",
      ),
      new Value(),
    );
    fakeOut.value.add(ADA, 1n);
    TxOut.minimumAdaForAdaOnlyOut = fakeOut.getMinimumADA(networkEnvironment);
    return TxOut.minimumAdaForAdaOnlyOut;
  }

  compareByAsset(out: TxOut, asset: Asset): number {
    const first = this.value.get(asset);
    const second = out.value.get(asset);
    if (first > second) {
      return 1;
    } else if (first < second) {
      return -1;
    } else {
      return 0;
    }
  }

  static findOwnedOutputs = (address: Address, outputs: TxOut[]): TxOut[] => {
    return outputs.filter((o) => o.address.equals(address));
  };
}

export type Utxo = {
  input: TxIn;
  output: TxOut;
};

export type KupoUtxo = {
  transaction_id: string;
  transaction_index: number;
  output_index: number;
  address: string;
  value: KupoValue;
  datum_hash?: string | null;
  datum_type?: "inline" | "hash" | null;
  script_hash?: string | null;
  created_at: {
    slot_no: bigint | number;
    header_hash: string;
  };
  spent_at?: {
    slot_no: bigint;
    header_hash: string;
  } | null;
};

export namespace Utxo {
  export function fromHex(cborHex: string): Utxo {
    const ECSL = RustModule.getE;
    const cslUtxo = ECSL.TransactionUnspentOutput.from_hex(cborHex);
    const input = cslUtxo.input();
    const output = cslUtxo.output();
    const utxo = {
      input: TxIn.fromHex(input.to_hex()),
      output: TxOut.fromHex(output.to_hex()),
    };
    safeFreeRustObjects(input, output, cslUtxo);
    return utxo;
  }

  /** Testing Purpose Only */
  export function getOutputsFromTxRaw(txRaw: CborHex<ECSLTransaction>): Utxo[] {
    const ECSL = RustModule.getE;
    const tx = ECSL.Transaction.from_hex(txRaw);
    const cslTxBody = tx.body();
    const txID = CSLUtils.getTxHash(tx);
    const cslOutputs = cslTxBody.outputs();
    const outputs: Utxo[] = unwrapRustVec(cslOutputs).map((o, index) => {
      const outputHex = o.to_hex();
      const output = TxOut.fromHex(outputHex);
      const utxo: Utxo = {
        input: {
          txId: Bytes.fromHex(txID),
          index: index,
        },
        output: output,
      };
      o.free();
      return utxo;
    });
    safeFreeRustObjects(tx, cslTxBody, cslOutputs);
    return outputs;
  }

  export function toCSL(utxo: Utxo): CSLTransactionUnspentOutput {
    const CSL = RustModule.get;
    const input = TxIn.toCSL(utxo.input);
    const output = utxo.output.toCSL();
    const cslUtxo = CSL.TransactionUnspentOutput.new(input, output);

    safeFreeRustObjects(input, output);

    return cslUtxo;
  }

  export function size(utxo: Utxo): number {
    const cslUtxo = toCSL(utxo);
    const size = cslUtxo.to_bytes().length;
    safeFreeRustObjects(cslUtxo);
    return size;
  }

  export function listToCSL(utxos: Utxo[]): CSLTransactionUnspentOutputs {
    const CSL = RustModule.get;
    const result: CSLTransactionUnspentOutputs = CSL.TransactionUnspentOutputs.new();
    for (const utxo of utxos) {
      const txUnspentOut = toCSL(utxo);
      result.add(txUnspentOut);
      safeFreeRustObjects(txUnspentOut);
    }
    return result;
  }

  export function fromOgmios(utxos: Ogmios.Utxo): Utxo[] {
    return utxos.map((utxo) => ({
      input: TxIn.fromOgmios({
        transaction: utxo.transaction,
        index: utxo.index,
      }),
      output: TxOut.fromOgmios({
        address: utxo.address,
        value: utxo.value,
        datumHash: utxo.datumHash,
        datum: utxo.datum,
        script: utxo.script,
      }),
    }));
  }

  export function toOgmios(utxos: Utxo[]): Ogmios.Utxo {
    return utxos.map((utxo) => {
      const input = TxIn.toOgmios(utxo.input);
      const output = utxo.output.toOgmios();
      return {
        transaction: input.transaction,
        index: input.index,
        address: output.address,
        value: output.value,
        datumHash: output.datumHash,
        datum: output.datum,
        script: output.script,
      };
    });
  }

  export function toHex(utxo: Utxo): CborHex<CSLTransactionUnspentOutput> {
    const cslUtxo = toCSL(utxo);
    const b = new Bytes(cslUtxo.to_bytes());
    safeFreeRustObjects(cslUtxo);
    return b.hex;
  }

  export function sumValue(utxos: Utxo[]): Value {
    return utxos.reduce((pre, u) => pre.addAll(u.output.value), new Value());
  }

  export function contains(utxos: Utxo[], search: Utxo): boolean {
    return utxos.some((utxo) => Utxo.toHex(utxo) === Utxo.toHex(search));
  }

  export function fromKupo(utxo: KupoUtxo, datum?: string): Utxo {
    // TODO: support script ref
    let datumSource: Maybe<DatumSource> = null;
    if (utxo.datum_hash) {
      // just type safety check
      invariant(utxo.datum_type === "hash" || utxo.datum_type === "inline", "not found datum type");
      if (utxo.datum_type === "hash") {
        if (datum) {
          datumSource = {
            type: DatumSourceType.OUTLINE_DATUM,
            hash: Bytes.fromHex(utxo.datum_hash),
            data: Bytes.fromHex(datum),
          };
        } else {
          datumSource = {
            type: DatumSourceType.DATUM_HASH,
            hash: Bytes.fromHex(utxo.datum_hash),
          };
        }
      } else {
        invariant(
          datum,
          `Inline datum requires full datum to handle, missing datum of datum hash: ${utxo.datum_hash}, tx: ${utxo.transaction_id}${utxo.transaction_index}`,
        );
        datumSource = {
          type: DatumSourceType.INLINE_DATUM,
          data: Bytes.fromHex(datum),
        };
      }
    }
    return {
      input: {
        txId: Bytes.fromHex(utxo.transaction_id),
        index: utxo.output_index,
      },
      // TODO: add support for script ref
      output: new TxOut(Address.fromBech32(utxo.address), Value.fromKupo(utxo.value), datumSource),
    };
  }

  /**
   * Predicate for sorting UTxOs
   *
   * @param a first utxo
   * @param b second utxo
   * @param asset asset to compare quantity
   * @param considerMinimumAda compare by removing minimum ADA quantity if ADA is used for comparison
   */
  export function sortDesc(a: Utxo, b: Utxo, asset: Asset, networkEnvironment: NetworkEnvironment, considerMinimumAda?: boolean): number {
    const offsetMinAdaFirst =
      considerMinimumAda && a.output.value.hasNativeTokens() && asset.equals(ADA) ? a.output.getMinimumADA(networkEnvironment) : 0n;
    const first = a.output.value.get(asset) - offsetMinAdaFirst;
    const offsetMinAdaSecond =
      considerMinimumAda && b.output.value.hasNativeTokens() && asset.equals(ADA) ? b.output.getMinimumADA(networkEnvironment) : 0n;
    const second = b.output.value.get(asset) - offsetMinAdaSecond;
    if (first > second) {
      return -1;
    } else if (first < second) {
      return 1;
    } else {
      return 0;
    }
  }

  export function getLastOutFromRawTx(txRaw: CborHex<ECSLTransaction>): Utxo {
    const ECSL = RustModule.getE;
    const tx = ECSL.Transaction.from_bytes(Bytes.fromHex(txRaw).bytes);
    const cslTxBody = tx.body();
    const txID = CSLUtils.getTxHash(tx);
    const cslOutputs = cslTxBody.outputs();
    const changeOutputIdx = cslOutputs.len() - 1;
    const cslChangeOutput = cslOutputs.get(changeOutputIdx);
    const changeOutput = TxOut.fromHex(cslChangeOutput.to_hex());
    const changeUTxO: Utxo = {
      input: {
        txId: Bytes.fromHex(txID),
        index: changeOutputIdx,
      },
      output: changeOutput,
    };
    safeFreeRustObjects(tx, cslTxBody, cslOutputs, cslChangeOutput);
    return changeUTxO;
  }

  export function utxosToTxInSet(utxos: Utxo[]): Set<string> {
    return new Set(utxos.map((utxo) => TxIn.toString(utxo.input)));
  }

  export function clone(utxo: Utxo): Utxo {
    return {
      input: TxIn.clone(utxo.input),
      output: utxo.output.clone(),
    };
  }
}

export abstract class BaseUtxoModel {
  readonly txIn: TxIn;
  readonly address: Address;
  readonly value: Value;
  readonly rawDatum: string;

  constructor(txIn: TxIn, address: Address, value: Value, rawDatum: string) {
    this.txIn = txIn;
    this.address = address;
    this.value = value;
    this.rawDatum = rawDatum;
  }

  equals(other: BaseUtxoModel): boolean {
    return (
      TxIn.equals(this.txIn, other.txIn) &&
      this.address.equals(other.address) &&
      this.value.equals(other.value) &&
      this.rawDatum === other.rawDatum
    );
  }
}
