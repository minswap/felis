import invariant from "@minswap/tiny-invariant";
import { PrivateKey, Utxo, Value } from "@repo/ledger-core";
import { Result } from "@repo/ledger-utils";
import { DEXOrderTransaction } from "@repo/minswap-build-tx";
import { DexV2Calculation, DexVersion, OrderV2Direction, OrderV2StepType } from "@repo/minswap-dex-v2";
import { type LiqwidProvider, NitroWallet } from "@repo/minswap-lending-market";
import { CoinSelectionAlgorithm, EmulatorProvider } from "@repo/tx-builder";
import { App } from "antd";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import { ADA, Asset } from "../../../../packages/ledger-core/dist/asset";
import { LendingMarket } from "../../../../packages/minswap-lending-market/dist/lending-market";
import {
  type LongPositionState,
  type LongPositionStatus,
  type NitroWalletData,
  nitroWalletAtom,
  type ShortPositionState,
  ShortPositionStatus,
  setLongPositionAtom,
  setShortPositionAtom,
  type WalletData,
  walletAtom,
} from "../atoms/walletAtom";
import { CONFIG } from "../config";
import { Helpers } from "./helpers";

const CALLBACK_SLEEP_DURATION_MS = 10000; // 10 seconds

export enum ExtraStatus {
  EXTRA_STEP_BUY_MORE = "extra_step_buy_more",
  EXTRA_STEP_SELL_ALL = "extra_step_sell_all",
  EXTRA_SHORT_STEP_1 = "extra_short_step_1",
  EXTRA_SHORT_STEP_2 = "extra_short_step_2",
  EXTRA_SHORT_STEP_3 = "extra_short_step_3",
  EXTRA_SHORT_STEP_4 = "extra_short_step_4",
  EXTRA_SHORT_STEP_5 = "extra_short_step_5",
  EXTRA_SHORT_STEP_6 = "extra_short_step_6",
}

type StepBuyMoreExtra = {
  extraStatus: ExtraStatus.EXTRA_STEP_BUY_MORE;
  buyMoreAmount: bigint;
  nextStatus: LongPositionStatus.OPENING_POSITION;
  logStatus: LongPositionStatus.STEP_BUY_MORE_LONG_ASSET;
};
type StepSellAllExtra = {
  extraStatus: ExtraStatus.EXTRA_STEP_SELL_ALL;
  nextStatus: LongPositionStatus.CLOSED_POSITION;
  logStatus: LongPositionStatus.STEP_SELL_ALL_LONG_ASSET;
};
type ShortStep1Extra = {
  extraStatus: ExtraStatus.EXTRA_SHORT_STEP_1;
  marketId: LendingMarket.MarketId;
  amount: bigint;
};
type ShortStep2Extra = {
  extraStatus: ExtraStatus.EXTRA_SHORT_STEP_2;
  borrowAmountL: number;
  collateralMode: LendingMarket.CollateralMarginType;
  borrowMarketId: LiqwidProvider.BorrowMarket;
};
type ShortStep3Extra = {
  extraStatus: ExtraStatus.EXTRA_SHORT_STEP_3;
  priceInAdaResponse: LendingMarket.PriceInAdaResponse;
  amountIn: bigint;
};
type ShortStep4Extra = {
  extraStatus: ExtraStatus.EXTRA_SHORT_STEP_4;
  priceInAdaResponse: LendingMarket.PriceInAdaResponse;
  expectedReceive: bigint;
};
type ShortStep5Extra = {
  extraStatus: ExtraStatus.EXTRA_SHORT_STEP_5;
};
type ShortStep6Extra = {
  extraStatus: ExtraStatus.EXTRA_SHORT_STEP_6;
  supplyMarketId: LendingMarket.MarketId;
  qToken: Asset;
};
type InnerHandleFn = (input: {
  position: LongPositionState | ShortPositionState;
  wallet: WalletData;
  nitroWallet: NitroWalletData;
  extra?:
    | StepBuyMoreExtra
    | StepSellAllExtra
    | ShortStep1Extra
    | ShortStep2Extra
    | ShortStep3Extra
    | ShortStep4Extra
    | ShortStep5Extra
    | ShortStep6Extra;
}) => Promise<LongPositionState | ShortPositionState>;

