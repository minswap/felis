import type * as Ogmios from "@cardano-ogmios/schema";
import JSONBig from "json-bigint";
import { isDeepEqual } from "remeda";

import {
  ADA,
  Asset,
  Bytes,
  DEFAULT_STABLE_PROTOCOL_PARAMS,
  NetworkEnvironment,
} from ".";
import {
  RustModule,
  CSLValue,
  CborHex,
  safeFreeRustObjects,
} from "@repo/ledger-utils";

export type BigintIsh = bigint | bigint | string | number;

export type KupoValue = {
  coins: BigintIsh;
  assets?: Record<string, BigintIsh>;
};

/** internal representation of Value:
{
  "lovelace": 12345,
  "policyID.assetName": 567567
}
*/
export class Value {
  private readonly map: Record<string, bigint>;

  constructor(map?: Record<string, bigint>) {
    this.map = map ?? {};
  }

  flatten(): [Asset, bigint][] {
    return Object.entries(this.map).map(([key, val]) => [
      Asset.fromString(key),
      val,
    ]);
  }

  static unflatten(arr: [Asset, bigint][]): Value {
    const v = new Value();
    for (const [asset, amount] of arr) {
      v.add(asset, amount);
    }
    return v;
  }

  assets(): Asset[] {
    return Object.keys(this.map).map(Asset.fromString);
  }

  size(): number {
    return Object.keys(this.map).length;
  }

  isEmpty(): boolean {
    return this.size() === 0;
  }

  bytesLength(): number {
    return Bytes.fromHex(this.toHex()).length;
  }

  get(a: Asset): bigint {
    return this.map[a.toString()] ?? 0n;
  }

  /**
   * Return ADA amount in lovelace
   */
  coin(): bigint {
    return this.get(ADA);
  }

  set(a: Asset, x: bigint): Value {
    this.map[a.toString()] = x;
    return this;
  }

  has(a: Asset): boolean {
    return this.map[a.toString()] !== undefined;
  }

  hasPolicyID(x: Bytes): boolean {
    return this.findAsset(x) !== undefined;
  }

  policyIds(): Bytes[] {
    const policyIds = this.assets().map((asset) => asset.currencySymbol.hex);
    const policyIdSet = new Set<string>(policyIds);
    const uniqPolicyIds: Bytes[] = [];
    for (const pid of policyIdSet.keys()) {
      uniqPolicyIds.push(Bytes.fromHex(pid));
    }
    return uniqPolicyIds;
  }

  add(a: Asset, x: bigint): Value {
    if (x === 0n) {
      return this;
    }
    this.initIfNotExist(a);
    this.map[a.toString()] += x;
    return this;
  }

  subtract(a: Asset, x: bigint): Value {
    if (x === 0n) {
      return this;
    }
    this.initIfNotExist(a);
    this.map[a.toString()] -= x;
    return this;
  }

  // Remove asset if negative
  remove(a: Asset, x: bigint): Value {
    if (x === 0n || !this.has(a)) {
      return this;
    }
    this.map[a.toString()] -= x;
    if (this.map[a.toString()] <= 0) {
      delete this.map[a.toString()];
    }
    return this;
  }

  // Remove asset from value
  removeAsset(a: Asset): Value {
    if (!this.has(a)) {
      return this;
    }
    delete this.map[a.toString()];
    return this;
  }

  addAll(other: Value): Value {
    for (const [asset, amount] of other.flatten()) {
      this.add(asset, amount);
    }
    return this;
  }

  subtractAll(other: Value): Value {
    for (const [asset, amount] of other.flatten()) {
      this.subtract(asset, amount);
    }
    return this;
  }

  removeAll(other: Value): Value {
    for (const [asset, amount] of other.flatten()) {
      this.remove(asset, amount);
    }
    return this;
  }

  withoutPolicyId(policyId: Bytes): Value {
    const ret = new Value();
    for (const [asset, amount] of this.flatten()) {
      if (!asset.currencySymbol.equals(policyId)) {
        ret.add(asset, amount);
      }
    }
    return ret;
  }

  // Find first asset matching with @currencySymbol (hex format)
  findAsset(currencySymbol: Bytes): Asset | undefined {
    return this.assets().find(
      (a) => a.currencySymbol.hex === currencySymbol.hex,
    );
  }

  // Find all assets matching with @currencySymbol (hex format)
  findAssets(currencySymbol: Bytes): Asset[] {
    return this.assets().filter(
      (a) => a.currencySymbol.hex === currencySymbol.hex,
    );
  }

