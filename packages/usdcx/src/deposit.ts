import { NetworkEnvironment } from "@minswap/felis-ledger-core";
import invariant from "@minswap/tiny-invariant";
import { cardanoAddressToRemoteRecipient, formatHookData } from "./address-utils.js";

export namespace EthDeposit {
  export const CARDANO_DOMAIN = 10004;

  /** Ethereum-side contract addresses paired with each Cardano network. */
  export type EthNetworkConfig = {
    /** Human-readable chain name; matches viem/chains export. */
    chain: "sepolia" | "mainnet";
    /** Ethereum chain ID — useful for sanity checks against the RPC. */
    chainId: number;
    /** USDC ERC-20 contract. */
    usdcAddress: `0x${string}`;
    /** Circle xReserve contract (the one we call `depositToRemote` on). */
    xReserveAddress: `0x${string}`;
  };

  /**
   * Returns the Ethereum-side config that pairs with a Cardano `NetworkEnvironment`:
   * - `MAINNET` → Ethereum mainnet
   * - `TESTNET_PREPROD` / `TESTNET_PREVIEW` → Sepolia
   *
   * Source: usdcx-contracts/IntegrationGuide.md (Contract Addresses & Constants).
   */
  export function getConfig(networkEnv: NetworkEnvironment): EthNetworkConfig {
    switch (networkEnv) {
      case NetworkEnvironment.MAINNET:
        return {
          chain: "mainnet",
          chainId: 1,
          usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          xReserveAddress: "0x8888888199b2Df864bf678259607d6D5EBb4e3Ce",
        };
      case NetworkEnvironment.TESTNET_PREPROD:
      case NetworkEnvironment.TESTNET_PREVIEW:
        return {
          chain: "sepolia",
          chainId: 11155111,
          usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
          xReserveAddress: "0x008888878f94C0d87defdf0B07f46B93C1934442",
        };
      default:
        invariant(false, `EthDeposit config not defined for networkEnv=${networkEnv}`);
    }
  }

  export const ERC20_ABI = [
    {
      name: "approve",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    },
    {
      name: "allowance",
      type: "function",
      stateMutability: "view",
      inputs: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
      ],
      outputs: [{ name: "", type: "uint256" }],
    },
  ] as const;

  export const XRESERVE_ABI = [
    {
      name: "depositToRemote",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "value", type: "uint256" },
        { name: "remoteDomain", type: "uint32" },
        { name: "remoteRecipient", type: "bytes32" },
        { name: "localToken", type: "address" },
        { name: "maxFee", type: "uint256" },
        { name: "hookData", type: "bytes" },
      ],
      outputs: [],
    },
  ] as const;

  export type DepositArgs = {
    value: bigint;
    remoteDomain: 10004;
    remoteRecipient: `0x${string}`;
    localToken: `0x${string}`;
    maxFee: bigint;
    hookData: `0x${string}`;
  };

  export function buildDepositArgs(opts: {
    cardanoRecipient: string;
    amountUsdc: bigint;
    maxFeeUsdc: bigint;
    localToken: `0x${string}`;
    datumHashHex?: string;
  }): DepositArgs {
    const remoteRecipient = cardanoAddressToRemoteRecipient(opts.cardanoRecipient);
    const hookData = formatHookData(opts.cardanoRecipient, { datumHashHex: opts.datumHashHex });

    return {
      value: opts.amountUsdc,
      remoteDomain: CARDANO_DOMAIN,
      remoteRecipient,
      localToken: opts.localToken,
      maxFee: opts.maxFeeUsdc,
      hookData,
    };
  }
}