type HandlePositionInput = {
  position: LongPositionState | ShortPositionState;
  positionType: "long" | "short";
  errorMessage: string;
  successMessage: string;
  innerFn: InnerHandleFn;
};

export const innerHandleCallback = async ({
  position,
  nextStatus,
  extraBalance,
}: {
  position: LongPositionState | ShortPositionState;
  nextStatus: string;
  extraBalance?: { address: string; requiredValue: Value };
}): Promise<LongPositionState | ShortPositionState> => {
  invariant(position.hasCallback, "type-safe");
  await Helpers.sleep(CALLBACK_SLEEP_DURATION_MS);
  const txHash = position.transactions[position.transactions.length - 1]?.txHash;
  invariant(txHash, "type-safe");
  let ok = await Helpers.checkTxConfirmed(txHash);
  if (extraBalance && ok) {
    const balance = await NitroWallet.fetchBalance(extraBalance.address, CONFIG.networkEnv);
    for (const [asset, amount] of extraBalance.requiredValue.flatten()) {
      const assetAmount = balance.get(asset);
      ok = ok && assetAmount >= amount;
    }
  }
  console.log({ txConfirmed: ok, txHash });
  if (ok) {
    return {
      ...position,
      // biome-ignore lint/suspicious/noExplicitAny: lazy
      status: nextStatus as any,
      hasCallback: undefined,
      callbackExtra: undefined,
    };
  } else {
    // continue callback
    return { ...position, hasCallback: position.hasCallback + 1 };
  }
};

// supply ada, receive qAda
export const shortHandleStep1: InnerHandleFn = async (options) => {
  const position = options.position as ShortPositionState;
  const { nitroWallet, extra } = options;
  invariant(extra && extra.extraStatus === ExtraStatus.EXTRA_SHORT_STEP_1, "Invalid extra data for short step 1");
  if (position.hasCallback) {
    return innerHandleCallback({
      position,
      nextStatus: ShortPositionStatus.STEP_2_BORROW_TOKEN,
    });
  } else {
    const utxos = await Helpers.fetchRawUtxos(nitroWallet.walletInfo.address);
    const txHash = await LendingMarket.supplyTokens({
      nitroWallet: {
        address: nitroWallet.walletInfo.address,
        privateKey: nitroWallet.privateKey,
        utxos,
      },
      networkEnv: CONFIG.networkEnv,
      amount: extra.amount,
      marketId: extra.marketId,
    });
    console.log("shortHandleStep1 tx hash:", txHash);
    const newPosition: ShortPositionState = {
      ...position,
      updatedAt: Date.now(),
      amount: {
        ...position.amount,
        mSuppliedL: extra.amount,
      },
      transactions: [...position.transactions, { txHash, step: ShortPositionStatus.STEP_1_SUPPLY_TOKEN }],
      hasCallback: 1,
    };
    return newPosition;
  }
};

