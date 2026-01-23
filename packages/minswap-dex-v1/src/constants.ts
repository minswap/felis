import rawLpStakeAddressMainnet from "./data/mainnet/liquidity-pool-stake-addresses.json";
import rawLpStakeAddressTestnet from "./data/testnet/liquidity-pool-stake-addresses.json";
import {
  Address,
  AddressType,
  Asset,
  Bytes,
  type CardanoBaseAddress,
  type CardanoEnterpriseAddress,
  type CardanoRewardAddress,
  CredentialType,
  NetworkID,
  RewardAddress,
} from "@repo/ledger-core";
import { NetworkEnvironment, networkEnvironmentToNetworkID } from "@repo/ledger-core";
import { factoryPolicyID, lpPolicyID, nftPolicyID } from "./scripts";

let orderEnterpriseAddrTestnet: CardanoEnterpriseAddress | undefined = undefined;
let orderEnterpriseAddrMainnet: CardanoEnterpriseAddress | undefined = undefined;
let poolEnterpriseAddrTestnet: CardanoEnterpriseAddress | undefined = undefined;
let poolEnterpriseAddrMainnet: CardanoEnterpriseAddress | undefined = undefined;
let defaultOrderAddrTestnet: Address | undefined = undefined;
let defaultOrderAddrMainnet: Address | undefined = undefined;
let minswapStakeAddrsTestnet: CardanoRewardAddress[] | undefined = undefined;
let minswapStakeAddrsMainnet: CardanoRewardAddress[] | undefined = undefined;
let poolAddrsTestnet: Address[] | undefined = undefined;
let poolAddrsMainnet: Address[] | undefined = undefined;
let poolAddrsSetTestnet: Set<string> | undefined = undefined;
let poolAddrsSetMainnet: Set<string> | undefined = undefined;
let lpStakeAddrsTestnet: string[] | undefined = undefined;
let lpStakeAddrsMainnet: string[] | undefined = undefined;

export function getOrderEnterpriseAddress(
  networkEnvironment: NetworkEnvironment,
): CardanoEnterpriseAddress {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (orderEnterpriseAddrTestnet) {
        return orderEnterpriseAddrTestnet;
      }
      orderEnterpriseAddrTestnet = {
        type: AddressType.ENTERPRISE_ADDRESS,
        network: networkId,
        payment: {
          type: CredentialType.SCRIPT_CREDENTIAL,
          payload: Bytes.fromHex("a65ca58a4e9c755fa830173d2a5caed458ac0c73f97db7faae2e7e3b"),
        },
      };
      return orderEnterpriseAddrTestnet;
    }
    case NetworkID.MAINNET: {
      if (orderEnterpriseAddrMainnet) {
        return orderEnterpriseAddrMainnet;
      }
      orderEnterpriseAddrMainnet = {
        type: AddressType.ENTERPRISE_ADDRESS,
        network: networkId,
        payment: {
          type: CredentialType.SCRIPT_CREDENTIAL,
          payload: Bytes.fromHex("a65ca58a4e9c755fa830173d2a5caed458ac0c73f97db7faae2e7e3b"),
        },
      };
      return orderEnterpriseAddrMainnet;
    }
  }
}

export function getPoolEnterpriseAddress(
  networkEnvironment: NetworkEnvironment,
): CardanoEnterpriseAddress {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (poolEnterpriseAddrTestnet) {
        return poolEnterpriseAddrTestnet;
      }
      poolEnterpriseAddrTestnet = {
        type: AddressType.ENTERPRISE_ADDRESS,
        network: networkId,
        payment: {
          type: CredentialType.SCRIPT_CREDENTIAL,
          payload: Bytes.fromHex("e1317b152faac13426e6a83e06ff88a4d62cce3c1634ab0a5ec13309"),
        },
      };
      return poolEnterpriseAddrTestnet;
    }
    case NetworkID.MAINNET: {
      if (poolEnterpriseAddrMainnet) {
        return poolEnterpriseAddrMainnet;
      }
      poolEnterpriseAddrMainnet = {
        type: AddressType.ENTERPRISE_ADDRESS,
        network: networkId,
        payment: {
          type: CredentialType.SCRIPT_CREDENTIAL,
          payload: Bytes.fromHex("e1317b152faac13426e6a83e06ff88a4d62cce3c1634ab0a5ec13309"),
        },
      };
      return poolEnterpriseAddrMainnet;
    }
  }
}

export function getDefaultOrderAddress(
  networkEnvironment: NetworkEnvironment,
): Address {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (defaultOrderAddrTestnet) {
        return defaultOrderAddrTestnet;
      }
      defaultOrderAddrTestnet = Address.fromCardanoAddress({
        type: AddressType.BASE_ADDRESS,
        network: networkId,
        payment: getOrderEnterpriseAddress(networkEnvironment).payment,
        stake: {
          type: CredentialType.PUB_KEY_CREDENTIAL,
          payload: Bytes.fromHex("83ec96719dc0591034b78e472d6f477446261fec4bc517fa4d047f02"),
        },
      });
      return defaultOrderAddrTestnet;
    }
    case NetworkID.MAINNET: {
      if (defaultOrderAddrMainnet) {
        return defaultOrderAddrMainnet;
      }
      defaultOrderAddrMainnet = Address.fromCardanoAddress({
        type: AddressType.BASE_ADDRESS,
        network: networkId,
        payment: getOrderEnterpriseAddress(networkEnvironment).payment,
        stake: {
          type: CredentialType.PUB_KEY_CREDENTIAL,
          payload: Bytes.fromHex("52563c5410bff6a0d43ccebb7c37e1f69f5eb260552521adff33b9c2"),
        },
      });
      return defaultOrderAddrMainnet;
    }
  }
}

