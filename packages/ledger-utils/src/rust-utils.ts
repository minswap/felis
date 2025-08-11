import type { Maybe } from "./maybe";

// Phantom type
export type CborHex<_> = string;

export type RustVec<T> = {
  free(): void;
  len(): number;
  get(i: number): T;
  add(a: T): void;
};

export function unwrapRustVec<T>(vec: RustVec<T>): T[] {
  const ret: T[] = [];
  for (let i = 0; i < vec.len(); i++) {
    ret.push(vec.get(i));
  }
  return ret;
}

// This function will mutate input
export function appendRustVec<T, V extends RustVec<T>>(vec: V, els: T[]): V {
  for (const el of els) {
    vec.add(el);
  }
  return vec;
}

export type RustMap<K, V> = {
  free(): void;
  len(): number;
  insert(k: K, v: V): V | undefined;
  get(k: K): V | undefined;
  keys(): RustVec<K>;
};

export function unwrapRustMap<K, V>(map: RustMap<K, V>): [K, V][] {
  const ret: [K, V][] = [];
  const keys = unwrapRustVec(map.keys());
  for (const key of keys) {
    const val = map.get(key);
    if (val === undefined) {
      throw new Error("Impossible! Key must exist in map");
    }
    ret.push([key, val]);
  }
  return ret;
}

/**
 * Interface of Rust Object
 */
interface RustObject {
  free(): void;
}

/**
 * Rust Object will throw Error if we try to call free() function more than once per single Rust Instance
 * So we need to try catch the error for safety
 * @param objects will call free() function
 */
export function safeFreeRustObjects(...objects: Maybe<RustObject>[]): void {
  for (const obj of objects) {
    try {
      obj?.free();
    } catch (_err) {
      /* empty */
    }
  }
}