// borrow MIN, supply qADA
export const shortHandleStep2: InnerHandleFn = async (options) => {
  const position = options.position as ShortPositionState;
  const { nitroWallet, extra } = options;
  invariant(extra && extra.extraStatus === ExtraStatus.EXTRA_SHORT_STEP_2, "Invalid extra data for short step 2");
  if (position.hasCallback) {
    return innerHandleCallback({
      position,
      nextStatus: ShortPositionStatus.STEP_3_SHORT_TOKEN,
    });
  } else {
    const utxos = await NitroWallet.fetchUtxos(nitroWallet.walletInfo.address.bech32, CONFIG.networkEnv);
    const balance = Utxo.sumValue(utxos);
    const { collaterals, buildTxCollaterals } = await LendingMarket.getCollaterals({
      networkEnv: CONFIG.networkEnv,
      address: nitroWallet.walletInfo.address,
      balance,
      collateralMode: extra.collateralMode,
    });
    const { txHash } = await LendingMarket.borrowTokens({
      nitroWallet: {
        address: nitroWallet.walletInfo.address,
        privateKey: nitroWallet.privateKey,
        utxos: utxos.map(Utxo.toHex),
      },
      networkEnv: CONFIG.networkEnv,
      borrowAmountL: extra.borrowAmountL,
      borrowMarketId: extra.borrowMarketId,
      currentDebt: 0,
      collaterals,
      buildTxCollaterals,
    });
    console.log("shortHandleStep2 tx hash:", txHash);
    const newPosition: ShortPositionState = {
      ...position,
      updatedAt: Date.now(),
      amount: {
        ...position.amount,
        mBorrowedL: BigInt(extra.borrowAmountL),
      },
      transactions: [...position.transactions, { txHash, step: ShortPositionStatus.STEP_2_BORROW_TOKEN }],
      hasCallback: 1,
    };
    return newPosition;
  }
};

// short $MIN, receive Ada
export const shortHandleStep3: InnerHandleFn = async (options) => {
  const position = options.position as ShortPositionState;
  const { nitroWallet, extra } = options;
  invariant(extra && extra.extraStatus === ExtraStatus.EXTRA_SHORT_STEP_3, "Invalid extra data for short step 3");
  if (position.hasCallback) {
    invariant(position.callbackExtra, "type-safe");
    const callbackData = JSON.parse(position.callbackExtra) as {
      address: string;
      asset: string;
      requiredAmount: string;
    };
    const extraBalance: { address: string; requiredValue: Value } = {
      address: callbackData.address,
      requiredValue: new Value().add(Asset.fromString(callbackData.asset), BigInt(callbackData.requiredAmount)),
    };
    return innerHandleCallback({
      position,
      nextStatus: ShortPositionStatus.OPENING_POSITION,
      extraBalance,
    });
  } else {
    const utxos = await NitroWallet.fetchUtxos(nitroWallet.walletInfo.address.bech32, CONFIG.networkEnv);
    const { priceInAdaResponse, amountIn } = extra;
    const result = DexV2Calculation.calculateSwapExactIn({
      datumReserves: [BigInt(priceInAdaResponse.datumReserves[0]), BigInt(priceInAdaResponse.datumReserves[1])],
      valueReserves: [BigInt(priceInAdaResponse.valueReserves[0]), BigInt(priceInAdaResponse.valueReserves[1])],
      tradingFee: {
        feeANumerator: BigInt(priceInAdaResponse.tradingFee.feeANumerator),
        feeBNumerator: BigInt(priceInAdaResponse.tradingFee.feeBNumerator),
      },
      amountIn,
      direction: OrderV2Direction.B_TO_A,
      feeSharingNumerator: priceInAdaResponse.feeSharingNumerator
        ? BigInt(priceInAdaResponse.feeSharingNumerator)
        : null,
    });
    const minReceive = (result.amountOut * 99n) / 100n; // slippage 1%
    const txb = DEXOrderTransaction.createBulkOrdersTx({
      networkEnv: CONFIG.networkEnv,
      sender: nitroWallet.walletInfo.address,
      orderOptions: [
        {
          lpAsset: Asset.fromString(priceInAdaResponse.lpAsset),
          version: DexVersion.DEX_V2,
          type: OrderV2StepType.SWAP_EXACT_IN,
          assetIn: Asset.fromString(priceInAdaResponse.assetB),
          amountIn: amountIn,
          minimumAmountOut: 1n,
          direction: OrderV2Direction.B_TO_A,
          killOnFailed: false,
          isLimitOrder: false,
        },
      ],
    });
    const txComplete = await txb.completeUnsafe({
      changeAddress: nitroWallet.walletInfo.address,
      walletUtxos: utxos,
      coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
      provider: new EmulatorProvider(CONFIG.networkEnv),
    });
    const signedTx = txComplete.signWithPrivateKey(PrivateKey.fromHex(nitroWallet.privateKey)).complete();
    const txHash = await NitroWallet.submitTx(signedTx, CONFIG.networkEnv);
    console.log("shortHandleStep3 tx hash:", txHash);
    const newPosition: ShortPositionState = {
      ...position,
      updatedAt: Date.now(),
      amount: {
        ...position.amount,
        mShortedL: amountIn,
        mShortedEstimateAda: result.amountOut,
        mTradingPrice: Number(priceInAdaResponse.price),
      },
      transactions: [...position.transactions, { txHash, step: ShortPositionStatus.STEP_3_SHORT_TOKEN }],
      hasCallback: 1,
      callbackExtra: JSON.stringify({
        address: nitroWallet.walletInfo.address.bech32,
        asset: ADA.toString(),
        requiredAmount: minReceive.toString(),
      }),
    };
    return newPosition;
  }
};

