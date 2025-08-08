import {
  type CborHex,
  type CSLPlutusData,
  IsomorphicTextEncodeDecode,
  RustModule,
  safeFreeRustObjects,
} from "@repo/ledger-utils";
import { PlutusBytes, type PlutusData } from ".";

const HEX_REGEX = /^[a-f0-9]*$/i;
const BASE64_REGEX = /^[a-z0-9+/=]*$/i;
const isValidHex = (s: string): boolean => HEX_REGEX.test(s);
const isValidBase64 = (s: string): boolean => BASE64_REGEX.test(s);

export class Bytes {
  readonly bytes: Uint8Array;
  readonly hex: string;

  constructor(bytes: Uint8Array) {
    this.bytes = new Uint8Array(bytes); // coerc type
    this.hex = Buffer.from(this.bytes).toString("hex");
  }

  get length(): number {
    return this.bytes.length;
  }

  static fromHex(s: string): Bytes {
    if (!isValidHex(s)) {
      throw new Error(`invalid hex: ${s}`);
    }
    return new Bytes(Uint8Array.from(Buffer.from(s, "hex")));
  }

  static fromPlutusJson(d: PlutusData): Bytes {
    return PlutusBytes.unwrap(d);
  }

  static fromNumberArr(arr: number[]): Bytes {
    return new Bytes(new Uint8Array(arr));
  }

  toPlutusJson(): PlutusData {
    return PlutusBytes.wrap(this);
  }

  toDataHex(): CborHex<CSLPlutusData> {
    const CSL = RustModule.get;
    const plutusJson = this.toPlutusJson();
    const plutusData = CSL.PlutusData.from_json(JSON.stringify(plutusJson), CSL.PlutusDatumSchema.DetailedSchema);
    const ret = plutusData.to_hex();

    safeFreeRustObjects(plutusData);
    return ret;
  }

  // Convert from an UTF-8 string to Bytes
  static fromString(s: string): Bytes {
    const TextEncoder = IsomorphicTextEncodeDecode.initializeTextEncoder();
    return new Bytes(new TextEncoder().encode(s));
  }

  toNumberArray(): number[] {
    const arr: number[] = [];
    for (const v of this.bytes) {
      arr.push(v);
    }
    return arr;
  }

  // Convert to an UTF-8 string
  toString(): string {
    const TextDecoder = IsomorphicTextEncodeDecode.initializeTextDecoder();
    return new TextDecoder("utf-8").decode(this.bytes);
  }

  toJSON(): string {
    return this.hex;
  }

  toXJSON(): { $bytes: string } {
    return { $bytes: this.hex };
  }

  static fromBase64(s: string): Bytes {
    if (!isValidBase64(s)) {
      throw new Error(`invalid base64: ${s}`);
    }
    return new Bytes(Uint8Array.from(Buffer.from(s, "base64")));
  }

  clone(): Bytes {
    const arr = new Uint8Array(this.bytes.length);
    for (let i = 0; i < this.bytes.length; i++) {
      arr[i] = this.bytes[i];
    }
    return new Bytes(arr);
  }

  concat(other: Bytes): Bytes {
    const ret = new Uint8Array(this.bytes.length + other.bytes.length);
    for (let i = 0; i < this.bytes.length; i++) {
      ret[i] = this.bytes[i];
    }
    for (let i = this.bytes.length; i < ret.length; i++) {
      ret[i] = other.bytes[i - this.bytes.length];
    }
    return new Bytes(ret);
  }

  compare(other: Bytes): number {
    if (this.hex < other.hex) {
      return -1;
    }
    if (this.hex === other.hex) {
      return 0;
    }
    return 1;
  }

  equals(other: Bytes): boolean {
    return this.compare(other) === 0;
  }
}
