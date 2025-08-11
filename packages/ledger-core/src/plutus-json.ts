import invariant from "@minswap/tiny-invariant";
import { type CSLPlutusData, Maybe, RustModule, safeFreeRustObjects } from "@repo/ledger-utils";
import * as cbors from "@stricahq/cbors";
import { BigNumber } from "bignumber.js";
import { Bytes } from "./bytes";

export const DATUM_HASH_HEX_LENGTH = 64;

export class UnwrapPlutusDataError extends Error {}

export type PlutusConstr = {
  constructor: number;
  fields: PlutusData[];
  source?: string;
};
export type PlutusList = {
  list: PlutusData[];
  source?: string;
};
export type PlutusMap = {
  map: { k: PlutusData; v: PlutusData }[];
  source?: string;
};
export type PlutusInt = {
  int: string;
  source?: string;
};
export type PlutusBytes = {
  bytes: string;
  source?: string;
};
export type PlutusFixedLengthArray = {
  array: PlutusData[];
  source?: string;
};
export type PlutusConstrFixedLengthArray = {
  constructor: number;
  fieldArray: PlutusData[];
  source?: string;
};
export type PlutusData =
  | PlutusConstr
  | PlutusList
  | PlutusMap
  | PlutusInt
  | PlutusBytes
  | PlutusFixedLengthArray
  | PlutusConstrFixedLengthArray;
export type PreEncodedPlutusData =
  | Uint8Array
  | BigNumber
  | cbors.CborTag
  | PreEncodedPlutusData[]
  | Map<PreEncodedPlutusData, PreEncodedPlutusData>;
export type DecodedPlutusData =
  | Buffer
  | BigNumber
  | number
  | cbors.CborTag
  | DecodedPlutusData[]
  | Map<DecodedPlutusData, DecodedPlutusData>;

export namespace PlutusConstr {
  export function unwrap<T extends PlutusConstr>(d: PlutusData, constraints: Record<number, number>): T {
    const length = Object.keys(d).length;
    const validLength = length === 2 || length === 3;
    invariant(validLength && "constructor" in d && "fields" in d, `Data is not Constr: ${JSON.stringify(d)}`);
    invariant(d.constructor in constraints, `Constr ${d.constructor} is not defined in constraints`);
    invariant(
      constraints[d.constructor] === d.fields.length,
      `Expect Constr data to have ${constraints[d.constructor]} fields, got ${d.fields.length} fields`,
    );

    return d as T;
  }
}

export namespace PlutusConstrFixedLengthArray {
  export function unwrap<T extends PlutusConstrFixedLengthArray>(
    d: PlutusData,
    constraints: Record<number, number>,
  ): T {
    const length = Object.keys(d).length;
    const validLength = length === 2 || length === 3;
    invariant(validLength && "constructor" in d && "fieldArray" in d, `Data is not Constr: ${JSON.stringify(d)}`);
    invariant(d.constructor in constraints, `Constr ${d.constructor} is not defined in constraints`);
    invariant(
      constraints[d.constructor] === d.fieldArray.length,
      `Expect Constr data to have ${constraints[d.constructor]} fields, got ${d.fieldArray.length} fields`,
    );

    return d as T;
  }
}

export namespace PlutusList {
  export function unwrap(d: PlutusData): PlutusData[] {
    invariant("list" in d, `Data is not List: ${JSON.stringify(d)}`);
    return d.list;
  }

  export function unwrapToPlutusList(d: PlutusData): PlutusList {
    invariant("list" in d, `Data is not List: ${JSON.stringify(d)}`);
    return d;
  }
}

export namespace PlutusFixedLengthArray {
  export function unwrap(d: PlutusData): PlutusData[] {
    invariant("array" in d, `Data is not Array: ${JSON.stringify(d)}`);
    return d.array;
  }

  export function unwrapToPlutusList(d: PlutusData): PlutusFixedLengthArray {
    invariant("array" in d, `Data is not Array: ${JSON.stringify(d)}`);
    return d;
  }
}