// buy back $MIN, used Ada
export const shortHandleStep4: InnerHandleFn = async (options) => {
  const position = options.position as ShortPositionState;
  const { nitroWallet, extra } = options;
  invariant(extra && extra.extraStatus === ExtraStatus.EXTRA_SHORT_STEP_4, "Invalid extra data for short step 4");
  if (position.hasCallback) {
    invariant(position.callbackExtra, "type-safe");
    const callbackData = JSON.parse(position.callbackExtra) as {
      address: string;
      asset: string;
      requiredAmount: string;
    };
    const extraBalance: { address: string; requiredValue: Value } = {
      address: callbackData.address,
      requiredValue: new Value().add(Asset.fromString(callbackData.asset), BigInt(callbackData.requiredAmount)),
    };
    return innerHandleCallback({
      position,
      nextStatus: ShortPositionStatus.STEP_5_REPAY_ASSET,
      extraBalance,
    });
  } else {
    const utxos = await NitroWallet.fetchUtxos(nitroWallet.walletInfo.address.bech32, CONFIG.networkEnv);
    const { priceInAdaResponse, expectedReceive } = extra;
    const result = DexV2Calculation.calculateSwapExactOut({
      datumReserves: [BigInt(priceInAdaResponse.datumReserves[0]), BigInt(priceInAdaResponse.datumReserves[1])],
      valueReserves: [BigInt(priceInAdaResponse.valueReserves[0]), BigInt(priceInAdaResponse.valueReserves[1])],
      tradingFee: {
        feeANumerator: BigInt(priceInAdaResponse.tradingFee.feeANumerator),
        feeBNumerator: BigInt(priceInAdaResponse.tradingFee.feeBNumerator),
      },
      expectedReceive,
      direction: OrderV2Direction.A_TO_B,
      feeSharingNumerator: priceInAdaResponse.feeSharingNumerator
        ? BigInt(priceInAdaResponse.feeSharingNumerator)
        : null,
    });
    const necessaryAmountIn = Result.unwrap(result).necessaryAmountIn;
    const txb = DEXOrderTransaction.createBulkOrdersTx({
      networkEnv: CONFIG.networkEnv,
      sender: nitroWallet.walletInfo.address,
      orderOptions: [
        {
          lpAsset: Asset.fromString(priceInAdaResponse.lpAsset),
          version: DexVersion.DEX_V2,
          type: OrderV2StepType.SWAP_EXACT_OUT,
          assetIn: Asset.fromString(priceInAdaResponse.assetA),
          maximumAmountIn: necessaryAmountIn,
          expectedReceived: expectedReceive,
          direction: OrderV2Direction.A_TO_B,
          killOnFailed: false,
        },
      ],
    });
    const txComplete = await txb.completeUnsafe({
      changeAddress: nitroWallet.walletInfo.address,
      walletUtxos: utxos,
      coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
      provider: new EmulatorProvider(CONFIG.networkEnv),
    });
    const signedTx = txComplete.signWithPrivateKey(PrivateKey.fromHex(nitroWallet.privateKey)).complete();
    const txHash = await NitroWallet.submitTx(signedTx, CONFIG.networkEnv);
    console.log("shortHandleStep4 tx hash:", txHash);
    const newPosition: ShortPositionState = {
      ...position,
      updatedAt: Date.now(),
      amount: {
        ...position.amount,
        mClosedAda: necessaryAmountIn,
        mClosedPrice: Number(priceInAdaResponse.price),
      },
      transactions: [...position.transactions, { txHash, step: ShortPositionStatus.STEP_4_BUY_BACK_TOKEN }],
      hasCallback: 1,
      callbackExtra: JSON.stringify({
        address: nitroWallet.walletInfo.address.bech32,
        asset: priceInAdaResponse.assetB,
        requiredAmount: expectedReceive.toString(),
      }),
    };
    return newPosition;
  }
};

