import { PlutusConstr } from "@minswap/felis-ledger-core";
import { describe, expect, it } from "vitest";
import { USDCxBurnTx } from "../src/build-tx.js";

const { cborBytestringHeader, encodeIndefiniteBytesHex, buildBurnRedeemer } = USDCxBurnTx;

/**
 * Decode a CBOR indefinite-length bytestring (`5f <chunk>* ff`) back to its hex
 * payload. Only handles the subset emitted by `encodeIndefiniteBytesHex`:
 *   major type 2, length info 0..23 (1-byte header) or 24..255 (2-byte header).
 * Used here to round-trip-test the encoder without pulling in a CBOR dependency.
 */
function decodeIndefiniteBytesHex(cborHex: string): string {
  const buf = Buffer.from(cborHex, "hex");
  if (buf[0] !== 0x5f) throw new Error("not an indefinite-length bytestring");
  const out: number[] = [];
  let i = 1;
  while (buf[i] !== 0xff) {
    const major = (buf[i] ?? 0) >> 5;
    if (major !== 2) throw new Error(`unexpected major type ${major}`);
    const info = (buf[i] ?? 0) & 0x1f;
    let len: number;
    let hdrLen: number;
    if (info < 24) {
      len = info;
      hdrLen = 1;
    } else if (info === 24) {
      len = buf[i + 1] ?? 0;
      hdrLen = 2;
    } else if (info === 25) {
      len = ((buf[i + 1] ?? 0) << 8) | (buf[i + 2] ?? 0);
      hdrLen = 3;
    } else {
      throw new Error(`unsupported length info ${info}`);
    }
    i += hdrLen;
    for (let k = 0; k < len; k++) out.push(buf[i + k] ?? 0);
    i += len;
  }
  return Buffer.from(out).toString("hex");
}

describe("cborBytestringHeader (RFC 8949 §3.1)", () => {
  it("encodes 1-byte short form for n < 24", () => {
    expect(cborBytestringHeader(0)).toBe("40");
    expect(cborBytestringHeader(1)).toBe("41");
    expect(cborBytestringHeader(13)).toBe("4d");
    expect(cborBytestringHeader(15)).toBe("4f");
    expect(cborBytestringHeader(23)).toBe("57");
  });

  it("encodes 2-byte form for 24 <= n < 2^8", () => {
    expect(cborBytestringHeader(24)).toBe("5818");
    expect(cborBytestringHeader(64)).toBe("5840");
    expect(cborBytestringHeader(255)).toBe("58ff");
  });

  it("encodes 3-byte form for 2^8 <= n < 2^16", () => {
    expect(cborBytestringHeader(256)).toBe("590100");
    expect(cborBytestringHeader(0xffff)).toBe("59ffff");
  });

  it("encodes 5-byte form for 2^16 <= n < 2^32", () => {
    expect(cborBytestringHeader(0x10000)).toBe("5a00010000");
    expect(cborBytestringHeader(0xffffffff)).toBe("5affffffff");
  });

  it("regression: n in [16, 23] uses the single-byte short form (was buggy before fix)", () => {
    // The previous implementation emitted `4${n.toString(16)}` which produced
    // invalid CBOR like `410`, `414`, `417` for n = 16, 20, 23 respectively.
    expect(cborBytestringHeader(16)).toBe("50");
    expect(cborBytestringHeader(17)).toBe("51");
    expect(cborBytestringHeader(18)).toBe("52");
    expect(cborBytestringHeader(19)).toBe("53");
    expect(cborBytestringHeader(20)).toBe("54");
    expect(cborBytestringHeader(21)).toBe("55");
    expect(cborBytestringHeader(22)).toBe("56");
    expect(cborBytestringHeader(23)).toBe("57");
  });
});