  /**
   * @deprecated Try to use TxOut.getMinimumADA() instead! | only use with `isScriptOutput` = True
   */
  getMinimumLovelace(
    isScriptOutput: boolean,
    networkEnv: NetworkEnvironment,
  ): bigint {
    const utxoCostPerByte =
      DEFAULT_STABLE_PROTOCOL_PARAMS[networkEnv].utxoCostPerByte;
    const CSL = RustModule.get;
    const valueCSL = this.toCSL();
    const coins = CSL.BigNum.from_str((utxoCostPerByte * 8).toString());
    const min = CSL.min_ada_required(valueCSL, isScriptOutput, coins);
    const result = BigInt(min.to_str());

    safeFreeRustObjects(coins, valueCSL, min);
    return result;
  }

  equals(other: Value): boolean {
    return isDeepEqual(this.map, other.map);
  }

  trim(): Value {
    for (const [asset, amount] of this.flatten()) {
      if (amount === 0n) {
        this.removeAsset(asset);
      }
    }
    return this;
  }

  isAdaOnly(): boolean {
    return this.size() === 1 && this.get(ADA) > 0n;
  }

  hasNativeTokens(): boolean {
    return this.size() > 1;
  }

  getNegativeValue(): Value {
    const negativeVal = new Value();
    for (const [asset, amount] of this.flatten()) {
      if (amount <= 0n) {
        negativeVal.add(asset, amount);
      }
    }
    return negativeVal;
  }

  /**
   * This function is make sure that the value does not contain any negative amount of any asset
   */
  isNonNegative(): boolean {
    for (const [_, x] of this.flatten()) {
      if (x < 0n) {
        return false;
      }
    }
    return true;
  }

  /**
   * This function is make sure that the value does not contain any zero or negative amount of any asset
   */
  isPositive(): boolean {
    for (const [_, x] of this.flatten()) {
      if (x <= 0n) {
        return false;
      }
    }
    return true;
  }

  clone(): Value {
    const ret = new Value();
    for (const [a, x] of this.flatten()) ret.set(a, x);
    return ret;
  }

  toJSON(): Record<string, bigint> {
    return this.map;
  }

  toXJSON(): { $ledgerValue: Record<string, string> } {
    const $ledgerValue: Record<string, string> = {};
    for (const asset in this.map) {
      $ledgerValue[asset] = this.map[asset].toString();
    }
    return { $ledgerValue };
  }

  toMap(): Record<string, Record<string, bigint>> {
    const ret: Record<string, Record<string, bigint>> = {};
    for (const [asset, amount] of this.flatten()) {
      const pid = asset.currencySymbol.hex;
      const tn = asset.tokenName.hex;
      if (ret[pid]) {
        if (ret[pid][tn]) {
          ret[pid][tn] += amount;
        } else {
          ret[pid][tn] = amount;
        }
      } else {
        ret[pid] = {
          [asset.tokenName.hex]: amount,
        };
      }
    }
    return ret;
  }

  static fromXJSON(input: Record<string, string>): Value {
    const map: Record<string, bigint> = {};
    for (const asset in input) {
      map[asset] = BigInt(input[asset]);
    }
    return new Value(map);
  }

  static fromHex(input: CborHex<CSLValue>): Value {
    const CSL = RustModule.get;
    const value = CSL.Value.from_hex(input);
    const coin = value.coin();
    const ret = new Value().add(ADA, BigInt(coin.to_str()));
    const ma = value.multiasset();
    if (ma !== undefined) {
      const mapMultiAsset: Record<
        string,
        Record<string, string>
      > = JSONBig.parse(ma.to_json());
      for (const [currencySymbol, mapTokenName] of Object.entries(
        mapMultiAsset,
      )) {
        for (const [tokenName, amount] of Object.entries(mapTokenName)) {
          const asset = new Asset(
            Bytes.fromHex(currencySymbol),
            Bytes.fromHex(tokenName),
          );
          ret.add(asset, BigInt(amount));
        }
      }
    }
    safeFreeRustObjects(value, coin, ma);
    return ret;
  }