// repay MIN, receive qAda back
export const shortHandleStep5: InnerHandleFn = async (options) => {
  const position = options.position as ShortPositionState;
  const { nitroWallet } = options;
  if (position.hasCallback) {
    return innerHandleCallback({
      position,
      nextStatus: ShortPositionStatus.STEP_6_WITHDRAW_COLLATERAL,
    });
  } else {
    const utxos = await NitroWallet.fetchRawUtxos(nitroWallet.walletInfo.address.bech32, CONFIG.networkEnv);
    let loanTxHash = "";
    for (const { txHash, step } of position.transactions) {
      if (step === ShortPositionStatus.STEP_2_BORROW_TOKEN) {
        loanTxHash = txHash;
      }
    }
    console.warn("loanTxHash", loanTxHash);
    const { repayAmountL, txHash } = await LendingMarket.repayAllDebt({
      nitroWallet: {
        address: nitroWallet.walletInfo.address,
        privateKey: nitroWallet.privateKey,
        utxos,
      },
      networkEnv: CONFIG.networkEnv,
      loanTxHash,
    });
    console.log("shortHandleStep5 tx hash:", txHash);
    const newPosition: ShortPositionState = {
      ...position,
      updatedAt: Date.now(),
      amount: {
        ...position.amount,
        mRepaidL: repayAmountL,
      },
      transactions: [...position.transactions, { txHash, step: ShortPositionStatus.STEP_5_REPAY_ASSET }],
      hasCallback: 1,
    };
    return newPosition;
  }
};

// withdraw qADA collateral, receive Ada back
export const shortHandleStep6: InnerHandleFn = async (options) => {
  const position = options.position as ShortPositionState;
  const { nitroWallet, extra } = options;
  invariant(extra && extra.extraStatus === ExtraStatus.EXTRA_SHORT_STEP_6, "Invalid extra data for short step 6");
  if (position.hasCallback) {
    return innerHandleCallback({
      position,
      nextStatus: ShortPositionStatus.CLOSED_POSITION,
    });
  } else {
    const utxos = await NitroWallet.fetchUtxos(nitroWallet.walletInfo.address.bech32, CONFIG.networkEnv);
    const balance = Utxo.sumValue(utxos);
    const { supplyMarketId, qToken } = extra;
    const qTokenAmountA = Number(balance.get(qToken)) / 1e6;
    const { txHash, withdrawAllAmountL } = await LendingMarket.withdrawAllSupply({
      nitroWallet: {
        address: nitroWallet.walletInfo.address,
        privateKey: nitroWallet.privateKey,
        utxos: utxos.map(Utxo.toHex),
      },
      networkEnv: CONFIG.networkEnv,
      marketId: supplyMarketId,
      supplyQTokenAmountA: qTokenAmountA,
    });
    console.log("shortHandleStep6 tx hash:", txHash);
    const newPosition: ShortPositionState = {
      ...position,
      updatedAt: Date.now(),
      amount: {
        ...position.amount,
        mWithdrawnL: withdrawAllAmountL,
      },
      transactions: [...position.transactions, { txHash, step: ShortPositionStatus.STEP_6_WITHDRAW_COLLATERAL }],
      hasCallback: 1,
    };
    return newPosition;
  }
};

