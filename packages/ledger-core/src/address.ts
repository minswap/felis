import type * as Ogmios from "@cardano-ogmios/schema";
import invariant from "@minswap/tiny-invariant";
import {
  type CborHex,
  type CSLAddress,
  type CSLPlutusData,
  type CSLRewardAddress,
  Maybe,
  RustModule,
  safeFreeRustObjects,
} from "@repo/ledger-utils";
import { Bytes } from "./bytes";
import {
  AddressType,
  CardanoAddress,
  type CardanoBaseAddress,
  type CardanoEnterpriseAddress,
  type CardanoPointerAddress,
  type CardanoRewardAddress,
  Credential,
  CredentialType,
} from "./cardano-address";
import { PublicKeyHash } from "./crypto";
import { type NetworkEnvironment, type NetworkID, networkEnvironmentToNetworkID } from "./network-id";
import { PlutusConstr, type PlutusData, PlutusInt, PlutusMaybe, PlutusMaybeFixedLengthArray } from "./plutus-json";

export class Address {
  public readonly bech32: string;
  public readonly cardanoAddress: CardanoAddress;

  protected constructor(bech32: string) {
    this.bech32 = bech32;
    this.cardanoAddress = CardanoAddress.decodeCardanoAddress(bech32);
  }

  static fromBech32(s: string): Address {
    let address: Address | null = null;
    try {
      address = new Address(s);
    } catch (err) {
      throw new Error(`address is not valid bech32 or base58: ${s}: ${err}`);
    }
    return address;
  }

  static fromCardanoAddress(addr: CardanoAddress): Address {
    let address: Address | null = null;
    try {
      const bech32Result = CardanoAddress.toBech32(addr);
      if (bech32Result.type === "ok") {
        address = new Address(bech32Result.value);
      } else {
        throw bech32Result.error;
      }
    } catch (err) {
      throw new Error(`could not decode address from CardanoAddress: ${err}`);
    }
    return address;
  }

  static fromHex(s: CborHex<CSLAddress>): Address {
    const rustAddr = RustModule.get.Address.from_bytes(Bytes.fromHex(s).bytes);
    const addr = new Address(rustAddr.to_bech32());
    safeFreeRustObjects(rustAddr);
    return addr;
  }

  /**
   * This function tries to get the Bech32 string
   * @param s address string, it could be in Bech32 (addr...) or CborHex format
   * @returns a Bech32 string
   */
  static ensureBech32(s: string): string {
    try {
      return Address.fromBech32(s).bech32;
    } catch {
      return Address.fromHex(s).bech32;
    }
  }

  toStakeAddress(): RewardAddress | null {
    switch (this.cardanoAddress.type) {
      case AddressType.BASE_ADDRESS: {
        const rewardAddress: CardanoRewardAddress = {
          type: AddressType.REWARD_ADDRESS,
          network: this.cardanoAddress.network,
          stake: this.cardanoAddress.stake,
        };
        return RewardAddress.fromAddress(Address.fromCardanoAddress(rewardAddress));
      }
      case AddressType.REWARD_ADDRESS: {
        return RewardAddress.fromBech32(this.bech32);
      }
    }
    return null;
  }

  toPaymentAddress(): Address | null {
    if (
      this.cardanoAddress.type === AddressType.REWARD_ADDRESS ||
      this.cardanoAddress.type === AddressType.LEGACY_ADDRESS
    ) {
      return null;
    }
    const paymentCred = this.cardanoAddress.payment;
    const enterpriseAddr: CardanoEnterpriseAddress = {
      type: AddressType.ENTERPRISE_ADDRESS,
      network: this.cardanoAddress.network,
      payment: paymentCred,
    };
    return Address.fromCardanoAddress(enterpriseAddr);
  }