describe("encodeIndefiniteBytesHex", () => {
  it("wraps the payload with 5f...ff markers", () => {
    const cbor = encodeIndefiniteBytesHex("aabbcc");
    expect(cbor.startsWith("5f")).toBe(true);
    expect(cbor.endsWith("ff")).toBe(true);
  });

  it("emits a single short-form chunk for inputs <= 23 bytes", () => {
    expect(encodeIndefiniteBytesHex("")).toBe("5fff");
    expect(encodeIndefiniteBytesHex("aabbcc")).toBe("5f43aabbccff"); // 3 bytes -> 0x43
    expect(encodeIndefiniteBytesHex("aa".repeat(15))).toBe(`5f4f${"aa".repeat(15)}ff`);
  });

  it("emits a single long-form chunk for inputs in [24, 64] bytes", () => {
    const hex24 = "bb".repeat(24);
    expect(encodeIndefiniteBytesHex(hex24)).toBe(`5f5818${hex24}ff`);
    const hex64 = "cc".repeat(64);
    expect(encodeIndefiniteBytesHex(hex64)).toBe(`5f5840${hex64}ff`);
  });

  it("chunks inputs > 64 bytes into 64-byte segments", () => {
    const hex = "dd".repeat(65); // 64 + 1
    const cbor = encodeIndefiniteBytesHex(hex);
    expect(cbor).toBe(`5f5840${"dd".repeat(64)}41dd${"ff"}`);
  });

  it("round-trips arbitrary sizes including the previously-buggy range", () => {
    for (const size of [0, 1, 13, 15, 16, 20, 23, 24, 25, 63, 64, 65, 80, 84, 100, 412, 503, 525, 1024]) {
      const hex = "ab".repeat(size);
      const cbor = encodeIndefiniteBytesHex(hex);
      expect(decodeIndefiniteBytesHex(cbor)).toBe(hex);
    }
  });

  it("regression: 80- and 84-byte inputs produced invalid CBOR before the fix", () => {
    // Pre-fix, the last chunks of these sizes (16 and 20 bytes) were encoded as
    // "410..." and "414..." respectively — invalid CBOR. Now they decode cleanly.
    const hex80 = "ee".repeat(80);
    const cbor80 = encodeIndefiniteBytesHex(hex80);
    expect(cbor80).toBe(`5f5840${"ee".repeat(64)}50${"ee".repeat(16)}ff`);
    expect(decodeIndefiniteBytesHex(cbor80)).toBe(hex80);

    const hex84 = "ee".repeat(84);
    const cbor84 = encodeIndefiniteBytesHex(hex84);
    expect(cbor84).toBe(`5f5840${"ee".repeat(64)}54${"ee".repeat(20)}ff`);
    expect(decodeIndefiniteBytesHex(cbor84)).toBe(hex84);
  });
});

describe("buildBurnRedeemer", () => {
  // BurnUSDCX is constructor index 1 of USDCXMintAction per the on-chain types
  // (usdcx-contracts/.../MintingLogic/Types.hs:256). Plutus encodes Constr 1 with
  // tag 0xd87a; the body is an indefinite-length list (9f...ff) holding a single
  // PByteString field (PAsData PByteString from the on-chain definition).
  const BURN_USDCX_CONSTR_INDEX = 1;

  it("produces a Constr 1 with a single bytes field equal to the original intent", () => {
    const intent = "070afbc20000".padEnd(80, "ab"); // arbitrary 40-byte payload
    const pd = buildBurnRedeemer(intent);
    const { constructor, fields } = PlutusConstr.unwrap(pd, { [BURN_USDCX_CONSTR_INDEX]: 1 });
    expect(constructor).toBe(BURN_USDCX_CONSTR_INDEX);
    expect(fields).toHaveLength(1);
    const bytesField = (fields[0] as { bytes: string }).bytes;
    expect(bytesField.toLowerCase()).toBe(intent.toLowerCase());
  });

  it("strips a leading 0x prefix from the input", () => {
    const intent = "070afbc2deadbeef";
    const withPrefix = buildBurnRedeemer(`0x${intent}`);
    const withoutPrefix = buildBurnRedeemer(intent);
    const a = (PlutusConstr.unwrap(withPrefix, { [BURN_USDCX_CONSTR_INDEX]: 1 }).fields[0] as { bytes: string }).bytes;
    const b = (PlutusConstr.unwrap(withoutPrefix, { [BURN_USDCX_CONSTR_INDEX]: 1 }).fields[0] as { bytes: string })
      .bytes;
    expect(a).toBe(b);
    expect(a.toLowerCase()).toBe(intent.toLowerCase());
  });

  it("round-trips intents of realistic Circle burn sizes (incl. the bug-zone tail sizes)", () => {
    // 524 = a real Circle preprod burn intent length; the others exercise the
    // 16/20-byte tail chunks that were broken before the cborBytestringHeader fix.
    for (const size of [80, 84, 412, 503, 524, 525, 600]) {
      const intent = "ab".repeat(size);
      const pd = buildBurnRedeemer(intent);
      const { fields } = PlutusConstr.unwrap(pd, { [BURN_USDCX_CONSTR_INDEX]: 1 });
      const bytesField = (fields[0] as { bytes: string }).bytes;
      expect(bytesField.toLowerCase()).toBe(intent.toLowerCase());
    }
  });
});
