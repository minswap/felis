import { describe, it, expect, beforeAll } from "vitest";
import { RustModule } from "@minswap/felis-ledger-utils";
import { baseAddressWalletFromSeed } from "@minswap/felis-cip";
import { NetworkEnvironment, PrivateKey } from "@minswap/felis-ledger-core";
import * as CMS from "@emurgo/cardano-message-signing-nodejs";
import { verifySignData } from "../src/utils/signature";

function getSignMessage(address: string): string {
  return Buffer.from(address).toString("hex");
}

/**
 * Sign data using CIP-8/CIP-30 pattern
 * Returns { signature, key } where:
 * - signature: CBOR hex of COSESign1
 * - key: CBOR hex of COSEKey
 */
function signData(
  privateKey: PrivateKey,
  address: string,
  payload: string,
): { signature: string; key: string } {
  const cslPrivateKey = privateKey.toECSL();
  const cslPublicKey = cslPrivateKey.to_public();

  // Build protected header with address
  const protectedHeaders = CMS.HeaderMap.new();
  protectedHeaders.set_algorithm_id(CMS.Label.from_algorithm_id(CMS.AlgorithmId.EdDSA));
  protectedHeaders.set_header(
    CMS.Label.new_text("address"),
    CMS.CBORValue.new_bytes(Buffer.from(address, "hex")),
  );

  const protectedSerialized = CMS.ProtectedHeaderMap.new(protectedHeaders);
  const unprotectedHeaders = CMS.HeaderMap.new();
  const headers = CMS.Headers.new(protectedSerialized, unprotectedHeaders);

  // Build COSESign1
  const builder = CMS.COSESign1Builder.new(headers, Buffer.from(payload, "hex"), false);
  const toSign = builder.make_data_to_sign().to_bytes();

  // Sign with Ed25519
  const signedSigStructure = cslPrivateKey.sign(toSign).to_bytes();
  const coseSign1 = builder.build(signedSigStructure);

  // Build COSEKey with public key at label -2
  const coseKey = CMS.COSEKey.new(CMS.Label.from_key_type(CMS.KeyType.OKP));
  coseKey.set_algorithm_id(CMS.Label.from_algorithm_id(CMS.AlgorithmId.EdDSA));
  coseKey.set_header(
    CMS.Label.new_int(CMS.Int.new_negative(CMS.BigNum.from_str("1"))), // crv = -1
    CMS.CBORValue.new_int(CMS.Int.new_i32(6)), // Ed25519 = 6
  );
  coseKey.set_header(
    CMS.Label.new_int(CMS.Int.new_negative(CMS.BigNum.from_str("2"))), // x = -2 (public key)
    CMS.CBORValue.new_bytes(cslPublicKey.as_bytes()),
  );

  return {
    signature: Buffer.from(coseSign1.to_bytes()).toString("hex"),
    key: Buffer.from(coseKey.to_bytes()).toString("hex"),
  };
}

