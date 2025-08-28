import invariant from "@minswap/tiny-invariant";

import { sha3 } from "@repo/ledger-utils";
import { Bytes } from "./bytes";
import { PlutusConstr, type PlutusData } from "./plutus-json";

export class Asset {
  readonly currencySymbol: Bytes;
  readonly tokenName: Bytes;

  constructor(currencySymbol: Bytes, tokenName: Bytes) {
    if (currencySymbol.length > 0 || tokenName.length > 0) {
      invariant(currencySymbol.length === 28, `expect CurrencySymbol has length 28, got: ${currencySymbol.hex}`);
      invariant(
        tokenName.length >= 0 && tokenName.length <= 32,
        `expect TokenName has length from 0 to 32, got: ${tokenName.hex}`,
      );
    }
    this.currencySymbol = currencySymbol.clone();
    this.tokenName = tokenName.clone();
  }

  static fromPlutusJson(d: PlutusData): Asset {
    const data = PlutusConstr.unwrap(d, { [0]: 2 });
    const currencySymbol = Bytes.fromPlutusJson(data.fields[0]);
    const tokenName = Bytes.fromPlutusJson(data.fields[1]);
    return new Asset(currencySymbol, tokenName);
  }

  toPlutusJson(): PlutusData {
    return {
      constructor: 0,
      fields: [this.currencySymbol.toPlutusJson(), this.tokenName.toPlutusJson()],
    };
  }

  compare(other: Asset): number {
    if (this.currencySymbol.equals(other.currencySymbol)) {
      return this.tokenName.compare(other.tokenName);
    }
    return this.currencySymbol.compare(other.currencySymbol);
  }

  static compare(a: Asset, b: Asset): number {
    return a.compare(b);
  }

  equals(other: Asset): boolean {
    return this.compare(other) === 0;
  }

  static fromString(s: string): Asset {
    if (s === "lovelace") {
      return ADA;
    }
    const parts = s.split(".");
    invariant(
      parts.length === 1 || parts.length === 2,
      "Asset.fromString: expect input to have format lovelace, $policyID or $policyID.$assetName",
    );
    return new Asset(Bytes.fromHex(parts[0]), Bytes.fromHex(parts[1] ?? ""));
  }

  static fromBlockFrostString(s: string): Asset {
    if (s === "lovelace") {
      return ADA;
    }
    const policyId = s.slice(0, 56);
    const tokenName = s.slice(56);
    invariant(
      policyId,
      "Asset.fromBlockFrostString: expect input to have format lovelace, $policyID or $policyID$assetName",
    );
    return new Asset(Bytes.fromHex(policyId), Bytes.fromHex(tokenName));
  }

  toString(): string {
    if (this.equals(ADA)) {
      return "lovelace";
    }
    if (this.tokenName.hex === "") {
      return this.currencySymbol.hex;
    }
    return `${this.currencySymbol.hex}.${this.tokenName.hex}`;
  }

  toBlockFrostString(): string {
    if (this.equals(ADA)) {
      return "lovelace";
    }
    if (this.tokenName.hex === "") {
      return this.currencySymbol.hex;
    }
    return `${this.currencySymbol.hex}${this.tokenName.hex}`;
  }

  toSHA3(): string {
    return sha3(this.currencySymbol.hex + this.tokenName.hex);
  }

  toJSON(): string {
    return this.toString();
  }

  toXJSON(): { $asset: string } {
    return { $asset: this.toString() };
  }

  clone(): Asset {
    return new Asset(this.currencySymbol.clone(), this.tokenName.clone());
  }

  static hasIncludeAsset(asset: Asset, source: Asset[]): boolean {
    for (const as of source) {
      if (as.equals(asset)) {
        return true;
      }
    }
    return false;
  }

  static getString(currencySymbol: string, tokenName: string): string {
    const asset = new Asset(Bytes.fromHex(currencySymbol), Bytes.fromHex(tokenName));
    return asset.toString();
  }
}

export const ADA = new Asset(Bytes.fromHex(""), Bytes.fromHex(""));
