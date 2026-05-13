import { describe, expect, it } from "vitest";
import {
  cardanoAddressToRemoteRecipient,
  formatFinalDestinationRecipient,
  formatHookData,
  parseCardanoAddress,
} from "../src/address-utils.js";

describe("address-utils", () => {
  it("parses a base address correctly", () => {
    const addr =
      "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp";
    const parsed = parseCardanoAddress(addr);
    expect(parsed.kind).toBe("base");
    expect(parsed.paymentCredType).toBe("Key");
    expect(parsed.stakeCredType).toBe("Key");
    expect(parsed.network).toBe("testnet");
    expect(parsed.paymentCredHex).toHaveLength(56); // 28 bytes = 56 hex chars
    expect(parsed.stakeCredHex).toHaveLength(56);
  });

  it("converts address to remoteRecipient format", () => {
    const addr =
      "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp";
    const remoteRecipient = cardanoAddressToRemoteRecipient(addr);
    expect(remoteRecipient).toMatch(/^0x000000[0-9a-f]{58}$/);
    expect(remoteRecipient).toContain("01"); // Key credential tag
  });

  it("formats hook data with 95 bytes", () => {
    const addr =
      "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp";
    const hookData = formatHookData(addr);
    // 0x + 190 hex chars (95 bytes)
    expect(hookData).toMatch(/^0x[0-9a-f]{190}$/);
  });

  it("formats hook data with datum hash", () => {
    const addr =
      "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp";
    const datumHash = "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";
    const hookData = formatHookData(addr, { datumHashHex: datumHash });
    expect(hookData).toContain("01"); // datumTag = 0x01
    expect(hookData.toLowerCase()).toContain(datumHash.toLowerCase());
  });

  it("formats ethereum address to 32 bytes", () => {
    const ethAddr = "0x1234567890abcdef1234567890abcdef12345678";
    const formatted = formatFinalDestinationRecipient(ethAddr);
    expect(formatted).toMatch(/^0x0{24}[0-9a-f]{40}$/);
    expect(formatted.toLowerCase()).toContain(ethAddr.toLowerCase().slice(2));
  });
});
