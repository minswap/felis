import { cardanoAddressToRemoteRecipient, formatHookData } from "./address-utils.js";

export namespace EthDeposit {
  export const CARDANO_DOMAIN = 10004;

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
