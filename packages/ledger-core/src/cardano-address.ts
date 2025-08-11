import invariant from "@minswap/tiny-invariant";
import {
  type CSLAddress,
  type CSLStakeCredential,
  decodeBech32,
  encodeBech32,
  Result,
  RustModule,
  safeFreeRustObjects,
} from "@repo/ledger-utils";
import * as Typhon from "@stricahq/typhonjs";
import { Bytes } from "./bytes";
import { NetworkID } from "./network-id";
import { PlutusConstr, type PlutusData } from "./plutus-json";

const B32_PREFIX = "addr";
const TESTNET_SUFFIX = "_test";
const STAKE_PREFIX = "stake";
const HASH_28_SIZE = 28;

export enum CredentialType {
  PUB_KEY_CREDENTIAL = 0,
  SCRIPT_CREDENTIAL = 1,
}

export type Credential = {
  type: CredentialType;
  payload: Bytes;
};

export namespace Credential {
  export function fromPlutusJson(d: PlutusData): Credential {
    const data = PlutusConstr.unwrap(d, {
      [0]: 1,
      [1]: 1,
    });
    return {
      type: data.constructor,
      payload: Bytes.fromPlutusJson(data.fields[0]),
    };
  }

  export function toPlutusJson(data: Credential): PlutusData {
    return {
      constructor: data.type,
      fields: [data.payload.toPlutusJson()],
    };
  }

  export function toPlutusJsonFixedLengthArray(data: Credential): PlutusData {
    return {
      constructor: data.type,
      fieldArray: [data.payload.toPlutusJson()],
    };
  }

  /**
   * @deprecated For testing only
   */
  export function fromHex(input: string): Credential {
    const CSL = RustModule.get;
    const c = CSL.StakeCredential.from_hex(input);
    let payload: Bytes | undefined;
    const credentialType = c.kind();
    switch (credentialType) {
      case CSL.StakeCredKind.Key: {
        const keyHash = c.to_keyhash();
        invariant(keyHash !== undefined, "StakeCredential is not key hash");
        payload = new Bytes(keyHash.to_bytes());
        safeFreeRustObjects(keyHash);
        break;
      }
      case CSL.StakeCredKind.Script: {
        const scriptHash = c.to_scripthash();
        invariant(scriptHash !== undefined, "StakeCredential is not script hash");
        payload = new Bytes(scriptHash.to_bytes());
        safeFreeRustObjects(scriptHash);
        break;
      }
    }
    safeFreeRustObjects(c);
    if (!payload) {
      throw new Error(`Unexpected StakeCredential kind ${credentialType}`);
    }
    return {
      type: credentialType,
      payload,
    };
  }

  export function toCSL(c: Credential): CSLStakeCredential {
    const CSL = RustModule.get;
    switch (c.type) {
      case CredentialType.PUB_KEY_CREDENTIAL: {
        const keyHash = CSL.Ed25519KeyHash.from_bytes(c.payload.bytes);
        const pubKeyCredential = CSL.StakeCredential.from_keyhash(keyHash);
        safeFreeRustObjects(keyHash);
        return pubKeyCredential;
      }
      case CredentialType.SCRIPT_CREDENTIAL: {
        const scriptHash = CSL.ScriptHash.from_bytes(c.payload.bytes);
        const scriptCredential = CSL.StakeCredential.from_scripthash(scriptHash);
        safeFreeRustObjects(scriptHash);
        return scriptCredential;
      }
    }
  }
}

export enum AddressType {
  BASE_ADDRESS = "BASE_ADDRESS",
  ENTERPRISE_ADDRESS = "ENTERPRISE_ADDRESS",
  POINTER_ADDRESS = "POINTER_ADDRESS",
  REWARD_ADDRESS = "REWARD_ADDRESS",
  LEGACY_ADDRESS = "LEGACY_ADDRESS",
}

export type StakePoint = {
  slot: number;
  txIndex: number;
  certIndex: number;
};

export type CardanoBaseAddress = {
  type: AddressType.BASE_ADDRESS;
  network: NetworkID;
  payment: Credential;
  stake: Credential;
};

export type CardanoEnterpriseAddress = {
  type: AddressType.ENTERPRISE_ADDRESS;
  network: NetworkID;
  payment: Credential;
};

export type CardanoPointerAddress = {
  type: AddressType.POINTER_ADDRESS;
  network: NetworkID;
  payment: Credential;
  stake: StakePoint;
};