describe("verifySignData", () => {
  beforeAll(async () => {
    await RustModule.load();
  });

  it("should verify a valid signature", () => {
    const seed =
      "melt enemy surface feed kiss helmet suffer demise toilet insane human refuse park insect lawsuit custom inch spirit throw radio alarm creek chat symptom";
    const wallet = baseAddressWalletFromSeed(seed, NetworkEnvironment.TESTNET_PREVIEW);

    const data = {
        "market": "ADA-MIN",
        "side": "LONG",
        "amount": 500000000
    };
    const message = Buffer.from(JSON.stringify(data)).toString("hex");

    // Sign the message
    const { signature, key } = signData(wallet.paymentKey, wallet.address.bech32, message);
    console.log({
      user_address: wallet.address.bech32,
      signature,
      key,
    })
    // Verify
    const isValid = verifySignData({
      message,
      address: wallet.address.bech32,
      key,
      signature,
    });

    expect(isValid).toBe(true);
  });

  it("should reject invalid signature", () => {
    const seed =
      "melt enemy surface feed kiss helmet suffer demise toilet insane human refuse park insect lawsuit custom inch spirit throw radio alarm creek chat symptom";
    const wallet = baseAddressWalletFromSeed(seed, NetworkEnvironment.TESTNET_PREVIEW);

    const message = getSignMessage(wallet.address.bech32);
    const { signature, key } = signData(wallet.paymentKey, wallet.address.bech32, message);

    // Tamper with signature
    const tamperedSignature = signature.slice(0, -4) + "0000";

    const isValid = verifySignData({
      message,
      address: wallet.address.bech32,
      key,
      signature: tamperedSignature,
    });

    expect(isValid).toBe(false);
  });

  it("should reject wrong address", () => {
    const seed =
      "melt enemy surface feed kiss helmet suffer demise toilet insane human refuse park insect lawsuit custom inch spirit throw radio alarm creek chat symptom";
    const wallet = baseAddressWalletFromSeed(seed, NetworkEnvironment.TESTNET_PREVIEW);

    // Use a different seed to get different address
    const otherSeed =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";
    const otherWallet = baseAddressWalletFromSeed(otherSeed, NetworkEnvironment.TESTNET_PREVIEW);

    const message = getSignMessage(wallet.address.bech32);
    const { signature, key } = signData(wallet.paymentKey, wallet.address.bech32, message);

    // Verify with different address should fail
    const isValid = verifySignData({
      message,
      address: otherWallet.address.bech32,
      key,
      signature,
    });

    expect(isValid).toBe(false);
  });

  it("should reject wrong message", () => {
    const seed =
      "melt enemy surface feed kiss helmet suffer demise toilet insane human refuse park insect lawsuit custom inch spirit throw radio alarm creek chat symptom";
    const wallet = baseAddressWalletFromSeed(seed, NetworkEnvironment.TESTNET_PREVIEW);

    const message = getSignMessage(wallet.address.bech32);
    const { signature, key } = signData(wallet.paymentKey, wallet.address.bech32, message);

    // Verify with different message should fail
    const wrongMessage = Buffer.from("wrong message").toString("hex");
    const isValid = verifySignData({
      message: wrongMessage,
      address: wallet.address.bech32,
      key,
      signature,
    });

    expect(isValid).toBe(false);
  });

  it("should work with authen_token format (signature:key)", () => {
    const seed =
      "melt enemy surface feed kiss helmet suffer demise toilet insane human refuse park insect lawsuit custom inch spirit throw radio alarm creek chat symptom";
    const wallet = baseAddressWalletFromSeed(seed, NetworkEnvironment.TESTNET_PREVIEW);

    const message = getSignMessage(wallet.address.bech32);
    const { signature, key } = signData(wallet.paymentKey, wallet.address.bech32, message);

    // Create authen_token in the format used by the API
    const authenToken = `${signature}:${key}`;
    const [sig, k] = authenToken.split(":");

    const isValid = verifySignData({
      message,
      address: wallet.address.bech32,
      key: k,
      signature: sig,
    });

    expect(isValid).toBe(true);
  });

  it("wallet CIP-30 test", () => {
    const message = `Hello! How are you?`;
    const signedData = {
      key: "a401010327200621582050ac53f148ce5ce4d4278db4d6c4187265da319984920c2b9e5e4029b5b7b1bb",
      signature: "845846a2012767616464726573735839006f7f6cf2c50c559594c0bf8aecd22e7c6bc5df47c4ed7aa8ef87cb49ad7ffe3cda0cd3175a52bff1e5066a67785c47f3a786b434bdc998eea166686173686564f45348656c6c6f2120486f772061726520796f753f584093f6be1a792f5c1767d9e20ba767bf3787c8d6bb5e34d2b48130288e81f759270f9bf88acc5dd48feb7e8eadec98218ca33ff419cc3e2f65086ca99a4b8f510f",
    };
    const isValid = verifySignData({
      message: Buffer.from(message).toString("hex"),
      address: "addr_test1qphh7m8jc5x9t9v5czlc4mxj9e7xh3wlglzw674ga7rukjdd0llreksv6vt4554l78jsv6n80pwy0ua8s66rf0wfnrhq73a20h",
      key: signedData.key,
      signature: signedData.signature,
    });
    expect(isValid).toBe(true);
  });
});