export const usePosition = () => {
  const { message } = App.useApp();
  const wallet = useAtomValue(walletAtom);
  const nitroWallet = useAtomValue(nitroWalletAtom);
  const setLongPositions = useSetAtom(setLongPositionAtom);
  const setShortPositions = useSetAtom(setShortPositionAtom);

  // Track positions that are currently being processed to prevent duplicate calls
  const processingPositions = useRef<Set<string>>(new Set());

  const handlePosition = useCallback(
    async (input: HandlePositionInput) => {
      const { positionType, position, errorMessage, successMessage, innerFn } = input;
      if (!nitroWallet || !wallet) return;
      // Check if this position is already being processed
      if (processingPositions.current.has(position.positionId)) {
        return;
      }
      // Mark position as being processed
      processingPositions.current.add(position.positionId);
      try {
        let retries = 0;
        const maxRetries = 3;
        let lastError: Error | null = null;

        while (retries <= maxRetries) {
          try {
            let hasCallback: number | undefined;
            if (positionType === "long") {
              const newPosition = (await innerFn({ position, wallet, nitroWallet })) as LongPositionState;
              hasCallback = newPosition.hasCallback;
              setLongPositions((prev) => prev.map((p) => (p.positionId === position.positionId ? newPosition : p)));
            } else {
              const newPosition = (await innerFn({ position, wallet, nitroWallet })) as ShortPositionState;
              hasCallback = newPosition.hasCallback;
              setShortPositions((prev) => prev.map((p) => (p.positionId === position.positionId ? newPosition : p)));
            }
            if (!hasCallback) {
              message.success(`${successMessage} ${position.positionId.slice(0, 8)}`);
            }
            break; // Exit loop on success
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (retries < maxRetries) {
              retries++;
              console.error("backoff error", error);
              console.log(
                `Retry ${retries}/${maxRetries} for position ${position.positionId.slice(0, 8)} after 30s...`,
              );
              await Helpers.sleep(30000); // Sleep 30 seconds before retry
            } else {
              const txHash = position.transactions[position.transactions.length - 1]?.txHash;
              if (txHash) {
                const txConfirmed = await Helpers.checkTxConfirmed(txHash);
                if (!txConfirmed) {
                  const prevStep = position.transactions[position.transactions.length - 2]?.step;
                  const lastStep = position.transactions[position.transactions.length - 1]?.step;
                  if (prevStep && lastStep && prevStep === lastStep) {
                    const transactions = [...position.transactions];
                    transactions.pop(); // remove last failed tx
                    const newPosition = { ...position, hasCallback: 1, transactions };
                    if (positionType === "long") {
                      setLongPositions((prev) =>
                        prev.map((p) =>
                          p.positionId === position.positionId ? (newPosition as LongPositionState) : p,
                        ),
                      );
                    } else {
                      setShortPositions((prev) =>
                        prev.map((p) =>
                          p.positionId === position.positionId ? (newPosition as ShortPositionState) : p,
                        ),
                      );
                    }
                  }
                }
              }
              console.error("max retries reached for position:", position.positionId, lastError);
              setTimeout(() => {
                window.location.reload();
              }, 5000);
              // throw lastError;
            }
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        message.error(`${errorMessage}: ${errorMsg}`);
        console.error("handle position error: ", error);
      } finally {
        // Remove from processing set when done (success or error)
        processingPositions.current.delete(position.positionId);
      }
    },
    [nitroWallet, wallet, setLongPositions, setShortPositions, message],
  );

  return {
    handlePosition,
  };
};