  /**
   * If the address is a Reward Address (stake1...), then return the pub key hash of the stake part.
   * Otherwise, return the pub key hash of the payment part.
   */
  toPubKeyHash(): Maybe<PublicKeyHash> {
    let bytes: Maybe<Bytes> = null;
    switch (this.cardanoAddress.type) {
      case AddressType.BASE_ADDRESS:
      case AddressType.ENTERPRISE_ADDRESS:
      case AddressType.POINTER_ADDRESS: {
        bytes =
          this.cardanoAddress.payment.type === CredentialType.PUB_KEY_CREDENTIAL
            ? this.cardanoAddress.payment.payload
            : null;
        break;
      }
      case AddressType.REWARD_ADDRESS: {
        bytes =
          this.cardanoAddress.stake.type === CredentialType.PUB_KEY_CREDENTIAL
            ? this.cardanoAddress.stake.payload
            : null;
        break;
      }
    }
    return Maybe.isJust(bytes) ? new PublicKeyHash(bytes) : null;
  }

  /**
   * If the address is a Reward Address (stake1...), then return the script hash of the stake part.
   * Otherwise, return the script hash of the payment part.
   */
  toScriptHash(): Maybe<Bytes> {
    switch (this.cardanoAddress.type) {
      case AddressType.BASE_ADDRESS:
      case AddressType.ENTERPRISE_ADDRESS:
      case AddressType.POINTER_ADDRESS: {
        return this.cardanoAddress.payment.type === CredentialType.SCRIPT_CREDENTIAL
          ? this.cardanoAddress.payment.payload
          : null;
      }
      case AddressType.REWARD_ADDRESS: {
        return this.cardanoAddress.stake.type === CredentialType.SCRIPT_CREDENTIAL
          ? this.cardanoAddress.stake.payload
          : null;
      }
      case AddressType.LEGACY_ADDRESS: {
        return null;
      }
    }
  }

  /**
   * If the address is a Reward Address (stake1...), then return the credential of the stake part.
   * Otherwise, return the credential of the payment part.
   */
  toPaymentCredential(): Maybe<Credential> {
    switch (this.cardanoAddress.type) {
      case AddressType.BASE_ADDRESS:
      case AddressType.ENTERPRISE_ADDRESS:
      case AddressType.POINTER_ADDRESS: {
        return this.cardanoAddress.payment;
      }
      case AddressType.REWARD_ADDRESS: {
        return this.cardanoAddress.stake;
      }
      case AddressType.LEGACY_ADDRESS: {
        return null;
      }
    }
  }

  equals(other: Address): boolean {
    return this.bech32 === other.bech32;
  }

  static fromPlutusJson(data: PlutusData, networkEnvironment: NetworkEnvironment): Address {
    const networkId = networkEnvironmentToNetworkID(networkEnvironment);
    const { fields } = PlutusConstr.unwrap(data, { [0]: 2 });
    const paymentCred = Credential.fromPlutusJson(fields[0]);
    const stakeCredConstrMaybe = PlutusMaybe.unwrap(fields[1]);
    if (Maybe.isNothing(stakeCredConstrMaybe)) {
      const enterpriseAddr: CardanoEnterpriseAddress = {
        type: AddressType.ENTERPRISE_ADDRESS,
        network: networkId,
        payment: paymentCred,
      };
      return Address.fromCardanoAddress(enterpriseAddr);
    }

    const stakeCredConstr = PlutusConstr.unwrap(stakeCredConstrMaybe, {
      [0]: 1,
      [1]: 3,
    });
    switch (stakeCredConstr.constructor) {
      case 0: {
        const stakingHashCred = Credential.fromPlutusJson(stakeCredConstr.fields[0]);
        const baseAddr: CardanoBaseAddress = {
          type: AddressType.BASE_ADDRESS,
          network: networkId,
          payment: paymentCred,
          stake: stakingHashCred,
        };
        return Address.fromCardanoAddress(baseAddr);
      }
      case 1: {
        const pointerAddr: CardanoPointerAddress = {
          type: AddressType.POINTER_ADDRESS,
          network: networkId,
          payment: paymentCred,
          stake: {
            slot: PlutusInt.unwrapToNumber(stakeCredConstr.fields[0]),
            txIndex: PlutusInt.unwrapToNumber(stakeCredConstr.fields[1]),
            certIndex: PlutusInt.unwrapToNumber(stakeCredConstr.fields[2]),
          },
        };
        return Address.fromCardanoAddress(pointerAddr);
      }
      default: {
        throw new Error(`unexpected Stake Credential constr: ${stakeCredConstr.constructor}`);
      }
    }
  }