export type CardanoRewardAddress = {
  type: AddressType.REWARD_ADDRESS;
  network: NetworkID;
  stake: Credential;
};

export type CardanoLegacyAddress = {
  type: AddressType.LEGACY_ADDRESS;
  network: NetworkID;
  base58: string;
};

export type CardanoEvolutionAddress =
  | CardanoBaseAddress
  | CardanoEnterpriseAddress
  | CardanoPointerAddress
  | CardanoRewardAddress;

export type CardanoAddress = CardanoEvolutionAddress | CardanoLegacyAddress;

export namespace CardanoAddress {
  export function variableNatDecode(bytes: Uint8Array): [number, number] | Error {
    let output = 0;
    let bytesRead = 0;

    for (const b of bytes) {
      output = (output << 7) | (b & 0x7f);
      bytesRead += 1;
      if ((b & 0x80) === 0) {
        return [output, bytesRead];
      }
    }

    return new Error("variableNatDecode failed");
  }

  export function variableNatEncode(_n: number): Uint8Array {
    const o: number[] = [_n & 0x7f];
    let x = Math.floor(_n / 128);
    while (x > 0) {
      o.push((x & 0x7f) | 0x80);
      x = Math.floor(x / 128);
    }
    for (let i = 0, j = o.length - 1; i < j; i++, j--) {
      [o[i], o[j]] = [o[j], o[i]];
    }
    return new Uint8Array(o);
  }

  export function getCardanoAddressPrefix(addr: CardanoEvolutionAddress): string {
    switch (addr.type) {
      case AddressType.BASE_ADDRESS: {
        return addr.network === NetworkID.TESTNET ? B32_PREFIX + TESTNET_SUFFIX : B32_PREFIX;
      }
      case AddressType.ENTERPRISE_ADDRESS: {
        return addr.network === NetworkID.TESTNET ? B32_PREFIX + TESTNET_SUFFIX : B32_PREFIX;
      }
      case AddressType.REWARD_ADDRESS: {
        return addr.network === NetworkID.TESTNET ? STAKE_PREFIX + TESTNET_SUFFIX : STAKE_PREFIX;
      }
      case AddressType.POINTER_ADDRESS: {
        return addr.network === NetworkID.TESTNET ? B32_PREFIX + TESTNET_SUFFIX : B32_PREFIX;
      }
    }
  }

  export function getCardanoAddressBytes(addr: CardanoEvolutionAddress): Bytes {
    switch (addr.type) {
      case AddressType.BASE_ADDRESS: {
        const buf = new Uint8Array(57);
        buf[0] = (addr.payment.type << 4) | (addr.stake.type << 5) | (addr.network & 0xf);
        buf.set(addr.payment.payload.bytes, 1);
        buf.set(addr.stake.payload.bytes, 29);
        return new Bytes(buf);
      }
      case AddressType.ENTERPRISE_ADDRESS: {
        const buf = new Uint8Array(29);
        buf[0] = 0b0110_0000 | ((addr.payment.type << 4) & 0xf0) | (addr.network & 0xf);
        buf.set(addr.payment.payload.bytes, 1);
        return new Bytes(buf);
      }
      case AddressType.REWARD_ADDRESS: {
        const buf = new Uint8Array(29);
        buf[0] = 0b1110_0000 | (addr.stake.type << 4) | (addr.network & 0xf);
        buf.set(addr.stake.payload.bytes, 1);
        return new Bytes(buf);
      }
      case AddressType.POINTER_ADDRESS: {
        const bytes = new Uint8Array([
          0b0100_0000 | (addr.payment.type << 4) | (addr.network & 0xf),
          ...addr.payment.payload.bytes,
          ...variableNatEncode(addr.stake.slot),
          ...variableNatEncode(addr.stake.txIndex),
          ...variableNatEncode(addr.stake.certIndex),
        ]);
        return new Bytes(bytes);
      }
    }
  }

  export function decodeCardanoAddress(raw: string): CardanoAddress {
    let rbytes: Uint8Array;

    if (raw.startsWith(B32_PREFIX) || raw.startsWith(STAKE_PREFIX)) {
      const result = decodeBech32(raw);
      rbytes = Uint8Array.from(result.data);
      return decodeRawCardanoAddress(rbytes);
    } else {
      return decodeRawLegacyAddress(raw);
    }
  }

