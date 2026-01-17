import { RustModule } from "@repo/ledger-utils";
import * as fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { Bytes } from "../src";

beforeAll(async () => {
  await RustModule.load();
});

describe("example-based testing", () => {
  it("works", () => {
    expect(new Bytes(new Uint8Array([1, 2, 255])).equals(new Bytes(new Uint8Array([1, 2, 255])))).toBeTruthy();
    expect(new Bytes(new Uint8Array([1, 2, 255])).equals(new Bytes(new Uint8Array([1, 2, 253])))).toBeFalsy();
    expect(new Bytes(new Uint8Array([1, 2, 255])).equals(new Bytes(new Uint8Array([1, 2])))).toBeFalsy();
  });

  it("should throw error on wrong encoding", () => {
    expect(() => Bytes.fromHex("clgt")).toThrow();
    expect(() => Bytes.fromBase64("!!!!!!")).toThrow();
  });
});

describe("property-based testing", () => {
  it("equals to its clone", () => {
    fc.assert(
      fc.property(fc.uint8Array(), (b) => {
        const bytes = new Bytes(b);
        return bytes.equals(bytes.clone());
      }),
    );
  });
  it("can do round-trip hex conversion", () => {
    fc.assert(
      fc.property(fc.uint8Array(), (b) => {
        const bytes = new Bytes(b);
        return bytes.equals(Bytes.fromHex(bytes.hex));
      }),
    );
  });

  it("round-trip from/to string", () => {
    const data = "tony in the air";
    const bytes = Bytes.fromString(data);
    const str = bytes.toString();
    expect(str).toBe(data);
  });
});