  toPlutusJson(): PlutusData {
    switch (this.cardanoAddress.type) {
      case AddressType.BASE_ADDRESS: {
        return {
          constructor: 0,
          fields: [
            Credential.toPlutusJson(this.cardanoAddress.payment),
            PlutusMaybe.just({
              constructor: 0,
              fields: [Credential.toPlutusJson(this.cardanoAddress.stake)],
            }),
          ],
        };
      }
      case AddressType.ENTERPRISE_ADDRESS: {
        return {
          constructor: 0,
          fields: [Credential.toPlutusJson(this.cardanoAddress.payment), PlutusMaybe.nothing()],
        };
      }
      case AddressType.POINTER_ADDRESS: {
        return {
          constructor: 0,
          fields: [
            Credential.toPlutusJson(this.cardanoAddress.payment),
            PlutusMaybe.just({
              constructor: 1,
              fields: [
                PlutusInt.wrap(this.cardanoAddress.stake.slot),
                PlutusInt.wrap(this.cardanoAddress.stake.txIndex),
                PlutusInt.wrap(this.cardanoAddress.stake.certIndex),
              ],
            }),
          ],
        };
      }
      default: {
        throw new Error(
          `Address.toPlutusJson: only supports base address, enterprise address and pointer address, got ${this.bech32}`,
        );
      }
    }
  }

  toPlutusJsonFixedLengthArray(): PlutusData {
    switch (this.cardanoAddress.type) {
      case AddressType.BASE_ADDRESS: {
        return {
          constructor: 0,
          fieldArray: [
            Credential.toPlutusJsonFixedLengthArray(this.cardanoAddress.payment),
            PlutusMaybeFixedLengthArray.just({
              constructor: 0,
              fieldArray: [Credential.toPlutusJsonFixedLengthArray(this.cardanoAddress.stake)],
            }),
          ],
        };
      }
      case AddressType.ENTERPRISE_ADDRESS: {
        return {
          constructor: 0,
          fieldArray: [
            Credential.toPlutusJsonFixedLengthArray(this.cardanoAddress.payment),
            PlutusMaybeFixedLengthArray.nothing(),
          ],
        };
      }
      case AddressType.POINTER_ADDRESS: {
        return {
          constructor: 0,
          fields: [
            Credential.toPlutusJsonFixedLengthArray(this.cardanoAddress.payment),
            PlutusMaybeFixedLengthArray.just({
              constructor: 1,
              fieldArray: [
                PlutusInt.wrap(this.cardanoAddress.stake.slot),
                PlutusInt.wrap(this.cardanoAddress.stake.txIndex),
                PlutusInt.wrap(this.cardanoAddress.stake.certIndex),
              ],
            }),
          ],
        };
      }
      default: {
        throw new Error(
          `Address.toPlutusJson: only supports base address, enterprise address and pointer address, got ${this.bech32}`,
        );
      }
    }
  }

  static fromPlutusDataHex(data: CborHex<CSLPlutusData>, networkEnvironment: NetworkEnvironment): Address {
    const CSL = RustModule.get;
    const plutusData = CSL.PlutusData.from_hex(data);
    const plutusJson = plutusData.to_json(CSL.PlutusDatumSchema.DetailedSchema);
    const address = Address.fromPlutusJson(JSON.parse(plutusJson), networkEnvironment);
    safeFreeRustObjects(plutusData);
    return address;
  }

  toPlutusDataHex(): CborHex<CSLPlutusData> {
    const CSL = RustModule.get;
    const toPlutusJson = this.toPlutusJson();
    const plutusData = CSL.PlutusData.from_json(JSON.stringify(toPlutusJson), CSL.PlutusDatumSchema.DetailedSchema);
    const ret = plutusData.to_hex();
    safeFreeRustObjects(plutusData);
    return ret;
  }

