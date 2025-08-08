import * as crypto from "crypto";
import { blake2b } from "blakejs";
import { SHA3 } from "sha3";

export function sha3(hex: string): string {
  const hash = new SHA3(256);
  hash.update(hex, "hex");
  return hash.digest("hex");
}

export function blake2b256(buffer: Buffer): string {
  const hash = blake2b(Uint8Array.from(buffer), undefined, 32);
  return Buffer.from(hash).toString("hex");
}

export function blake2b224(buffer: Buffer): string {
  const hash = blake2b(Uint8Array.from(buffer), undefined, 28);
  return Buffer.from(hash).toString("hex");
}

export function md5(buffer: Buffer): string {
  return crypto.createHash("md5").update(Uint8Array.from(buffer)).digest("base64");
}