  export function readAddressCredential(s: Uint8Array, header: number, bit: number, pos: number): Credential {
    const hashBytes = s.slice(pos, pos + HASH_28_SIZE);
    if ((header & (1 << bit)) === 0) {
      return {
        type: CredentialType.PUB_KEY_CREDENTIAL,
        payload: new Bytes(hashBytes),
      };
    }
    return {
      type: CredentialType.SCRIPT_CREDENTIAL,
      payload: new Bytes(hashBytes),
    };
  }

  export function decodeRawLegacyAddress(raw: string): CardanoLegacyAddress {
    const byronAddress = Typhon.utils.getAddressFromString(raw);
    /**
     * Reference: https://github.com/cardano-foundation/CIPs/tree/master/CIP-0003#master-key-generation
     * Mainnet Byron Addresses: Typically start with prefixes such as Ae2 or Ddz.
     * Testnet: remainning...
     */
    const network = raw.startsWith("Ae2") || raw.startsWith("Ddz") ? NetworkID.MAINNET : NetworkID.TESTNET;
    const legacyAddr: CardanoLegacyAddress = {
      type: AddressType.LEGACY_ADDRESS,
      network,
      base58: byronAddress.getBech32(),
    };
    return legacyAddr;
  }

  export function decodeRawCardanoAddress(s: Uint8Array): CardanoAddress {
    if (s.length === 0) {
      throw new Error("empty address");
    }

    const header = s[0];
    const networkId = header & 0x0f;
    let network: NetworkID | undefined;
    switch (networkId) {
      case 0: {
        network = NetworkID.TESTNET;
        break;
      }
      case 1: {
        network = NetworkID.MAINNET;
        break;
      }
    }

    switch ((header & 0xf0) >> 4) {
      // Base type
      case 0b0000:
      case 0b0001:
      case 0b0010:
      case 0b0011: {
        invariant(network !== undefined, "unexpected network");
        // header + keyhash
        if (s.length !== 57) {
          throw new Error("Invalid length for base address");
        }
        return {
          type: AddressType.BASE_ADDRESS,
          network: network,
          payment: readAddressCredential(s, header, 4, 1),
          stake: readAddressCredential(s, header, 5, HASH_28_SIZE + 1),
        };
      }
      // Pointer type
      case 0b0100:
      case 0b0101: {
        invariant(network !== undefined, "unexpected network");
        // header + keyhash + 3 natural numbers (min 1 byte each)
        if (s.length < 32) {
          throw new Error("Invalid length for pointer address");
        }
        let byteIndex = 1;
        byteIndex += HASH_28_SIZE;
        const paymentCred = readAddressCredential(s, header, 4, 1);
        const slotResult = variableNatDecode(s.slice(byteIndex));
        if (slotResult instanceof Error) {
          throw new Error("slot variable decode failed");
        }
        const [slot, slotBytes] = slotResult;
        byteIndex += slotBytes;

        const txIndexResult = variableNatDecode(s.slice(byteIndex));
        if (txIndexResult instanceof Error) {
          throw new Error("txIndex variable decode failed");
        }
        const [txIndex, txBytes] = txIndexResult;
        byteIndex += txBytes;

        const certIndexResult = variableNatDecode(s.slice(byteIndex));
        if (certIndexResult instanceof Error) {
          throw new Error("certIndex variable decode failed");
        }
        const [certIndex, certBytes] = certIndexResult;
        byteIndex += certBytes;

        if (byteIndex > s.length) {
          throw new Error("byte index is out of range of pointer length");
        }

        return {
          type: AddressType.POINTER_ADDRESS,
          network: network,
          payment: paymentCred,
          stake: {
            slot: slot,
            txIndex: txIndex,
            certIndex: certIndex,
          },
        };
      }
      // Enterprise type
      case 0b0110:
      case 0b0111: {
        invariant(network !== undefined, "unexpected network");
        // header + keyhash
        if (s.length !== 29) {
          throw new Error("Invalid length for enterprise address");
        }
        return {
          type: AddressType.ENTERPRISE_ADDRESS,
          network: network,
          payment: readAddressCredential(s, header, 4, 1),
        };
      }
      // Reward type
      case 0b1110:
      case 0b1111: {
        invariant(network !== undefined, "unexpected network");
        if (s.length !== 29) {
          throw new Error("Invalid length for reward address");
        }
        return {
          type: AddressType.REWARD_ADDRESS,
          network: network,
          stake: readAddressCredential(s, header, 4, 1),
        };
      }
      // Legacy byron type
      case 0b1000: {
        return decodeRawLegacyAddress(Buffer.from(s).toString("hex"));
      }
    }

    throw new Error("Unsupported address type");
  }

