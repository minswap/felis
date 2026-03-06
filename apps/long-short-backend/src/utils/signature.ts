import * as CMS from "@emurgo/cardano-message-signing-nodejs";
import { Address, type PrivateKey } from "@minswap/felis-ledger-core";
import { RustModule } from "@minswap/felis-ledger-utils";

export type VerifySignDataOptions = {
  message: string; // The original message that was signed (hex encoded)
  address: string; // User's Cardano address (bech32)
  key: string; // CBOR hex of COSEKey
  signature: string; // CBOR hex of COSESign1
};

/**
 * Verify a CIP-8/CIP-30 message signature
 *
 * Based on:
 * - https://github.com/Emurgo/message-signing/blob/master/examples/rust/src/main.rs
 * - https://github.com/input-output-hk/nami/blob/main/MessageSigning.md
 *
 * @returns true if signature is valid
 */
export function verifySignData(options: VerifySignDataOptions): boolean {
  const { message, address, key, signature } = options;

  try {
    const CSL = RustModule.getE;

    // 1. Parse the COSESign1 message
    const coseSign1 = CMS.COSESign1.from_bytes(Buffer.from(signature, "hex"));

    // 2. Parse the COSEKey and extract public key using label -2 (COSE key identifier for EC2 x-coordinate)
    const coseKey = CMS.COSEKey.from_bytes(Buffer.from(key, "hex"));
    const pubKeyBytes = coseKey.header(CMS.Label.new_int(CMS.Int.new_negative(CMS.BigNum.from_str("2"))))?.as_bytes();

    if (!pubKeyBytes) {
      return false;
    }

    const publicKey = CSL.PublicKey.from_bytes(pubKeyBytes);

    // 3. Verify the payload matches the expected message
    const payload = coseSign1.payload();
    if (!payload) {
      return false;
    }

    // Compare payload with expected message
    const payloadHex = Buffer.from(payload).toString("hex");
    if (payloadHex !== message) {
      return false;
    }

    // 4. Verify the signature
    // Get the SigStructure bytes that were originally signed
    const signedData = coseSign1.signed_data(undefined, undefined).to_bytes();
    const sig = CSL.Ed25519Signature.from_bytes(coseSign1.signature());

    const isValidSignature = publicKey.verify(signedData, sig);
    if (!isValidSignature) {
      return false;
    }

    // 5. Verify the public key matches the address
    const keyHash = publicKey.hash();
    const addressObj = Address.fromBech32(address);
    const addressPubKeyHash = addressObj.toPubKeyHash();

    if (!addressPubKeyHash) {
      return false;
    }

    if (keyHash.to_hex() !== addressPubKeyHash.keyHash.hex) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function signData(privateKey: PrivateKey, address: string, payload: string): { signature: string; key: string } {
  const cslPrivateKey = privateKey.toECSL();
  const cslPublicKey = cslPrivateKey.to_public();

  // Build protected header with address
  const protectedHeaders = CMS.HeaderMap.new();
  protectedHeaders.set_algorithm_id(CMS.Label.from_algorithm_id(CMS.AlgorithmId.EdDSA));
  protectedHeaders.set_header(CMS.Label.new_text("address"), CMS.CBORValue.new_bytes(Buffer.from(address, "hex")));

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
