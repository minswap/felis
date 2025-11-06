import { XJSON } from "@repo/ledger-core";
import { atom } from "jotai";
import type { Asset } from "../../../../packages/ledger-core/dist/asset";
import { LocalStorageKey } from "../constants/storage";
import type { Cip30Api, WalletInfo } from "../lib/wallet-utils";
import { createAtomWithStorage } from "./utils";

export type WalletData = {
  walletInfo: WalletInfo;
  api: Cip30Api;
};
export const walletAtom = atom<WalletData | null>(null);
export const setWalletAtom = atom(null, (_get, set, update: WalletData | null) => {
  set(walletAtom, update);
});

export type NitroWalletData = {
  walletInfo: WalletInfo & { rootAddress: string };
  privateKey: string;
};
export const nitroWalletAtom = atom<NitroWalletData | null>(null);
export const setNitroWalletAtom = atom(null, (_get, set, update: NitroWalletData | null) => {
  set(nitroWalletAtom, update);
});

export enum LongPositionStatus {
  STEP_1_BUY_LONG_ASSET = "buy_long_asset",
  STEP_2_SUPPLY_TOKEN = "supply_token",
  STEP_3_BORROW_TOKEN = "borrow_token",
  OPENING_POSITION = "opening_position",
  STEP_4_SELL_LONG_ASSET = "sell_long_asset",
  STEP_5_REPAY_ASSET = "repay_asset",
  STEP_6_WITHDRAW_COLLATERAL = "withdraw_collateral",
  STEP_7_COMPLETED = "completed",
}
export type LongPositionState = {
  positionId: string;
  status: LongPositionStatus;
  nitroWalletAddress: string;
  leverage: number;
  longAsset: Asset;
  borrowAsset: Asset;
  createdAt: number;
  updatedAt: number;
  amount: {
    iTotalBuy: bigint; // ada
    iTotalOperationFee: bigint; // ada
    mTotalPaidFee: bigint; // ada
    mBought: bigint; // ada
    mTotalLong: bigint; // MIN
    mLongBalance: bigint; // MIN
    mBorrowed: bigint; // ada
    mSupplied: bigint; // qMIN
    mRepaid: bigint; // ada
    mWithdrawn: bigint; // MIN
  };
  transactions: {
    step: LongPositionStatus;
    txHash: string;
  }[];
};

// Base atom that stores all positions from all wallets
const allLongPositionsAtom = createAtomWithStorage<LongPositionState[]>(
  LocalStorageKey.LONG_POSITIONS,
  [],
  (value) => XJSON.parse(value) as LongPositionState[],
  (value) => XJSON.stringify(value),
);

// Derived atom that filters positions for the current nitro wallet
export const longPositionAtom = atom((get) => {
  const nitroWallet = get(nitroWalletAtom);
  const allPositions = get(allLongPositionsAtom) || [];

  // If no nitro wallet connected, return empty array
  if (!nitroWallet?.walletInfo?.address?.bech32) {
    return [];
  }

  // Filter positions for current nitro wallet address
  return allPositions.filter((position) => position.nitroWalletAddress === nitroWallet.walletInfo.address.bech32);
}); // Write atom to add/update positions

export const setLongPositionAtom = atom(
  null,
  (get, set, update: LongPositionState[] | ((prev: LongPositionState[]) => LongPositionState[])) => {
    const nitroWallet = get(nitroWalletAtom);

    // If no nitro wallet connected, don't update anything
    if (!nitroWallet?.walletInfo?.address?.bech32) {
      return;
    }

    const allPositions = get(allLongPositionsAtom) || [];
    const currentWalletAddress = nitroWallet.walletInfo.address.bech32;

    // Get new positions (either array or function result)
    const newPositions =
      typeof update === "function"
        ? update(allPositions.filter((p) => p.nitroWalletAddress === currentWalletAddress))
        : update;

    // Remove old positions for current wallet and add new ones
    const otherWalletsPositions = allPositions.filter((p) => p.nitroWalletAddress !== currentWalletAddress);
    const updatedAllPositions = [...otherWalletsPositions, ...newPositions];

    set(allLongPositionsAtom, updatedAllPositions);
  },
);