  export function toBech32(addr: CardanoAddress): Result<string, Error> {
    if (!validateCardanoAddress(addr)) {
      return Result.err(new Error("could not parse CardanoAddrress"));
    }
    switch (addr.type) {
      case AddressType.LEGACY_ADDRESS: {
        return Result.ok(addr.base58);
      }
      case AddressType.BASE_ADDRESS:
      case AddressType.ENTERPRISE_ADDRESS:
      case AddressType.POINTER_ADDRESS:
      case AddressType.REWARD_ADDRESS: {
        return Result.ok(encodeBech32(getCardanoAddressPrefix(addr), getCardanoAddressBytes(addr).bytes));
      }
    }
  }

  /**
   * @deprecated For testing only
   */
  export function toCSL(addr: CardanoAddress): CSLAddress {
    const CSL = RustModule.get;
    switch (addr.type) {
      case AddressType.BASE_ADDRESS: {
        return CSL.BaseAddress.new(
          addr.network,
          Credential.toCSL(addr.payment),
          Credential.toCSL(addr.stake),
        ).to_address();
      }
      case AddressType.ENTERPRISE_ADDRESS: {
        return CSL.EnterpriseAddress.new(addr.network, Credential.toCSL(addr.payment)).to_address();
      }
      case AddressType.POINTER_ADDRESS: {
        return CSL.PointerAddress.new(
          addr.network,
          Credential.toCSL(addr.payment),
          CSL.Pointer.new_pointer(
            CSL.BigNum.from_str(addr.stake.slot.toString()),
            CSL.BigNum.from_str(addr.stake.txIndex.toString()),
            CSL.BigNum.from_str(addr.stake.certIndex.toString()),
          ),
        ).to_address();
      }
      case AddressType.REWARD_ADDRESS: {
        return CSL.RewardAddress.new(addr.network, Credential.toCSL(addr.stake)).to_address();
      }
      case AddressType.LEGACY_ADDRESS: {
        return CSL.ByronAddress.from_base58(addr.base58).to_address();
      }
    }
  }

  /**
   * @deprecated For testing only
   */
  export function fromCSL(addr: CSLAddress): CardanoAddress {
    const CSL = RustModule.get;
    const baseAddr = CSL.BaseAddress.from_address(addr);
    if (baseAddr) {
      return {
        type: AddressType.BASE_ADDRESS,
        network: addr.network_id(),
        payment: Credential.fromHex(baseAddr.payment_cred().to_hex()),
        stake: Credential.fromHex(baseAddr.stake_cred().to_hex()),
      };
    }
    const enterpriseAddr = CSL.EnterpriseAddress.from_address(addr);
    if (enterpriseAddr) {
      return {
        type: AddressType.ENTERPRISE_ADDRESS,
        network: addr.network_id(),
        payment: Credential.fromHex(enterpriseAddr.payment_cred().to_hex()),
      };
    }
    const pointerAddr = CSL.PointerAddress.from_address(addr);
    if (pointerAddr) {
      return {
        type: AddressType.POINTER_ADDRESS,
        network: addr.network_id(),
        payment: Credential.fromHex(pointerAddr.payment_cred().to_hex()),
        stake: {
          slot: pointerAddr.stake_pointer().slot(),
          txIndex: pointerAddr.stake_pointer().tx_index(),
          certIndex: pointerAddr.stake_pointer().cert_index(),
        },
      };
    }
    const rewardAddr = CSL.RewardAddress.from_address(addr);
    if (rewardAddr) {
      return {
        type: AddressType.REWARD_ADDRESS,
        network: addr.network_id(),
        stake: Credential.fromHex(rewardAddr.payment_cred().to_hex()),
      };
    }
    throw new Error(`CardanoAddress.fromCSL: unexpected address type`);
  }

  export function validateCardanoAddress(address: CardanoAddress): boolean {
    switch (address.type) {
      case AddressType.BASE_ADDRESS: {
        return address.payment.payload.length === HASH_28_SIZE && address.stake.payload.length === HASH_28_SIZE;
      }
      case AddressType.ENTERPRISE_ADDRESS: {
        return address.payment.payload.length === HASH_28_SIZE;
      }
      case AddressType.POINTER_ADDRESS: {
        return address.payment.payload.length === HASH_28_SIZE;
      }
      case AddressType.REWARD_ADDRESS: {
        return address.stake.payload.length === HASH_28_SIZE;
      }
      case AddressType.LEGACY_ADDRESS: {
        // Deprecated type
        return true;
      }
    }
  }
}
