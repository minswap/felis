import { XJSON } from "@repo/ledger-core";
import type { LendingMarket } from "@repo/minswap-lending-market";
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
export const connectedWalletAtom = createAtomWithStorage<boolean>(
  LocalStorageKey.CONNECTED_WALLET,
  false,
  (value) => value === "true",
  (value) => String(value),
);
export const setConnectedWalletAtom = atom(null, (_get, set, update: boolean) => {
  set(connectedWalletAtom, update);
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
  STEP_BUY_MORE_LONG_ASSET = "buy_more_long_asset",
  OPENING_POSITION = "opening_position",
  STEP_4_SELL_LONG_ASSET = "sell_long_asset",
  STEP_5_REPAY_ASSET = "repay_asset",
  STEP_6_WITHDRAW_COLLATERAL = "withdraw_collateral",
  STEP_SELL_ALL_LONG_ASSET = "sell_all_long_asset",
  CLOSED_POSITION = "closed_position",
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
    iTotalBorrow: bigint; // ada
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
  hasCallback?: number;
  callbackExtra?: string;
};

export enum ShortPositionStatus {
  STEP_1_SUPPLY_TOKEN = "step_1_supply_token",
  STEP_2_BORROW_TOKEN = "step_2_borrow_token",
  STEP_3_SHORT_TOKEN = "step_3_short_token",
  OPENING_POSITION = "opening_position",
  STEP_4_BUY_BACK_TOKEN = "step_4_buy_back_token",
  STEP_5_REPAY_ASSET = "step_5_repay_asset",
  STEP_6_WITHDRAW_COLLATERAL = "step_6_withdraw_collateral",
  CLOSED_POSITION = "closed_position",
}

export type ShortPositionState = {
  positionId: string;
  status: ShortPositionStatus;
  nitroWalletAddress: string;
  shortAsset: Asset;
  createdAt: number;
  updatedAt: number;
  amount: {
    iTotalSupplyL: bigint;
    iBorrowAmountL: bigint;
    iLiquidationPrice: number;
    mSuppliedL: bigint;
    mShortedL: bigint;
    mShortedEstimateAda: bigint;
    mBorrowedL: bigint;
    mTradingPrice: number;
    mClosedPrice: number;
    mClosedAda: bigint; // ada required to buy back Short Token
    mRepaidL: bigint; // same with borrow token
    mWithdrawnL: bigint; // same with supply token
  };
  transactions: {
    step: ShortPositionStatus;
    txHash: string;
  }[];
  hasCallback?: number;
  callbackExtra?: string;
  liquidationCall?: boolean;
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

// Base atom that stores all short positions from all wallets
const allShortPositionsAtom = createAtomWithStorage<ShortPositionState[]>(
  LocalStorageKey.SHORT_POSITIONS,
  [],
  (value) => XJSON.parse(value) as ShortPositionState[],
  (value) => XJSON.stringify(value),
);

// Derived atom that filters short positions for the current nitro wallet
export const shortPositionAtom = atom((get) => {
  const nitroWallet = get(nitroWalletAtom);
  const allPositions = get(allShortPositionsAtom) || [];

  // If no nitro wallet connected, return empty array
  if (!nitroWallet?.walletInfo?.address?.bech32) {
    return [];
  }

  // Filter positions for current nitro wallet address
  return allPositions.filter((position) => position.nitroWalletAddress === nitroWallet.walletInfo.address.bech32);
});

// Write atom to add/update short positions
export const setShortPositionAtom = atom(
  null,
  (get, set, update: ShortPositionState[] | ((prev: ShortPositionState[]) => ShortPositionState[])) => {
    const nitroWallet = get(nitroWalletAtom);

    // If no nitro wallet connected, don't update anything
    if (!nitroWallet?.walletInfo?.address?.bech32) {
      return;
    }

    const allPositions = get(allShortPositionsAtom) || [];
    const currentWalletAddress = nitroWallet.walletInfo.address.bech32;

    // Get new positions (either array or function result)
    const newPositions =
      typeof update === "function"
        ? update(allPositions.filter((p) => p.nitroWalletAddress === currentWalletAddress))
        : update;

    // Remove old positions for current wallet and add new ones
    const otherWalletsPositions = allPositions.filter((p) => p.nitroWalletAddress !== currentWalletAddress);
    const updatedAllPositions = [...otherWalletsPositions, ...newPositions];

    set(allShortPositionsAtom, updatedAllPositions);
  },
);

// Balance atoms
export const rootBalanceAtom = atom<bigint>(0n);
export const setRootBalanceAtom = atom(null, (_get, set, update: bigint) => {
  set(rootBalanceAtom, update);
});

export const nitroBalanceAtom = atom<bigint>(0n);
export const setNitroBalanceAtom = atom(null, (_get, set, update: bigint) => {
  set(nitroBalanceAtom, update);
});

export const minAdaPriceAtom = atom<LendingMarket.PriceInAdaResponse | null>(null);
export const setMinAdaPriceAtom = atom(null, (_get, set, update: LendingMarket.PriceInAdaResponse | null) => {
  set(minAdaPriceAtom, update);
});
