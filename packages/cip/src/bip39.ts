import invariant from "@minswap/tiny-invariant";
import {
  Address,
  AddressType,
  Bytes,
  type NetworkEnvironment,
  networkEnvironmentToNetworkID,
  PrivateKey,
  RewardAddress,
} from "@repo/ledger-core";
import { RustModule } from "@repo/ledger-utils";
import { mnemonicToEntropy } from "bip39";

const harden = (num: number): number => 0x80000000 + num;

export type BaseAddressWallet = {
  address: Address;
  rewardAddress: RewardAddress;
  paymentKey: PrivateKey;
  stakeKey: PrivateKey;
};

export type EnterpriseAddressWallet = {
  address: Address;
  paymentKey: PrivateKey;
};

type WalletFromSeedOptions = {
  password?: string;
  accountIndex?: number;
};

type WalletFromSeed = {
  address: Address;
  rewardAddress?: RewardAddress;
  paymentKey: PrivateKey;
  stakeKey?: PrivateKey;
};

export function baseAddressWalletFromSeed(
  seed: string,
  networkEnv: NetworkEnvironment,
  options?: WalletFromSeedOptions,
): BaseAddressWallet {
  const { address, rewardAddress, paymentKey, stakeKey } = walletFromSeed(
    seed,
    AddressType.BASE_ADDRESS,
    networkEnv,
    options,
  );
  invariant(rewardAddress, "base address must have reward address");
  invariant(stakeKey, "base address must have stake key");
  return {
    address,
    rewardAddress,
    paymentKey,
    stakeKey,
  };
}

export function enterpriseAddressWalletFromSeed(
  seed: string,
  networkEnv: NetworkEnvironment,
  options?: WalletFromSeedOptions,
): EnterpriseAddressWallet {
  const { address, paymentKey } = walletFromSeed(seed, AddressType.ENTERPRISE_ADDRESS, networkEnv, options);
  return {
    address,
    paymentKey,
  };
}

export function baseWalletFromEntropy(entropyHex: string, networkId: number): BaseAddressWallet {
  const entropy = Bytes.fromHex(entropyHex);
  invariant(entropy.bytes.length === 32, "Entropy must be 32 bytes");

  const CSL = RustModule.get;
  const rootKey = CSL.Bip32PrivateKey.from_bip39_entropy(entropy.bytes, new Uint8Array());

  const accountKey = rootKey
    .derive(harden(1852)) // purpose
    .derive(harden(1815)) // coin type
    .derive(harden(0));

  const paymentKey = accountKey.derive(0).derive(0).to_raw_key();
  const paymentKeyHash = paymentKey.to_public().hash();

  const stakeKey = accountKey.derive(2).derive(0).to_raw_key();
  const stakeKeyHash = stakeKey.to_public().hash();

  const address = CSL.BaseAddress.new(
    networkId,
    CSL.StakeCredential.from_keyhash(paymentKeyHash),
    CSL.StakeCredential.from_keyhash(stakeKeyHash),
  )
    .to_address()
    .to_bech32(undefined);
  const rewardAddress = CSL.RewardAddress.new(networkId, CSL.StakeCredential.from_keyhash(stakeKeyHash))
    .to_address()
    .to_bech32(undefined);

  return {
    address: Address.fromBech32(address),
    rewardAddress: RewardAddress.fromBech32(rewardAddress),
    paymentKey: PrivateKey.fromCSL(CSL.PrivateKey.from_bech32(paymentKey.to_bech32())),
    stakeKey: PrivateKey.fromCSL(CSL.PrivateKey.from_bech32(stakeKey.to_bech32())),
  };
}

function walletFromSeed(
  seed: string,
  addressType: AddressType.BASE_ADDRESS | AddressType.ENTERPRISE_ADDRESS,
  networkEnv: NetworkEnvironment,
  options?: WalletFromSeedOptions,
): WalletFromSeed {
  const CSL = RustModule.get;
  const accountIndex = options?.accountIndex ?? 0;

  const networkId = networkEnvironmentToNetworkID(networkEnv);
  const entropy = mnemonicToEntropy(seed);
  const rootKey = CSL.Bip32PrivateKey.from_bip39_entropy(
    Bytes.fromHex(entropy).bytes,
    options?.password ? new TextEncoder().encode(options.password) : new Uint8Array(),
  );

  const accountKey = rootKey
    .derive(harden(1852)) // purpose
    .derive(harden(1815)) // coin type
    .derive(harden(accountIndex));

  const paymentKey = accountKey.derive(0).derive(0).to_raw_key();
  const paymentKeyHash = paymentKey.to_public().hash();

  if (addressType === AddressType.BASE_ADDRESS) {
    const stakeKey = accountKey.derive(2).derive(0).to_raw_key();
    const stakeKeyHash = stakeKey.to_public().hash();

    const address = CSL.BaseAddress.new(
      networkId,
      CSL.StakeCredential.from_keyhash(paymentKeyHash),
      CSL.StakeCredential.from_keyhash(stakeKeyHash),
    )
      .to_address()
      .to_bech32(undefined);
    const rewardAddress = CSL.RewardAddress.new(networkId, CSL.StakeCredential.from_keyhash(stakeKeyHash))
      .to_address()
      .to_bech32(undefined);

    return {
      address: Address.fromBech32(address),
      rewardAddress: RewardAddress.fromBech32(rewardAddress),
      paymentKey: PrivateKey.fromCSL(CSL.PrivateKey.from_bech32(paymentKey.to_bech32())),
      stakeKey: PrivateKey.fromCSL(CSL.PrivateKey.from_bech32(stakeKey.to_bech32())),
    };
  } else {
    const address = CSL.EnterpriseAddress.new(networkId, CSL.StakeCredential.from_keyhash(paymentKeyHash))
      .to_address()
      .to_bech32(undefined);

    return {
      address: Address.fromBech32(address),
      paymentKey: PrivateKey.fromCSL(CSL.PrivateKey.from_bech32(paymentKey.to_bech32())),
    };
  }
}