export namespace PlutusMap {
  export function unwrap(d: PlutusData): PlutusMap {
    invariant("map" in d, `Data is not Map: ${JSON.stringify(d)}`);
    return d;
  }
}

export namespace PlutusInt {
  export function unwrap(d: PlutusData): PlutusInt {
    invariant("int" in d && typeof d.int === "string", `Data is not Int: ${JSON.stringify(d)}`);
    return d;
  }

  export function wrap(d: bigint | number): PlutusInt {
    return { int: d.toString() };
  }

  export function unwrapToBigInt(d: PlutusData): bigint {
    const i = unwrap(d);
    return BigInt(i.int);
  }

  export function unwrapToNumber(d: PlutusData): number {
    const i = unwrap(d);
    return Number.parseInt(i.int, 10);
  }
}

export namespace PlutusBytes {
  export function unwrap(d: PlutusData): Bytes {
    invariant("bytes" in d, `Data is not Bytes: ${JSON.stringify(d)}`);
    return Bytes.fromHex(d.bytes);
  }

  export function wrap(d: Bytes): PlutusData {
    return { bytes: d.hex };
  }
}

export namespace PlutusData {
  export const isPlutusBytes = (data: PlutusData): data is PlutusBytes => "bytes" in data;
  export const isPlutusConstr = (data: PlutusData): data is PlutusConstr => {
    return "constructor" in data && "fields" in data;
  };
  export const isPlutusInt = (data: PlutusData): data is PlutusInt => "int" in data;
  export const isPlutusList = (data: PlutusData): data is PlutusList => "list" in data;
  export const isPlutusMap = (data: PlutusData): data is PlutusMap => "map" in data;
  export const isPlutusFixedLengthArray = (data: PlutusData): data is PlutusFixedLengthArray => "array" in data;
  export const isPlutusConstrFixedLengthArray = (data: PlutusData): data is PlutusConstrFixedLengthArray =>
    "fieldArray" in data;

  const postDecode = (value: DecodedPlutusData): PlutusData => {
    if (typeof value === "number") {
      return {
        int: value.toString(),
      };
    } else if (typeof value === "object" && BigNumber.isBigNumber(value)) {
      return {
        int: value.toString(),
      };
    } else if (value instanceof Uint8Array) {
      return {
        bytes: value.toString("hex"),
      };
    } else if (Array.isArray(value)) {
      return {
        list: Array.from(value.map(postDecode)),
      };
    } else if (value instanceof cbors.CborTag) {
      if (value.tag >= 121 && value.tag <= 127) {
        return {
          constructor: value.tag - 121,
          fields: Array.from(value.value.map(postDecode)),
        };
      } else if (value.tag >= 1280 && value.tag <= 1400) {
        return {
          constructor: value.tag - 1280 + 7,
          fields: Array.from(value.value.map(postDecode)),
        };
      } else if (value.tag === 102) {
        return {
          constructor: Number(value.value[0]),
          fields: Array.from(value.value[1].map(postDecode)),
        };
      } else if (value.tag === 2) {
        // The prefix "0x" is added to the hex string to indicate that it should be interpreted as a hexadecimal number
        const v = BigInt(`0x${value.value.toString("hex")}`);
        return { int: v.toString() };
      } else if (value.tag === 3) {
        let v = BigInt(`0x${value.value.toString("hex")}`);
        v += 1n;
        v *= -1n;
        return { int: v.toString() };
      } else {
        throw new Error(`not support cbor.Tag ${value.tag}`);
      }
    } else if (value instanceof Map) {
      const map: { k: PlutusData; v: PlutusData }[] = [];
      for (const [k, v] of value.entries()) {
        map.push({
          k: postDecode(k),
          v: postDecode(v),
        });
      }
      return {
        map: map,
      };
    }

    throw new Error("not support decode value");
  };