  toString(): string {
    return this.bech32;
  }

  toJSON(): string {
    return this.bech32;
  }

  toXJSON(): { $address: string } {
    return { $address: this.bech32 };
  }

  network(): NetworkID {
    return this.cardanoAddress.network;
  }

  clone(): Address {
    return Address.fromBech32(this.bech32);
  }

  static fromCSL(addr: CSLAddress): Address {
    return new Address(addr.to_bech32());
  }

  toCSL(): CSLAddress {
    const CSL = RustModule.get;
    return CSL.Address.from_bech32(this.bech32);
  }

  static fromOgmios(a: Ogmios.Address): Address {
    try {
      return Address.fromBech32(a);
    } catch (err1) {
      throw new Error(`fail to decode address class ${a}: ${err1}`);
    }
  }
}

export class RewardAddress extends Address {
  public override readonly cardanoAddress: CardanoRewardAddress;

  private constructor(bech32: string) {
    super(bech32);
    const cardanoAddr = CardanoAddress.decodeCardanoAddress(bech32);
    invariant(cardanoAddr.type === AddressType.REWARD_ADDRESS, `${bech32} is not reward address`);
    this.cardanoAddress = cardanoAddr;
  }

  isPubKey(): boolean {
    return this.cardanoAddress.stake.type === CredentialType.PUB_KEY_CREDENTIAL;
  }

  isScript(): boolean {
    return this.cardanoAddress.stake.type === CredentialType.SCRIPT_CREDENTIAL;
  }

  toCSLRewardAddress(): CSLRewardAddress {
    const CSL = RustModule.get;
    const cslAddress = this.toCSL();
    const cslRewardAddr = CSL.RewardAddress.from_address(cslAddress);
    invariant(cslRewardAddr, "cannot convert CSL Address to RewardAddress");
    safeFreeRustObjects(cslAddress);
    return cslRewardAddr;
  }

  static fromAddress(a: Address): RewardAddress {
    return new RewardAddress(a.bech32);
  }

  static override fromCardanoAddress(a: CardanoRewardAddress): RewardAddress {
    const bech32 = CardanoAddress.toBech32(a);
    if (bech32.type === "err") {
      throw bech32.error;
    }
    return new RewardAddress(bech32.value);
  }

  static override fromBech32(s: string): RewardAddress {
    return new RewardAddress(s);
  }

  static fromPubKeyHash(networkEnvironment: NetworkEnvironment, pubKeyHash: Bytes): RewardAddress {
    return RewardAddress.fromCardanoAddress({
      type: AddressType.REWARD_ADDRESS,
      network: networkEnvironmentToNetworkID(networkEnvironment),
      stake: {
        type: CredentialType.PUB_KEY_CREDENTIAL,
        payload: pubKeyHash,
      },
    });
  }

  static fromScriptHash(networkEnvironment: NetworkEnvironment, scriptHash: Bytes): RewardAddress {
    return RewardAddress.fromCardanoAddress({
      type: AddressType.REWARD_ADDRESS,
      network: networkEnvironmentToNetworkID(networkEnvironment),
      stake: {
        type: CredentialType.SCRIPT_CREDENTIAL,
        payload: scriptHash,
      },
    });
  }

  override toStakeAddress(): RewardAddress {
    return RewardAddress.fromBech32(this.bech32);
  }

  override toPaymentAddress(): null {
    return null;
  }

  // must compare according to ledger's rules
  compare(target: RewardAddress): number {
    if (this.cardanoAddress.network === target.cardanoAddress.network) {
      if (this.cardanoAddress.stake.type === target.cardanoAddress.stake.type) {
        return this.cardanoAddress.stake.payload.compare(target.cardanoAddress.stake.payload);
      } else {
        return this.cardanoAddress.stake.type - target.cardanoAddress.stake.type;
      }
    } else {
      return this.cardanoAddress.network - target.cardanoAddress.network;
    }
  }

  override clone(): RewardAddress {
    return RewardAddress.fromBech32(this.bech32);
  }
}
