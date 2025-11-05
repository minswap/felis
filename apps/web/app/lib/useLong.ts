import invariant from "@minswap/tiny-invariant";
import { type Address, type Asset, Utxo } from "@repo/ledger-core";
import { LendingMarket } from "@repo/minswap-lending-market";
import { useCallback, useState } from "react";
import { CONFIG } from "../config";
import type { useNitroWallet } from "./use-nitro-wallet";

export enum LongPositionStatus {
  STEP_0_PLACE_ORDER = "place_order",
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
    iTotalBuy: bigint;
    iTotalOperationFee: bigint;
    mTotalPaidFee: bigint;
    mBought: bigint;
    mLongBalance: bigint;
    mBorrowed: bigint;
    mSupplied: bigint;
    mRepaid: bigint;
    mWithdrawn: bigint;
  };
  txHash?: string;
  utxoHash?: string;
  error?: string;
};

export type UseNitroWalletReturn = ReturnType<typeof useNitroWallet>;

/**
 * Consolidated hook for managing long positions
 * No observer pattern - state managed directly in hook
 */
export const useLong = (nitroWallet?: UseNitroWalletReturn) => {
  const [positions, setPositions] = useState<LongPositionState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Generate unique position ID
   */
  const generatePositionId = useCallback((): string => {
    return `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  /**
   * Update or add a position
   */
  const updatePosition = useCallback((position: LongPositionState) => {
    setPositions((prev) => {
      const index = prev.findIndex((p) => p.positionId === position.positionId);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = position;
        return updated;
      }
      return [...prev, position];
    });
  }, []);

  /**
   * Get position by ID
   */
  const getPosition = useCallback(
    (positionId: string): LongPositionState | undefined => {
      return positions.find((p) => p.positionId === positionId);
    },
    [positions],
  );

  /**
   * Check if any position is processing
   */
  const isAnyProcessing = useCallback((): boolean => {
    return positions.some((p) => p.status !== LongPositionStatus.STEP_7_COMPLETED && !p.error);
  }, [positions]);

  /**
   * Get status text for a position
   */
  const getStatusText = useCallback((position: LongPositionState): string => {
    switch (position.status) {
      case LongPositionStatus.STEP_0_PLACE_ORDER:
        return "Placing order...";
      case LongPositionStatus.STEP_1_BUY_LONG_ASSET:
        return "Buying long asset...";
      case LongPositionStatus.OPENING_POSITION:
        return "Order submitted, waiting for execution...";
      case LongPositionStatus.STEP_2_SUPPLY_TOKEN:
        return "Supplying tokens...";
      case LongPositionStatus.STEP_3_BORROW_TOKEN:
        return "Borrowing tokens...";
      case LongPositionStatus.STEP_4_SELL_LONG_ASSET:
        return "Selling long asset...";
      case LongPositionStatus.STEP_5_REPAY_ASSET:
        return "Repaying asset...";
      case LongPositionStatus.STEP_6_WITHDRAW_COLLATERAL:
        return "Withdrawing collateral...";
      case LongPositionStatus.STEP_7_COMPLETED:
        return "Position opened successfully!";
      default:
        return position.error ? `Error: ${position.error}` : "Unknown state";
    }
  }, []);

  /**
   * Open a new long position
   */
  const openLongPosition = useCallback(
    async (params: {
      leverage: number;
      longAsset: Asset;
      borrowAsset: Asset;
      amountIn: bigint;
      priceInAdaResponse: LendingMarket.PriceInAdaResponse;
      submitTx: (txHex: string) => Promise<string>;
      boughtMinAmount: bigint;
      totalMinAmount: bigint;
      borrowedAdaAmount: bigint;
      fetchUtxos: (address: Address) => Promise<Utxo[]>;
    }) => {
      if (!nitroWallet) {
        throw new Error("Nitro wallet not available");
      }

      const positionId = generatePositionId();
      setLoading(true);
      setError(null);

      try {
        // Create initial position
        invariant(nitroWallet.walletData, "Nitro wallet data missing");
        const position: LongPositionState = {
          positionId,
          status: LongPositionStatus.STEP_0_PLACE_ORDER,
          nitroWalletAddress: nitroWallet.walletData.walletInfo.address.bech32,
          leverage: params.leverage,
          longAsset: params.longAsset,
          borrowAsset: params.borrowAsset,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          amount: {
            iTotalBuy: params.amountIn,
            iTotalOperationFee: 10_000_000n,
            mTotalPaidFee: 0n,
            mBought: 0n,
            mLongBalance: 0n,
            mBorrowed: params.borrowedAdaAmount,
            mSupplied: 0n,
            mRepaid: 0n,
            mWithdrawn: 0n,
          },
        };

        updatePosition(position);

        // Update to creating order
        position.status = LongPositionStatus.STEP_1_BUY_LONG_ASSET;
        position.updatedAt = Date.now();
        updatePosition(position);

        invariant(nitroWallet.walletData, "Nitro wallet data missing");
        // Execute step 1
        const txHash = await LendingMarket.OpeningLongPosition.step1CreateOrder({
          nitroWallet: {
            address: nitroWallet.walletData.walletInfo.address,
            privateKey: nitroWallet.walletData.privateKey,
            utxos: (await params.fetchUtxos(nitroWallet.walletData.walletInfo.address)).map(Utxo.toHex),
            submitTx: params.submitTx,
          },
          priceInAdaResponse: params.priceInAdaResponse,
          networkEnv: CONFIG.networkEnv,
          amountIn: params.amountIn,
        });

        // Update with tx hash
        position.status = LongPositionStatus.OPENING_POSITION;
        position.txHash = txHash;
        position.updatedAt = Date.now();
        position.amount.mBought = params.boughtMinAmount;
        updatePosition(position);

        console.log(`Order submitted for position ${positionId}, tx: ${txHash}`);

        // Start polling for completion
        const pollInterval = setInterval(async () => {
          try {
            invariant(nitroWallet.walletData, "Nitro wallet data missing");
            const utxos = await params.fetchUtxos(nitroWallet.walletData.walletInfo.address);
            const currentPos = getPosition(positionId);

            if (!currentPos) {
              clearInterval(pollInterval);
              return;
            }

            // Check if we have a UTXO with long asset
            const longAssetUtxo = utxos.find((utxo) => {
              try {
                return utxo.output.value.has(currentPos.longAsset);
              } catch {
                return false;
              }
            });

            if (longAssetUtxo) {
              // Step 1 completed
              clearInterval(pollInterval);
              currentPos.status = LongPositionStatus.STEP_2_SUPPLY_TOKEN;
              currentPos.updatedAt = Date.now();
              updatePosition(currentPos);

              console.log(`Position ${positionId} Step 1 completed`);

              // TODO: Implement step 2
              currentPos.status = LongPositionStatus.STEP_7_COMPLETED;
              currentPos.updatedAt = Date.now();
              updatePosition(currentPos);
            }
          } catch (err) {
            console.error(`Poll error for position ${positionId}:`, err);
          }
        }, 5000);

        return positionId;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);

        const position = getPosition(positionId);
        if (position) {
          position.error = `Failed: ${errorMsg}`;
          position.updatedAt = Date.now();
          updatePosition(position);
        }

        throw err;
      } finally {
        setLoading(false);
      }
    },
    [nitroWallet, generatePositionId, updatePosition, getPosition],
  );

  /**
   * Reset a position
   */
  const resetPosition = useCallback((positionId: string) => {
    setPositions((prev) => prev.filter((p) => p.positionId !== positionId));
  }, []);

  /**
   * Reset all positions
   */
  const resetAll = useCallback(() => {
    setPositions([]);
  }, []);

  return {
    positions,
    loading,
    error,
    openLongPosition,
    resetPosition,
    resetAll,
    getPosition,
    isAnyProcessing,
    getStatusText,
  };
};