  const preEncode = (plutusData: PlutusData): PreEncodedPlutusData => {
    if (isPlutusList(plutusData)) {
      if (plutusData.list.length) {
        const ary = new cbors.IndefiniteArray();
        for (const d of plutusData.list) {
          ary.push(preEncode(d));
        }
        return ary;
      }
      return [];
    } else if (isPlutusFixedLengthArray(plutusData)) {
      /**
       * Reference: https://github.com/StricaHQ/cbors/blob/master/src/encode.ts#L155-L166
       */
      const array: PreEncodedPlutusData = [];
      for (const d of plutusData.array) {
        array.push(preEncode(d));
      }
      return array;
    } else if (isPlutusInt(plutusData)) {
      return new BigNumber(plutusData.int);
    } else if (isPlutusBytes(plutusData)) {
      return PlutusBytes.unwrap(plutusData).bytes;
    } else if (isPlutusConstr(plutusData)) {
      let fields: Array<unknown> = [];
      if (plutusData.fields.length) {
        fields = new cbors.IndefiniteArray();
        for (const field of plutusData.fields) {
          fields.push(preEncode(field));
        }
      }
      if (plutusData.constructor <= 6) {
        return new cbors.CborTag(fields, 121 + plutusData.constructor);
      } else if (plutusData.constructor >= 7 && plutusData.constructor <= 127) {
        const mask = plutusData.constructor - 7;
        return new cbors.CborTag(fields, 1280 + mask);
      } else {
        return new cbors.CborTag([plutusData.constructor, fields], 102);
      }
    } else if (isPlutusConstrFixedLengthArray(plutusData)) {
      let fieldArray: Array<unknown> = [];
      if (plutusData.fieldArray.length) {
        fieldArray = [];
        for (const field of plutusData.fieldArray) {
          fieldArray.push(preEncode(field));
        }
      }
      if (plutusData.constructor <= 6) {
        return new cbors.CborTag(fieldArray, 121 + plutusData.constructor);
      } else if (plutusData.constructor >= 7 && plutusData.constructor <= 127) {
        const mask = plutusData.constructor - 7;
        return new cbors.CborTag(fieldArray, 1280 + mask);
      } else {
        return new cbors.CborTag([plutusData.constructor, fieldArray], 102);
      }
    } else if (isPlutusMap(plutusData)) {
      const map = new Map();
      if (plutusData.map.length > 0) {
        for (const { k: key, v: value } of plutusData.map) {
          map.set(preEncode(key), preEncode(value));
        }
      }
      return map;
    }
    throw new Error("not supported in PlutusData");
  };

  export function fromDataHex(dataHex: string): PlutusData {
    const value: DecodedPlutusData = cbors.Decoder.decode(Buffer.from(dataHex, "hex")).value;
    return {
      ...postDecode(value),
      source: dataHex,
    };
  }

  export function toDataHex(plutusData: PlutusData): string {
    if (plutusData.source) {
      return plutusData.source;
    }
    const preEncodedData = preEncode(plutusData);
    const buffer = cbors.Encoder.encode(preEncodedData);
    return buffer.toString("hex");
  }

  export function splitPlutusBytes(pBytes: PlutusBytes): PlutusBytes | PlutusList {
    if (pBytes.bytes.length > 64) {
      const splittedBytes = pBytes.bytes.match(/.{1,64}/g);
      invariant(splittedBytes, `could not split string: ${pBytes.bytes}`);
      const pList: PlutusList = {
        list: splittedBytes.map((s) => PlutusBytes.wrap(Bytes.fromHex(s))),
      };
      return pList;
    } else {
      return pBytes;
    }
  }

  export function combinePlutusBytes(pList: PlutusList): PlutusBytes {
    if (pList.list.length === 0) {
      return {
        bytes: "",
      };
    } else {
      invariant(pList.list.every(isPlutusBytes), "All elements of the list have to be Plutus Bytes");
      let combinedHex: string = "";
      for (const d of pList.list) {
        combinedHex += PlutusBytes.unwrap(d).hex;
      }
      return {
        bytes: combinedHex,
      };
    }
  }

