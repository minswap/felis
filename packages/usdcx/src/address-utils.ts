// Minimal bech32 decoder (no encode, no bech32m). Sufficient for Cardano addresses.

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

const CHARSET_REV: Record<string, number> = {};
for (let i = 0; i < CHARSET.length; i++) {
  const char = CHARSET[i];
  if (char !== undefined) {
    CHARSET_REV[char] = i;
  }
}

const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      const gen = GEN[i];
      if (gen !== undefined && (top >>> i) & 1) chk ^= gen;
    }
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function verifyChecksum(hrp: string, data: number[]): boolean {
  return polymod(hrpExpand(hrp).concat(data)) === 1;
}

interface Bech32Decoded {
  prefix: string;
  words: number[];
}

function bech32Decode(str: string, limit = 90): Bech32Decoded {
  if (str.length > limit) throw new Error(`Exceeds length limit ${limit}`);
  const lower = str.toLowerCase();
  const upper = str.toUpperCase();
  if (str !== lower && str !== upper) throw new Error("Mixed-case string");
  str = lower;
  const sep = str.lastIndexOf("1");
  if (sep === -1) throw new Error("No separator character");
  if (sep === 0) throw new Error("Missing prefix");
  const prefix = str.slice(0, sep);
  const wordChars = str.slice(sep + 1);
  if (wordChars.length < 6) throw new Error("Data section too short");

  const words: number[] = [];
  for (const ch of wordChars) {
    const v = CHARSET_REV[ch];
    if (v === undefined) throw new Error(`Unknown character "${ch}"`);
    words.push(v);
  }
  if (!verifyChecksum(prefix, words)) throw new Error("Invalid checksum");
  return { prefix, words: words.slice(0, -6) };
}

function bech32FromWords(words: number[]): number[] {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << 8) - 1;
  for (const v of words) {
    if (v < 0 || v >>> 5 !== 0) throw new Error("Invalid value");
    acc = (acc << 5) | v;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & maxv);
    }
  }
  if (bits >= 5 || ((acc << (8 - bits)) & maxv) !== 0) {
    throw new Error("Invalid padding");
  }
  return out;
}

export type CredentialType = "Key" | "Script";

export interface ParsedCardanoAddress {
  paymentCredHex: string;
  paymentCredType: CredentialType;
  stakeCredHex: string | null;
  stakeCredType: CredentialType | null;
  network: "mainnet" | "testnet";
  kind: "base" | "enterprise" | "pointer" | "unsupported";
}

export function parseCardanoAddress(bech32Addr: string): ParsedCardanoAddress {
  const decoded = bech32Decode(bech32Addr, 200);
  const bytes = Buffer.from(bech32FromWords(decoded.words));
  if (bytes.length < 29) {
    throw new Error(`Address payload too short: ${bytes.length} bytes (need at least 29)`);
  }

  const header = bytes[0];
  if (header === undefined) {
    throw new Error("Address header is missing");
  }
  const addrType = (header & 0xf0) >> 4;
  const network = (header & 0x0f) === 0x01 ? "mainnet" : "testnet";

  let kind: ParsedCardanoAddress["kind"];
  let paymentCredType: CredentialType;
  let stakeCredType: CredentialType | null;

  switch (addrType) {
    case 0b0000:
      kind = "base";
      paymentCredType = "Key";
      stakeCredType = "Key";
      break;
    case 0b0001:
      kind = "base";
      paymentCredType = "Script";
      stakeCredType = "Key";
      break;
    case 0b0010:
      kind = "base";
      paymentCredType = "Key";
      stakeCredType = "Script";
      break;
    case 0b0011:
      kind = "base";
      paymentCredType = "Script";
      stakeCredType = "Script";
      break;
    case 0b0100:
      kind = "pointer";
      paymentCredType = "Key";
      stakeCredType = null;
      break;
    case 0b0101:
      kind = "pointer";
      paymentCredType = "Script";
      stakeCredType = null;
      break;
    case 0b0110:
      kind = "enterprise";
      paymentCredType = "Key";
      stakeCredType = null;
      break;
    case 0b0111:
      kind = "enterprise";
      paymentCredType = "Script";
      stakeCredType = null;
      break;
    default:
      kind = "unsupported";
      paymentCredType = "Key";
      stakeCredType = null;
  }

  if (kind === "unsupported") {
    throw new Error(`Unsupported Cardano address type: 0x${addrType.toString(16)}`);
  }

  const paymentCredHex = bytes.subarray(1, 29).toString("hex");
  const stakeCredHex = kind === "base" && bytes.length >= 57 ? bytes.subarray(29, 57).toString("hex") : null;

  return {
    paymentCredHex,
    paymentCredType,
    stakeCredHex,
    stakeCredType: stakeCredHex ? stakeCredType : null,
    network,
    kind,
  };
}

export function cardanoAddressToRemoteRecipient(bech32Addr: string): `0x${string}` {
  const parsed = parseCardanoAddress(bech32Addr);
  const tag = parsed.paymentCredType === "Key" ? "01" : "02";
  return `0x000000${tag}${parsed.paymentCredHex.toLowerCase()}` as `0x${string}`;
}

export interface HookDataOptions {
  datumHashHex?: string;
}

export function formatHookData(bech32Addr: string, opts: HookDataOptions = {}): `0x${string}` {
  const parsed = parseCardanoAddress(bech32Addr);

  const txHash = "00".repeat(32);
  const txIdx = "00";

  let datumTag = "00";
  let datum = "00".repeat(32);
  if (opts.datumHashHex) {
    const clean = opts.datumHashHex.startsWith("0x") ? opts.datumHashHex.slice(2) : opts.datumHashHex;
    if (clean.length !== 64) {
      throw new Error(`datumHashHex must be 32 bytes / 64 hex chars, got ${clean.length}`);
    }
    datumTag = "01";
    datum = clean.toLowerCase();
  }

  let stakeTag = "00";
  let stakeCred = "00".repeat(28);
  if (parsed.stakeCredHex && parsed.stakeCredType) {
    stakeTag = parsed.stakeCredType === "Key" ? "01" : "02";
    stakeCred = parsed.stakeCredHex.toLowerCase();
  }

  const hex = `${txHash}${txIdx}${datumTag}${datum}${stakeTag}${stakeCred}`;
  if (hex.length !== 190) {
    throw new Error(`Internal: hook data length mismatch ${hex.length / 2} bytes, expected 95`);
  }
  return `0x${hex}` as `0x${string}`;
}

export function formatFinalDestinationRecipient(ethAddress: string): `0x${string}` {
  const hex = ethAddress.toLowerCase().replace(/^0x/, "");
  if (hex.length !== 40) {
    throw new Error(`Ethereum address must be 20 bytes / 40 hex chars, got ${hex.length}`);
  }
  return `0x${"00".repeat(12)}${hex}` as `0x${string}`;
}