export function buildOrderAddress(
  stakeAddress: RewardAddress,
  networkEnvironment: NetworkEnvironment,
): Address {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  return Address.fromCardanoAddress({
    type: AddressType.BASE_ADDRESS,
    network: networkId,
    payment: getOrderEnterpriseAddress(networkEnvironment).payment,
    stake: stakeAddress.cardanoAddress.stake,
  });
}

export function getDexV1OrderScriptHash(
  networkEnvironment: NetworkEnvironment,
): Bytes {
  return getOrderEnterpriseAddress(networkEnvironment).payment.payload;
}

export function getLPStakeAddresses(networkEnvironment: NetworkEnvironment): string[] {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (!lpStakeAddrsTestnet) {
        lpStakeAddrsTestnet = JSON.parse(JSON.stringify(rawLpStakeAddressTestnet)) as string[];
      }
      return lpStakeAddrsTestnet;
    }
    case NetworkID.MAINNET: {
      if (!lpStakeAddrsMainnet) {
        lpStakeAddrsMainnet = JSON.parse(JSON.stringify(rawLpStakeAddressMainnet)) as string[];
      }
      return lpStakeAddrsMainnet;
    }
  }
}

export function getMinswapStakeAddresses(
  networkEnvironment: NetworkEnvironment,
): CardanoRewardAddress[] {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  const stakeAddress: string[] = getLPStakeAddresses(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (!minswapStakeAddrsTestnet) {
        minswapStakeAddrsTestnet = [
          {
            type: AddressType.REWARD_ADDRESS,
            network: networkId,
            stake: {
              type: CredentialType.PUB_KEY_CREDENTIAL,
              payload: Bytes.fromHex("83ec96719dc0591034b78e472d6f477446261fec4bc517fa4d047f02"),
            },
          },
          {
            type: AddressType.REWARD_ADDRESS,
            network: networkId,
            stake: {
              type: CredentialType.PUB_KEY_CREDENTIAL,
              payload: Bytes.fromHex("7ff59d2b41764d024bfe2848cb811db91c9c593adc6804e2c6218394"),
            },
          },
          {
            type: AddressType.REWARD_ADDRESS,
            network: networkId,
            stake: {
              type: CredentialType.PUB_KEY_CREDENTIAL,
              payload: Bytes.fromHex("c09058a29fab3f12928df9c932e40b8f0767ed645d0096e116b68f9a"),
            },
          },
          {
            type: AddressType.REWARD_ADDRESS,
            network: networkId,
            stake: {
              type: CredentialType.PUB_KEY_CREDENTIAL,
              payload: Bytes.fromHex("453ae8c6ba7c861e606d10938a4c48b7b1546c48844e93b738fc4224"),
            },
          },
          // stake addr of W01, W17 and
          ...stakeAddress.map((addr) => RewardAddress.fromBech32(addr).cardanoAddress),
        ];
      }
      return minswapStakeAddrsTestnet;
    }
    case NetworkID.MAINNET: {
      if (!minswapStakeAddrsMainnet) {
        minswapStakeAddrsMainnet = [
          {
            type: AddressType.REWARD_ADDRESS,
            network: networkId,
            stake: {
              type: CredentialType.PUB_KEY_CREDENTIAL,
              payload: Bytes.fromHex("52563c5410bff6a0d43ccebb7c37e1f69f5eb260552521adff33b9c2"),
            },
          },
          {
            type: AddressType.REWARD_ADDRESS,
            network: networkId,
            stake: {
              type: CredentialType.PUB_KEY_CREDENTIAL,
              payload: Bytes.fromHex("284be4848a866b10a0a33053f9035dc713a76422f900cced99babf38"),
            },
          },
          {
            type: AddressType.REWARD_ADDRESS,
            network: networkId,
            stake: {
              type: CredentialType.PUB_KEY_CREDENTIAL,
              payload: Bytes.fromHex("d8c24e4777e47eca59a01a3ff90a9ffbea78bf5b85467aee1f9ab54b"),
            },
          },
          {
            type: AddressType.REWARD_ADDRESS,
            network: networkId,
            stake: {
              type: CredentialType.PUB_KEY_CREDENTIAL,
              payload: Bytes.fromHex("ea14c2df7bce47cae706cf6b1a2e1a658ec173a81e633502ca6aa0dd"),
            },
          },
          {
            type: AddressType.REWARD_ADDRESS,
            network: networkId,
            stake: {
              type: CredentialType.PUB_KEY_CREDENTIAL,
              payload: Bytes.fromHex("52242cd893595d987266b47d2b437340ac920a5d95cbf86758293fe0"),
            },
          },
          {
            type: AddressType.REWARD_ADDRESS,
            network: networkId,
            stake: {
              type: CredentialType.PUB_KEY_CREDENTIAL,
              payload: Bytes.fromHex("7306e3e5864f06a3078270a3939aa7e010008a53da7d7ca9f88bab0f"),
            },
          },
          ...stakeAddress.map((addr) => RewardAddress.fromBech32(addr).cardanoAddress),
        ];
      }
      return minswapStakeAddrsMainnet;
    }
  }
}