  export function toPlutusDataEncoding(plutusData: PlutusData): PreEncodedPlutusData {
    return preEncode(plutusData);
  }

  export function hashPlutusData(plutusData: PlutusData | string): Bytes {
    const CSL = RustModule.get;
    let dataHex: string;
    if (typeof plutusData === "string") {
      dataHex = plutusData;
    } else {
      if (plutusData.source) {
        dataHex = plutusData.source;
      } else {
        dataHex = PlutusData.toDataHex(plutusData);
      }
    }
    const cslPlutusData = CSL.PlutusData.from_hex(dataHex);
    const cslDatumHash = CSL.hash_plutus_data(cslPlutusData);
    const datumHash = cslDatumHash.to_bytes();
    safeFreeRustObjects(cslPlutusData, cslDatumHash);
    return new Bytes(datumHash);
  }

  export function toCSL(plutusData: PlutusData): CSLPlutusData {
    const CSL = RustModule.get;
    return CSL.PlutusData.from_hex(PlutusData.toDataHex(plutusData));
  }
}

export type PlutusMaybe<T extends PlutusData> =
  | {
      constructor: 0;
      fields: [T];
    }
  | {
      constructor: 1;
      fields: [];
    };

export namespace PlutusMaybe {
  export function unwrap(d: PlutusData): Maybe<PlutusData> {
    const maybe = PlutusConstr.unwrap(d, { [0]: 1, [1]: 0 });
    switch (maybe.constructor) {
      case 0:
        return maybe.fields[0];
      case 1:
        return null;
      default:
        throw new Error(`unexpected constr for Maybe: ${maybe.constructor}`);
    }
  }

  export function just<T extends PlutusData>(d: T): PlutusMaybe<T> {
    return {
      constructor: 0,
      fields: [d],
    };
  }

  export function nothing<T extends PlutusData>(): PlutusMaybe<T> {
    return {
      constructor: 1,
      fields: [],
    };
  }

  export function wrap<T extends PlutusData>(a: Maybe<T>): PlutusMaybe<T> {
    if (Maybe.isJust(a)) {
      return just(a);
    } else {
      return nothing();
    }
  }
}

export type PlutusMaybeFixedLengthArray<T extends PlutusData> =
  | {
      constructor: 0;
      fieldArray: [T];
    }
  | {
      constructor: 1;
      fieldArray: [];
    };

export namespace PlutusMaybeFixedLengthArray {
  export function unwrap(d: PlutusData): Maybe<PlutusData> {
    const maybe = PlutusConstrFixedLengthArray.unwrap(d, { [0]: 1, [1]: 0 });
    switch (maybe.constructor) {
      case 0:
        return maybe.fieldArray[0];
      case 1:
        return null;
      default:
        throw new Error(`unexpected constr for Maybe: ${maybe.constructor}`);
    }
  }

  export function just<T extends PlutusData>(d: T): PlutusMaybeFixedLengthArray<T> {
    return {
      constructor: 0,
      fieldArray: [d],
    };
  }

  export function nothing<T extends PlutusData>(): PlutusMaybeFixedLengthArray<T> {
    return {
      constructor: 1,
      fieldArray: [],
    };
  }

  export function wrap<T extends PlutusData>(a: Maybe<T>): PlutusMaybeFixedLengthArray<T> {
    if (Maybe.isJust(a)) {
      return just(a);
    } else {
      return nothing();
    }
  }
}

export namespace PlutusBool {
  export function unwrap(d: PlutusData): boolean {
    const { constructor } = PlutusConstr.unwrap(d, {
      [0]: 0,
      [1]: 0,
    });
    return constructor === 1;
  }
  export function wrap(d: boolean): PlutusData {
    return {
      constructor: d ? 1 : 0,
      fields: [],
    };
  }
}
