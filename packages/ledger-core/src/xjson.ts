/** biome-ignore-all lint/suspicious/noExplicitAny: xjson is a complex data structure */
import BigNumber from "bignumber.js";

import { Address } from "./address";
import { Asset } from "./asset";
import { Bytes } from "./bytes";
import { Value } from "./value";

type XJsonDecoder = (a: any) => any;

const XJSON_DECODERS: Record<string, XJsonDecoder> = {
  $bigint: (a: string) => BigInt(a),
  $bignumber: (a: string) => new BigNumber(a),
  $date: (a: string) => new Date(a),
  $bytes: (a: string) => Bytes.fromHex(a),
  $asset: (a: string) => Asset.fromString(a),
  $address: (a: string) => Address.fromBech32(a),
  $ledgerValue: (a: Record<string, string>) => Value.fromXJSON(a),
  $set: (a: any[]) => new Set(a),
};

function replacer(this: any, key: string): any {
  const value = this[key];
  if (value === null) {
    return value;
  }
  if (typeof value === "bigint" || value instanceof BigInt) {
    return {
      $bigint: value.toString(),
    };
  }
  if (value instanceof Date) {
    return {
      $date: value.toISOString(),
    };
  }
  if (value instanceof Set) {
    return {
      $set: Array.from(value.keys()),
    };
  }
  if (typeof value === "object") {
    if (BigNumber.isBigNumber(value)) {
      return {
        $bignumber: value.toString(),
      };
    } else if ("toXJSON" in value) {
      return value.toXJSON();
    }
  }
  return value;
}

function reviver(_key: string, value: any): any {
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] in XJSON_DECODERS) {
      const decode = XJSON_DECODERS[keys[0]];
      return decode(value[keys[0]]);
    }
  }
  return value;
}

/**
 * EXtended JSON converter that help preserve type information when converting between TS objects and JSON.
 * Example: BigInt 10n will be serialized as {"$bigint":"10"} and deserialized again to be 10n
 * To support XJSON for a class, implement .toXJSON method in the class and implement a corresponding decoder in XJSON_DECODERS constant
 */
export namespace XJSON {
  export function stringify(a: any, indent?: number): string {
    return JSON.stringify(a, replacer, indent);
  }

  export function parse<T>(s: string): T {
    return JSON.parse(s, reviver);
  }
}