export function getPoolAddresses(networkEnvironment: NetworkEnvironment): Address[] {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (!poolAddrsTestnet) {
        poolAddrsTestnet = [];
        for (const stakeAddr of getMinswapStakeAddresses(networkEnvironment)) {
          const baseAddr: CardanoBaseAddress = {
            type: AddressType.BASE_ADDRESS,
            network: networkId,
            payment: getPoolEnterpriseAddress(networkEnvironment).payment,
            stake: stakeAddr.stake,
          };
          poolAddrsTestnet.push(Address.fromCardanoAddress(baseAddr));
        }
      }
      return poolAddrsTestnet;
    }
    case NetworkID.MAINNET: {
      if (!poolAddrsMainnet) {
        poolAddrsMainnet = [];
        for (const stakeAddr of getMinswapStakeAddresses(networkEnvironment)) {
          const baseAddr: CardanoBaseAddress = {
            type: AddressType.BASE_ADDRESS,
            network: networkId,
            payment: getPoolEnterpriseAddress(networkEnvironment).payment,
            stake: stakeAddr.stake,
          };
          poolAddrsMainnet.push(Address.fromCardanoAddress(baseAddr));
        }
      }
      return poolAddrsMainnet;
    }
  }
}

export function getPoolAddressesSet(
  networkEnvironment: NetworkEnvironment,
): Set<string> {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (!poolAddrsSetTestnet) {
        const poolAddresses = getPoolAddresses(networkEnvironment);
        poolAddrsSetTestnet = new Set<string>();
        for (const addr of poolAddresses) {
          poolAddrsSetTestnet.add(addr.bech32);
        }
      }
      return poolAddrsSetTestnet;
    }
    case NetworkID.MAINNET: {
      if (!poolAddrsSetMainnet) {
        const poolAddresses = getPoolAddresses(networkEnvironment);
        poolAddrsSetMainnet = new Set<string>();
        for (const addr of poolAddresses) {
          poolAddrsSetMainnet.add(addr.bech32);
        }
      }
      return poolAddrsSetMainnet;
    }
  }
}

export function getDexV1PoolScriptHash(networkEnvironment: NetworkEnvironment): Bytes {
  return getPoolEnterpriseAddress(networkEnvironment).payment.payload;
}

export function getDexV1ScriptHashList(
  networkEnvironment: NetworkEnvironment,
): Bytes[] {
  return [getDexV1OrderScriptHash(networkEnvironment), getDexV1PoolScriptHash(networkEnvironment)];
}

export function getDexV1ScriptHashSet(
  networkEnvironment: NetworkEnvironment,
): Set<string> {
  return new Set<string>(getDexV1ScriptHashList(networkEnvironment).map((sh) => sh.hex));
}

export const FACTORY_ASSET: Asset = new Asset(Bytes.fromHex(factoryPolicyID), Bytes.fromString("MINSWAP"));
export const POOL_NFT_CURRENCY_SYMBOL: Bytes = Bytes.fromHex(nftPolicyID);
export const LP_CURRENCY_SYMBOL: Bytes = Bytes.fromHex(lpPolicyID);
export const DEX_LICENSE_CURRENCY_SYMBOL: Bytes = Bytes.fromHex(
  "2f2e0404310c106e2a260e8eb5a7e43f00cff42c667489d30e179816",
);
export const CREATOR_ASSET: Asset = new Asset(DEX_LICENSE_CURRENCY_SYMBOL, Bytes.fromString("CREATOR"));
export const POOL_OWNER_ASSET: Asset = new Asset(DEX_LICENSE_CURRENCY_SYMBOL, Bytes.fromString("OWNER"));
export const OUTPUT_ADA = 2_000_000n;
// The amount of liquidity that will be locked in pool when creating pools
export const MINIMUM_LIQUIDITY = 10n;
// The minimum amount of liquidity that is safe to create pool to avoid indivisible loss and creating pool of tokens without decimals
export const SAFE_MINIMUM_LIQUIDITY = 100_000n;

export const DEX_V1_INIT_TIME: Record<NetworkEnvironment, Date> = {
  [NetworkEnvironment.MAINNET]: new Date("2022-03-24T11:04:42.0000Z"),
  [NetworkEnvironment.TESTNET_PREPROD]: new Date("2022-10-24T09:29:42.0000Z"),
  [NetworkEnvironment.TESTNET_PREVIEW]: new Date("2022-10-24T00:00:00.0000Z"),
};