  toCSL(): CSLValue {
    const CSL = RustModule.get;
    const assetMap: Record<
      string,
      Record<string, bigint>
    > = this.flatten().reduce<Record<string, Record<string, bigint>>>(
      (amap, [asset, amount]) => {
        if (amap[asset.currencySymbol.hex] === undefined) {
          amap[asset.currencySymbol.hex] = {};
        }
        amap[asset.currencySymbol.hex][asset.tokenName.hex] = amount;
        return amap;
      },
      {},
    );

    const ret = CSL.Value.new(CSL.BigNum.from_str(this.get(ADA).toString()));
    const multiasset = CSL.MultiAsset.new();
    for (const cs in assetMap) {
      if (cs === "") {
        // skip ADA
        continue;
      }
      const tnMap = CSL.Assets.new();
      for (const tn in assetMap[cs]) {
        const assetName = CSL.AssetName.new(Bytes.fromHex(tn).bytes);
        const amount = CSL.BigNum.from_str(assetMap[cs][tn].toString());
        tnMap.insert(assetName, amount);
        safeFreeRustObjects(assetName, amount);
      }
      const policyId = CSL.ScriptHash.from_bytes(Bytes.fromHex(cs).bytes);
      multiasset.insert(policyId, tnMap);
      safeFreeRustObjects(policyId, tnMap);
    }
    if (multiasset.len() > 0) {
      ret.set_multiasset(multiasset);
    }
    safeFreeRustObjects(multiasset);
    return ret;
  }

  toHex(): CborHex<Value> {
    const cslValue = this.toCSL();
    const cborValue = cslValue.to_hex();
    safeFreeRustObjects(cslValue);
    return cborValue;
  }

  toOgmios(): Ogmios.Value {
    const adaAmount = this.get(ADA);
    const nativeAssets = this.flatten().filter(([a, _]) => !a.equals(ADA));
    const ogmiosAssets: Record<string, Record<string, bigint>> = {};
    for (const [nativeAsset, amount] of nativeAssets) {
      const policyId = nativeAsset.currencySymbol.hex;
      const tokenName = nativeAsset.tokenName.hex;
      if (!ogmiosAssets[policyId]) {
        ogmiosAssets[policyId] = {
          [tokenName]: amount,
        };
      } else {
        if (!ogmiosAssets[policyId][tokenName]) {
          ogmiosAssets[policyId][tokenName] = amount;
        } else {
          ogmiosAssets[policyId][tokenName] += amount;
        }
      }
    }
    return {
      ada: {
        lovelace: adaAmount,
      },
      ...ogmiosAssets,
    };
  }

  static fromOgmios(input: Ogmios.Value): Value {
    const ret = new Value();
    for (const [pid, tokenNameMap] of Object.entries(input)) {
      if (pid === "ada") {
        ret.add(ADA, tokenNameMap["lovelace"]);
      }
    }
    const natives: [Asset, bigint][] = [];
    for (const [pid, tokenNameMap] of Object.entries(input)) {
      if (pid === "ada") {
        continue;
      }
      for (const [tokenName, amount] of Object.entries(tokenNameMap)) {
        natives.push([
          new Asset(Bytes.fromHex(pid), Bytes.fromHex(tokenName)),
          amount,
        ]);
      }
    }
    natives.sort((a, b) => a[0].compare(b[0]));
    for (const [asset, amount] of natives) {
      ret.add(asset, amount);
    }
    return ret;
  }

  static fromOgmiosAssets(input: Ogmios.Assets): Value {
    const ret = new Value();
    const natives: [Asset, bigint][] = [];
    for (const [pid, tokenNameMap] of Object.entries(input)) {
      for (const [tokenName, amount] of Object.entries(tokenNameMap)) {
        natives.push([
          new Asset(Bytes.fromHex(pid), Bytes.fromHex(tokenName)),
          amount,
        ]);
      }
    }
    natives.sort((a, b) => a[0].compare(b[0]));
    for (const [asset, amount] of natives) {
      ret.add(asset, amount);
    }
    return ret;
  }

  static fromKupo(kupoValue: KupoValue): Value {
    const value = new Value().add(ADA, BigInt(kupoValue.coins.toString()));
    const kupoAssets = kupoValue.assets;
    if (kupoAssets) {
      const natives: [Asset, bigint][] = [];
      for (const [asset, amount] of Object.entries(kupoAssets)) {
        natives.push([Asset.fromString(asset), BigInt(amount.toString())]);
      }
      natives.sort((a, b) => a[0].compare(b[0]));
      for (const [asset, amount] of natives) {
        value.add(asset, amount);
      }
    }
    return value;
  }

  private initIfNotExist(a: Asset): void {
    if (this.map[a.toString()] === undefined) {
      this.map[a.toString()] = 0n;
    }
  }

  /**
   * Checks if this Value instance covers another Value instance.
   * @param other - The Value instance to compare against.
   * @returns true if this instance covers the other, false otherwise.
   */
  public canCover(other: Value): boolean {
    const otherFlatten = other.flatten();
    for (const [asset, otherAmount] of otherFlatten) {
      const thisAmount = this.get(asset);
      if (thisAmount < otherAmount) {
        return false;
      }
    }
    return true;
  }
}
