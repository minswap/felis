import {
  AddressType,
  Bytes,
  type CardanoRewardAddress,
  CredentialType,
  type NetworkEnvironment,
  NetworkID,
  networkEnvironmentToNetworkID,
  RewardAddress,
} from "@repo/ledger-core";
import rawLpStakeAddressMainnet from "../data/mainnet/liquidity-pool-stake-addresses.json";
import rawLpStakeAddressTestnet from "../data/testnet/liquidity-pool-stake-addresses.json";

let minswapStakeAddrsTestnet: CardanoRewardAddress[] | undefined;
let minswapStakeAddrsMainnet: CardanoRewardAddress[] | undefined;
let lpStakeAddrsTestnet: string[] | undefined;
let lpStakeAddrsMainnet: string[] | undefined;

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

export function getMinswapStakeAddresses(networkEnvironment: NetworkEnvironment): CardanoRewardAddress[] {
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
