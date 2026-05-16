/**
 * Decode fields out of a Circle xReserve BurnIntent payload.
 *
 * Layout (per usdcx-contracts MintingLogic/IntentBlob.hs):
 *   BurnIntent:
 *     [0..4)   magic 0x070afbc2
 *     [4..36)  maxBlockHeight (uint256)
 *     [36..68) maxFee (uint256)
 *     [68..72) transferSpecLen (uint32)
 *     [72..)   encodedTransferSpec
 *
 *   TransferSpec (relative to its own start):
 *     [0..4)        magic 0xca85def7
 *     [4..8)        version
 *     [8..12)       sourceDomain
 *     [12..16)      destinationDomain
 *     [16..48)      sourceContract
 *     [48..80)      destinationContract
 *     [80..112)     sourceToken
 *     [112..144)    destinationToken
 *     [144..176)    sourceDepositor
 *     [176..208)    destinationRecipient
 *     [208..240)    sourceSigner
 *     [240..272)    destinationCaller
 *     [272..304)    value (uint256)   ← this is the burn amount the on-chain script enforces
 *     [304..336)    salt
 *     [336..340)    hookLength
 *     [340..)       hookData
 */

const BURN_INTENT_MAGIC = "070afbc2";
const TRANSFER_SPEC_MAGIC = "ca85def7";
const TRANSFER_SPEC_OFFSET = 72;
const VALUE_OFFSET_IN_TRANSFER_SPEC = 272;
const VALUE_LEN_BYTES = 32;

export type BurnIntentSummary = {
  maxBlockHeight: bigint;
  /** Fee withheld on Ethereum side. The Cardano-side burn must cover this too. */
  maxFee: bigint;
  /** TransferSpec `value` — the USDC the recipient receives on Ethereum (6-decimal). */
  value: bigint;
  /**
   * The exact amount of USDCx that MUST be burned, in 6-decimal base units.
   * On-chain check: `pcbiMaxFee + pctsValue == -usdcxMintAmount`.
   */
  burnAmount: bigint;
};

export namespace BurnIntent {
  /** Strip an optional `0x` prefix and assert the magic, returning the bare hex. */
  function normalize(hexIn: string): string {
    const hex = hexIn.startsWith("0x") ? hexIn.slice(2) : hexIn;
    if (hex.slice(0, 8).toLowerCase() !== BURN_INTENT_MAGIC) {
      throw new Error(`BurnIntent magic mismatch — got ${hex.slice(0, 8)}, expected ${BURN_INTENT_MAGIC}`);
    }
    return hex;
  }

  function readUint(hex: string, byteOffset: number, byteLen: number): bigint {
    const slice = hex.slice(byteOffset * 2, (byteOffset + byteLen) * 2);
    if (slice.length !== byteLen * 2) {
      throw new Error(`BurnIntent too short — wanted ${byteLen} bytes at offset ${byteOffset}`);
    }
    return BigInt(`0x${slice}`);
  }

  function decodeValue(hex: string): bigint {
    const transferSpecMagic = hex.slice(TRANSFER_SPEC_OFFSET * 2, (TRANSFER_SPEC_OFFSET + 4) * 2).toLowerCase();
    if (transferSpecMagic !== TRANSFER_SPEC_MAGIC) {
      throw new Error(`TransferSpec magic mismatch — got ${transferSpecMagic}, expected ${TRANSFER_SPEC_MAGIC}`);
    }
    return readUint(hex, TRANSFER_SPEC_OFFSET + VALUE_OFFSET_IN_TRANSFER_SPEC, VALUE_LEN_BYTES);
  }

  /**
   * Decode the exact amount of USDCx the on-chain MintingLogic requires us to burn.
   * Returns `maxFee + value`.
   */
  export function decodeBurnAmount(burnIntentHex: string): bigint {
    const hex = normalize(burnIntentHex);
    const maxFee = readUint(hex, 36, 32);
    const value = decodeValue(hex);
    return maxFee + value;
  }

  /** Decode the headline fields. */
  export function summarize(burnIntentHex: string): BurnIntentSummary {
    const hex = normalize(burnIntentHex);
    const maxFee = readUint(hex, 36, 32);
    const value = decodeValue(hex);
    return {
      maxBlockHeight: readUint(hex, 4, 32),
      maxFee,
      value,
      burnAmount: maxFee + value,
    };
  }
}
