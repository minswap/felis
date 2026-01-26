import BigNumber from "bignumber.js";
import { zipWith } from "remeda";

import { type Asset, NetworkID } from "@minswap/felis-ledger-core";
import { Result } from "@minswap/felis-ledger-utils";
import { StableswapCalculationErrorCode, StableswapPoolCalculationError } from "./error";

/**
 * Pool fee information for display purposes
 */
export type PoolFee = {
  tradingFee: number;
  feeSharing: number;
  lpFee: number;
};

type CommonStableswapCalculationOptions = {
  amp: bigint;
  multiples: bigint[];
  datumBalances: bigint[];
  valueBalances: bigint[];
  fee: bigint;
  adminFee: bigint;
  feeDenominator: bigint;
};

export type StableswapCalculateExchangeOptions = CommonStableswapCalculationOptions & {
  inIndex: number;
  outIndex: number;
  amountIn: bigint;
};

export type StableswapCalculateDepositOptions = CommonStableswapCalculationOptions & {
  amountIns: bigint[];
  totalLiquidity: bigint;
};

export type StableswapCalculateWithdrawOptions = Omit<
  CommonStableswapCalculationOptions,
  "amp" | "fee" | "adminFee" | "feeDenominator"
> & {
  withdrawalLPAmount: bigint;
  totalLiquidity: bigint;
};

export type StableswapCalculateWithdrawImbalanceOptions = CommonStableswapCalculationOptions & {
  withdrawAmounts: bigint[];
  totalLiquidity: bigint;
};

export type StableswapCalculateWithdrawOneCoinOptions = CommonStableswapCalculationOptions & {
  amountLpIn: bigint;
  outIndex: number;
  totalLiquidity: bigint;
};

type CommonStableswapCalculationResult = {
  newDatumBalances: bigint[];
  newValueBalances: bigint[];
  feeAmounts: bigint[];
  // The volumes of assets that involve in the swap part.
  // Both swap asset & destination asset are included in the volume
  assetVolumes: bigint[];
  // The volume of destination asset that involves in the swap part.
  poolVolumes: bigint[];
};

export type StableswapExchangeResult = CommonStableswapCalculationResult & {
  amountOut: bigint;
};

export type StableswapDepositResult = CommonStableswapCalculationResult & {
  lpAmount: bigint;
};

export type StableswapWithdrawResult = Omit<
  CommonStableswapCalculationResult,
  "feeAmounts" | "assetVolumes" | "poolVolumes"
> & {
  amountOuts: bigint[];
};

export type StableswapWithdrawImbalanceResult = CommonStableswapCalculationResult & {
  lpAmount: bigint;
};

export type StableswapWithdrawOneCoinResult = CommonStableswapCalculationResult & {
  amountOut: bigint;
};

export type CalculateStableswapPriceImpactOptions = {
  amp: bigint;
  datumBalances: bigint[];
  multiples: bigint[];
  inIndex: number;
  outIndex: number;
  amountIn: bigint;
  amountOut: bigint;
  inDecimals: number;
  outDecimals: number;
  networkId: NetworkID;
};

export type StableswapTradingInfo = {
  assetIn: Asset;
  swapAmount: bigint;
  assetOut: Asset;
  receiveAmount: bigint;
};

export namespace StableswapCalculation {
  export function getTradingInfo(
    assets: Asset[],
    poolVolumes: bigint[],
    assetVolumes: bigint[],
  ): StableswapTradingInfo | null {
    // each order having swaps inside, poolVolumes are outputs of swaps, assetVolumes are inputs+outputs of swaps
    const input = zipWith(assetVolumes, poolVolumes, (a, b) => a - b);
    const output = poolVolumes;

    // TODO: support multi inputs or outputs
    if (input.filter((x) => x > 0n).length === 1 && output.filter((x) => x > 0n).length === 1) {
      const inputIndex = input.findIndex((x) => x > 0n);
      const outputIndex = output.findIndex((x) => x > 0n);
      return {
        assetIn: assets[inputIndex],
        swapAmount: input[inputIndex],
        assetOut: assets[outputIndex],
        receiveAmount: output[outputIndex],
      };
    }
    return null;
  }

  export function calculateExchange({
    inIndex,
    outIndex,
    amountIn,
    amp,
    multiples,
    datumBalances,
    valueBalances,
    fee,
    adminFee,
    feeDenominator,
  }: StableswapCalculateExchangeOptions): Result<StableswapExchangeResult, StableswapPoolCalculationError> {
    const tempDatumBalances = [...datumBalances];
    const tempValueBalances = [...valueBalances];
    const feeAmounts = tempDatumBalances.map((_) => 0n);
    const assetVolumes = tempDatumBalances.map((_) => 0n);
    const poolVolumes = tempDatumBalances.map((_) => 0n);

    const length = multiples.length;
    if (amountIn <= 0) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.INVALID_PARAMS,
          `calculateExchange error: amountIn ${amountIn} must be positive.`,
        ),
      );
    }

    if (inIndex < 0 || inIndex >= length) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.INVALID_PARAMS,
          `calculateExchange error: inIndex ${inIndex} is not valid, must be within 0-${length - 1}`,
        ),
      );
    }
    if (outIndex < 0 || outIndex >= length) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.INVALID_PARAMS,
          `calculateExchange error: outIndex ${outIndex} is not valid, must be within 0-${length - 1}`,
        ),
      );
    }
    const mulBalances = zipWith(tempDatumBalances, multiples, (a, b) => a * b);
    const mulIn = multiples[inIndex];
    const mulOut = multiples[outIndex];
    const x = mulBalances[inIndex] + amountIn * mulIn;
    const y = getY(inIndex, outIndex, x, mulBalances, amp);

    if (y instanceof StableswapPoolCalculationError) {
      return Result.err(y);
    }

    const dy = mulBalances[outIndex] - y;
    const dyFee = (dy * fee) / feeDenominator;
    const dyAdminFee = (dyFee * adminFee) / feeDenominator;
    const amountOut = (dy - dyFee) / mulOut;
    const newDatumBalanceIn = x / mulIn;
    const newDatumBalanceOut = (y + (dyFee - dyAdminFee)) / mulOut;
    feeAmounts[outIndex] = dyFee / mulOut;

    tempDatumBalances[inIndex] = newDatumBalanceIn;
    tempDatumBalances[outIndex] = newDatumBalanceOut;
    tempValueBalances[inIndex] = tempValueBalances[inIndex] + amountIn;
    tempValueBalances[outIndex] = tempValueBalances[outIndex] - amountOut;

    if (amountOut <= 0) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.AMOUNT_TOO_SMALL,
          `calculateExchange error: amountIn is too small, amountOut (${amountOut}) must be positive.`,
        ),
      );
    }
    if (newDatumBalanceOut <= 0) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.AMOUNT_TOO_BIG,
          `calculateExchange error: newDatumBalanceOut (${newDatumBalanceOut}) must be positive.`,
        ),
      );
    }
    assetVolumes[inIndex] = amountIn;
    assetVolumes[outIndex] = amountOut;
    poolVolumes[outIndex] = amountOut;
    return Result.ok({
      amountOut: amountOut,
      newDatumBalances: tempDatumBalances,
      newValueBalances: tempValueBalances,
      feeAmounts,
      assetVolumes,
      poolVolumes,
    });
  }

  export function calculateDeposit({
    amountIns,
    amp,
    multiples,
    datumBalances,
    valueBalances,
    totalLiquidity,
    fee,
    adminFee,
    feeDenominator,
  }: StableswapCalculateDepositOptions): Result<StableswapDepositResult, StableswapPoolCalculationError> {
    const tempDatumBalances = [...datumBalances];
    const tempValueBalances = [...valueBalances];
    const feeAmounts = tempDatumBalances.map((_) => 0n);
    const assetVolumes = tempDatumBalances.map((_) => 0n);
    const poolVolumes = tempDatumBalances.map((_) => 0n);

    const length = multiples.length;
    if (amountIns.length !== length) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.INVALID_PARAMS,
          `calculateDeposit error: amountIns's length ${amountIns.length} is invalid, amountIns's length must be ${length}`,
        ),
      );
    }
    let newDatumBalances: bigint[] = [];
    let newValueBalances: bigint[] = [];
    let lpAmount = 0n;
    if (totalLiquidity === 0n) {
      for (let i = 0; i < length; ++i) {
        if (amountIns[i] <= 0n) {
          return Result.err(
            new StableswapPoolCalculationError(
              StableswapCalculationErrorCode.INVALID_PARAMS,
              `calculateDeposit error: amount index ${i} must be positive in case totalLiquidity = 0`,
            ),
          );
        }
      }
      newDatumBalances = zipWith(tempDatumBalances, amountIns, (a, b) => a + b);
      newValueBalances = zipWith(tempValueBalances, amountIns, (a, b) => a + b);
      const d1 = getDMem(newDatumBalances, multiples, amp);
      if (d1 <= 0) {
        return Result.err(
          new StableswapPoolCalculationError(
            StableswapCalculationErrorCode.AMOUNT_TOO_SMALL,
            `calculateDeposit: d1 must be greater than 0 in case totalLiquidity = 0`,
          ),
        );
      }
      lpAmount = d1;
    } else {
      let sumIns = 0n;
      for (let i = 0; i < length; ++i) {
        if (amountIns[i] < 0n) {
          return Result.err(
            new StableswapPoolCalculationError(
              StableswapCalculationErrorCode.INVALID_PARAMS,
              `calculateDeposit error: amountIns index ${i} must be non-negative`,
            ),
          );
        }
        sumIns += amountIns[i];
      }
      if (sumIns === 0n) {
        return Result.err(
          new StableswapPoolCalculationError(
            StableswapCalculationErrorCode.INVALID_PARAMS,
            `calculateDeposit error: sum of amountIns must be positive`,
          ),
        );
      }

      const newDatumBalanceWithoutFee = zipWith(tempDatumBalances, amountIns, (a, b) => a + b);
      newValueBalances = zipWith(tempValueBalances, amountIns, (a, b) => a + b);

      const d0 = getDMem(tempDatumBalances, multiples, amp);
      const d1 = getDMem(newDatumBalanceWithoutFee, multiples, amp);

      if (d1 <= d0) {
        return Result.err(
          new StableswapPoolCalculationError(
            StableswapCalculationErrorCode.AMOUNT_TOO_SMALL,
            `calculateDeposit: d1 must be greater than d0 in case totalLiquidity > 0, d1: ${d1}, d0: ${d0}`,
          ),
        );
      }

      const specialFee = (fee * BigInt(length)) / (4n * (BigInt(length) - 1n));

      const newDatBalancesWithTradingFee: bigint[] = [];
      for (let i = 0; i < tempDatumBalances.length; i++) {
        const oldBalance = tempDatumBalances[i];
        const newBalance = newDatumBalanceWithoutFee[i];

        const idealBalance = (d1 * oldBalance) / d0;
        let different = 0n;
        // In this case, liquidity pool has to swap the amount of other assets to get @different assets[i]
        // Because the pool volumes is counted only for destination asset of the swap so we skip the "else" condition
        if (newBalance > idealBalance) {
          different = newBalance - idealBalance;
          poolVolumes[i] = different;
        } else {
          different = idealBalance - newBalance;
        }
        assetVolumes[i] = different;
        const tradingFeeAmount = (specialFee * different) / feeDenominator;
        feeAmounts[i] = tradingFeeAmount;
        const adminFeeAmount = (tradingFeeAmount * adminFee) / feeDenominator;
        newDatumBalances.push(newBalance - adminFeeAmount);
        newDatBalancesWithTradingFee.push(newBalance - tradingFeeAmount);
      }
      for (let i = 0; i < length; ++i) {
        if (newDatBalancesWithTradingFee[i] <= 0) {
          new StableswapPoolCalculationError(
            StableswapCalculationErrorCode.AMOUNT_TOO_BIG,
            `calculateDeposit error: deposit amount is too small, newDatBalancesWithTradingFee must be positive`,
          );
        }
      }
      const d2 = getDMem(newDatBalancesWithTradingFee, multiples, amp);
      lpAmount = (totalLiquidity * (d2 - d0)) / d0;
    }

    if (lpAmount <= 0n) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.AMOUNT_TOO_SMALL,
          `calculateDeposit error: deposit amount is too small, lpAmountOut ${lpAmount} must be positive`,
        ),
      );
    }
    return Result.ok({
      lpAmount: lpAmount,
      newDatumBalances: newDatumBalances,
      newValueBalances: newValueBalances,
      feeAmounts: feeAmounts,
      assetVolumes,
      poolVolumes,
    });
  }

  export function calculateWithdraw({
    withdrawalLPAmount,
    multiples,
    datumBalances,
    valueBalances,
    totalLiquidity,
  }: StableswapCalculateWithdrawOptions): Result<StableswapWithdrawResult, StableswapPoolCalculationError> {
    const tempDatumBalances = [...datumBalances];
    const tempValueBalances = [...valueBalances];

    const length = multiples.length;
    if (withdrawalLPAmount <= 0n) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.INVALID_PARAMS,
          `calculateWithdraw error: withdrawalLPAmount must be positive`,
        ),
      );
    }
    const amountOuts = tempDatumBalances.map((balance) => (balance * withdrawalLPAmount) / totalLiquidity);
    let sumOuts = 0n;
    for (let i = 0; i < length; ++i) {
      if (amountOuts[i] < 0n) {
        return Result.err(
          new StableswapPoolCalculationError(
            StableswapCalculationErrorCode.AMOUNT_TOO_SMALL,
            `calculateWithdraw error: amountOuts must be non-negative`,
          ),
        );
      }
      sumOuts += amountOuts[i];
    }
    if (sumOuts === 0n) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.AMOUNT_TOO_SMALL,
          `calculateWithdraw error: sum of amountOuts must be positive`,
        ),
      );
    }

    const newDatumBalances = zipWith(tempDatumBalances, amountOuts, (a, b) => a - b);
    const newValueBalances = zipWith(tempValueBalances, amountOuts, (a, b) => a - b);
    return Result.ok({
      amountOuts: amountOuts,
      newDatumBalances: newDatumBalances,
      newValueBalances: newValueBalances,
    });
  }

  export function calculateWithdrawImbalance({
    withdrawAmounts,
    amp,
    multiples,
    datumBalances,
    valueBalances,
    totalLiquidity,
    fee,
    adminFee,
    feeDenominator,
  }: StableswapCalculateWithdrawImbalanceOptions): Result<
    StableswapWithdrawImbalanceResult,
    StableswapPoolCalculationError
  > {
    const tempDatumBalances = [...datumBalances];
    const tempValueBalances = [...valueBalances];
    const feeAmounts = tempDatumBalances.map((_) => 0n);
    const assetVolumes = tempDatumBalances.map((_) => 0n);
    const poolVolumes = tempDatumBalances.map((_) => 0n);

    const length = multiples.length;
    if (withdrawAmounts.length !== length) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.INVALID_PARAMS,
          `calculateWithdrawImbalance error: withdrawAmounts's length ${withdrawAmounts.length} is invalid, withdrawAmounts's length must be ${length}`,
        ),
      );
    }

    let sumOuts = 0n;
    for (let i = 0; i < length; ++i) {
      if (withdrawAmounts[i] < 0n) {
        return Result.err(
          new StableswapPoolCalculationError(
            StableswapCalculationErrorCode.INVALID_PARAMS,
            `calculateDeposit error: amountIns must be non-negative`,
          ),
        );
      }

      sumOuts += withdrawAmounts[i];
    }
    if (sumOuts === 0n) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.INVALID_PARAMS,
          `calculateWithdrawImbalance error: sum of withdrawAmounts must be positive`,
        ),
      );
    }

    const specialFee = (fee * BigInt(length)) / (4n * (BigInt(length) - 1n));

    const newDatBalancesWithoutFee = zipWith(tempDatumBalances, withdrawAmounts, (a, b) => a - b);
    for (let i = 0; i < length; ++i) {
      if (newDatBalancesWithoutFee[i] <= 0n) {
        return Result.err(
          new StableswapPoolCalculationError(
            StableswapCalculationErrorCode.AMOUNT_TOO_BIG,
            `calculateWithdrawImbalance error: not enough asset index ${i}`,
          ),
        );
      }
    }
    const d0 = getDMem(tempDatumBalances, multiples, amp);
    const d1 = getDMem(newDatBalancesWithoutFee, multiples, amp);

    const newDatBalancesWithTradingFee = [];
    const newDatBalances = [];
    for (let i = 0; i < length; ++i) {
      const idealBalance = (d1 * tempDatumBalances[i]) / d0;
      let different = 0n;
      // In this case, liquidity pool has to swap the amount of other assets to get @different assets[i]
      // Because the pool volumes is counted only for destination asset of the swap so we skip the "else" condition
      if (newDatBalancesWithoutFee[i] > idealBalance) {
        different = newDatBalancesWithoutFee[i] - idealBalance;
        poolVolumes[i] = different;
      } else {
        different = idealBalance - newDatBalancesWithoutFee[i];
      }
      assetVolumes[i] = different;
      const tradingFeeAmount = (specialFee * different) / feeDenominator;
      feeAmounts[i] = tradingFeeAmount;
      const adminFeeAmount = (tradingFeeAmount * adminFee) / feeDenominator;
      newDatBalances.push(newDatBalancesWithoutFee[i] - adminFeeAmount);
      newDatBalancesWithTradingFee.push(newDatBalancesWithoutFee[i] - tradingFeeAmount);
    }
    for (let i = 0; i < length; ++i) {
      if (newDatBalancesWithTradingFee[i] <= 0n) {
        return Result.err(
          new StableswapPoolCalculationError(
            StableswapCalculationErrorCode.AMOUNT_TOO_BIG,
            `calculateWithdrawImbalance error: not enough asset index ${i}`,
          ),
        );
      }
    }

    const d2 = getDMem(newDatBalancesWithTradingFee, multiples, amp);
    let lpAmount = ((d0 - d2) * totalLiquidity) / d0;

    if (lpAmount <= 0n) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.AMOUNT_TOO_SMALL,
          `calculateWithdrawImbalance error: required lpAmount ${lpAmount} must be positive`,
        ),
      );
    }
    lpAmount += 1n;
    const newValueBalances = zipWith(tempValueBalances, withdrawAmounts, (a, b) => a - b);

    return Result.ok({
      lpAmount: lpAmount,
      newDatumBalances: newDatBalances,
      newValueBalances: newValueBalances,
      feeAmounts: feeAmounts,
      assetVolumes,
      poolVolumes,
    });
  }

  export function calculateWithdrawOneCoin({
    amountLpIn,
    outIndex,
    amp,
    multiples,
    datumBalances,
    valueBalances,
    totalLiquidity,
    fee,
    adminFee,
    feeDenominator,
  }: StableswapCalculateWithdrawOneCoinOptions): Result<
    StableswapWithdrawOneCoinResult,
    StableswapPoolCalculationError
  > {
    const tempDatumBalances = [...datumBalances];
    const tempValueBalances = [...valueBalances];
    const feeAmounts = tempDatumBalances.map((_) => 0n);
    const assetVolumes = tempDatumBalances.map((_) => 0n);
    const poolVolumes = tempDatumBalances.map((_) => 0n);

    const length = multiples.length;
    if (amountLpIn <= 0) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.INVALID_PARAMS,
          `calculateWithdrawOneCoin error: amountLpIn ${amountLpIn} must be positive.`,
        ),
      );
    }

    if (outIndex < 0 || outIndex >= length) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.INVALID_PARAMS,
          `,calculateWithdrawOneCoin error: outIndex ${outIndex} is not valid, must be within 0-${length - 1}`,
        ),
      );
    }

    const mulBalances = zipWith(tempDatumBalances, multiples, (a, b) => a * b);
    const mulOut = multiples[outIndex];
    const d0 = getD(mulBalances, amp);
    const d1 = d0 - (amountLpIn * d0) / totalLiquidity;
    const mulBalancesReduced = mulBalances;
    // newY is new MulBal[outIndex]
    const newYWithoutFeeResult = getYD(outIndex, mulBalances, amp, d1);
    if (newYWithoutFeeResult.type === "err") {
      return newYWithoutFeeResult;
    }
    const newYWithoutFee = newYWithoutFeeResult.value;
    const specialFee = (fee * BigInt(length)) / (4n * (BigInt(length) - 1n));

    const amountOutWithoutFee = (mulBalances[outIndex] - newYWithoutFee) / mulOut;
    for (let i = 0; i < length; ++i) {
      const diff =
        i === outIndex ? (mulBalances[i] * d1) / d0 - newYWithoutFee : mulBalances[i] - (mulBalances[i] * d1) / d0;
      assetVolumes[i] = diff / multiples[i];
      // there is only asset[outIndex] which is destination asset
      if (i === outIndex) {
        poolVolumes[i] = diff / multiples[i];
      }
      mulBalancesReduced[i] -= (diff * specialFee) / feeDenominator;
    }
    const newYResult = getYD(outIndex, mulBalancesReduced, amp, d1);
    if (newYResult.type === "err") {
      return newYResult;
    }
    const newY = newYResult.value;
    const amountOut = (mulBalancesReduced[outIndex] - newY - 1n) / mulOut;
    tempDatumBalances[outIndex] -= amountOut + ((amountOutWithoutFee - amountOut) * adminFee) / feeDenominator;
    tempValueBalances[outIndex] -= amountOut;
    feeAmounts[outIndex] = amountOutWithoutFee - amountOut;
    return Result.ok({
      amountOut: amountOut,
      newDatumBalances: tempDatumBalances,
      newValueBalances: tempValueBalances,
      feeAmounts: feeAmounts,
      assetVolumes,
      poolVolumes,
    });
  }

  export function getD(mulBalances: bigint[], amp: bigint): bigint {
    const sumMulBalances = mulBalances.reduce((sum, balance) => sum + balance, 0n);
    if (sumMulBalances === 0n) {
      return 0n;
    }

    const length = BigInt(mulBalances.length);
    let dPrev = 0n;
    let d = sumMulBalances;
    const ann = amp * length;

    for (let i = 0; i < 255; i++) {
      let dp = d;
      for (const mulBalance of mulBalances) {
        dp = (dp * d) / (mulBalance * length);
      }
      dPrev = d;
      d = ((ann * sumMulBalances + dp * length) * d) / ((ann - 1n) * d + (length + 1n) * dp);
      if (d > dPrev) {
        if (d - dPrev <= 1n) {
          break;
        }
      } else {
        if (dPrev - d <= 1n) {
          break;
        }
      }
    }
    return d;
  }

  export function getDMem(balances: bigint[], multiples: bigint[], amp: bigint): bigint {
    const mulBalances = zipWith(balances, multiples, (a, b) => a * b);
    return getD(mulBalances, amp);
  }

  export function getY(
    i: number,
    j: number,
    x: bigint,
    xp: bigint[],
    amp: bigint,
  ): bigint | StableswapPoolCalculationError {
    if (i === j || i < 0 || j < 0 || i >= xp.length || j >= xp.length) {
      return new StableswapPoolCalculationError(
        StableswapCalculationErrorCode.INVALID_PARAMS,
        `getY failed: i and j must be different and less than length of xp`,
      );
    }
    const length = BigInt(xp.length);
    const d = getD(xp, amp);
    let c = d;
    let s = 0n;
    const ann = amp * length;

    let _x = 0n;
    for (let index = 0; index < Number(length); index++) {
      if (index === i) {
        _x = x;
      } else if (index !== j) {
        _x = xp[index];
      } else {
        continue;
      }
      s += _x;
      c = (c * d) / (_x * length);
    }

    c = (c * d) / (ann * length);
    const b = s + d / ann;
    let yPrev = 0n;
    let y = d;
    for (let index = 0; index < 255; index++) {
      yPrev = y;
      y = (y * y + c) / (2n * y + b - d);
      if (y > yPrev) {
        if (y - yPrev <= 1n) {
          break;
        }
      } else {
        if (yPrev - y <= 1n) {
          break;
        }
      }
    }
    return y;
  }

  export function getYD(
    i: number,
    xp: bigint[],
    amp: bigint,
    d: bigint,
  ): Result<bigint, StableswapPoolCalculationError> {
    const length = BigInt(xp.length);
    if (i < 0 || i >= xp.length) {
      return Result.err(
        new StableswapPoolCalculationError(
          StableswapCalculationErrorCode.INVALID_PARAMS,
          `getYD failed: i must be less than length of xp`,
        ),
      );
    }
    let c = d;
    let s = 0n;
    const ann = amp * length;

    let _x = 0n;
    for (let index = 0; index < Number(length); index++) {
      if (index !== i) {
        _x = xp[index];
      } else {
        continue;
      }
      s += _x;
      c = (c * d) / (_x * length);
    }
    c = (c * d) / (ann * length);
    const b = s + d / ann;
    let yPrev = 0n;
    let y = d;
    for (let index = 0; index < 255; index++) {
      yPrev = y;
      y = (y * y + c) / (2n * y + b - d);
      if (y > yPrev) {
        if (y - yPrev <= 1n) {
          break;
        }
      } else {
        if (yPrev - y <= 1n) {
          break;
        }
      }
    }
    return Result.ok(y);
  }

  export function getSmallSwapValue(
    amountIn: BigNumber,
    amountOut: BigNumber,
    inDecimals: number,
    outDecimals: number,
  ): BigNumber {
    const targetIn = BigNumber(10 ** (inDecimals > 5 ? inDecimals - 3 : inDecimals));
    const targetOut = BigNumber(10 ** (outDecimals > 5 ? outDecimals - 3 : outDecimals));

    const k = BigNumber.maximum(targetIn.div(amountIn), targetOut.div(amountOut));
    return BigNumber.minimum(amountIn.multipliedBy(k), BigNumber(10 ** inDecimals));
  }

  export function calculatePriceImpact({
    inIndex,
    outIndex,
    amountIn,
    amountOut,
    inDecimals,
    outDecimals,
    networkId,
    amp,
    datumBalances,
    multiples,
  }: CalculateStableswapPriceImpactOptions): Result<number, StableswapPoolCalculationError> {
    const tempDatumBalances: bigint[] = [...datumBalances];
    if (networkId === NetworkID.TESTNET && Math.max(inDecimals, outDecimals) <= 2) {
      inDecimals += 3;
      outDecimals += 3;
    }

    const amountInBN = BigNumber(amountIn.toString());
    const amountOutBN = BigNumber(amountOut.toString());

    const smallAmountInBN = getSmallSwapValue(amountInBN, amountOutBN, inDecimals, outDecimals);
    const smallAmountIn = BigInt(smallAmountInBN.toFixed(0));

    const mulBalances = zipWith(tempDatumBalances, multiples, (b, m) => b * m);
    const mulIn = multiples[inIndex];
    const mulOut = multiples[outIndex];
    const x = mulBalances[inIndex] + smallAmountIn * mulIn;
    const yResult = getY(inIndex, outIndex, x, mulBalances, amp);
    if (yResult instanceof StableswapPoolCalculationError) {
      return Result.err(yResult);
    }
    const smallAmountOut = (mulBalances[outIndex] - yResult) / mulOut;
    if (smallAmountOut === 0n) {
      return Result.ok(0);
    }
    const smallAmountOutBN = BigNumber(smallAmountOut.toString());

    const rateBN = amountOutBN.dividedBy(amountInBN);
    const smallRateBN = smallAmountOutBN.dividedBy(smallAmountInBN);
    const priceImpact = rateBN.gt(smallRateBN)
      ? BigNumber(0)
      : BigNumber(1).minus(rateBN.div(smallRateBN)).multipliedBy(100);

    return Result.ok(Number(priceImpact.toString()));
  }

  /**
   * must reconstructor beacause SDK.getVirtualPrice returns object
   */
  export function getVirtualPrice(
    balances: bigint[],
    multiples: bigint[],
    amp: bigint,
    totalLiquidity: bigint,
  ): BigNumber {
    const d = getDMem(balances, multiples, amp);
    return new BigNumber(d.toString()).div(totalLiquidity.toString());
  }

  export function getVirtualPriceFraction(
    balances: bigint[],
    multiples: bigint[],
    amp: bigint,
    totalLiquidity: bigint,
  ): [bigint, bigint] {
    const d = getDMem(balances, multiples, amp);
    return [d, totalLiquidity];
  }

  export function calculatePoolFee(baseFee: bigint, adminFee: bigint, feeDenominator: bigint): PoolFee {
    const tradingFee = new BigNumber(baseFee.toString()).div(feeDenominator.toString());
    const feeSharingPercentOfTradingFee = new BigNumber(adminFee.toString()).div(feeDenominator.toString());
    const feeSharing = tradingFee.multipliedBy(feeSharingPercentOfTradingFee);
    const lpFee = tradingFee.minus(feeSharing);
    return {
      tradingFee: tradingFee.multipliedBy(100).toNumber(),
      feeSharing: feeSharing.multipliedBy(100).toNumber(),
      lpFee: lpFee.multipliedBy(100).toNumber(),
    };
  }

  /**
   * depend on this formula: https://github.com/curvefi/curve-factory/blob/master/contracts/implementations/plain-2/Plain2Balances.vy#L442-L448
   * marco message(convert to easier reading version):
   * def get_p(xp, amp, D):
   * # dx_0 / dx_1 only, however can have any number of coins in pool
   * N_COINS = len(xp)
   * ANN = amp * N_COINS
   * Dr = D / (N_COINS ** N_COINS)
   * for i in range(N_COINS):
   *     Dr = Dr * D / xp[i]
   * return (ANN * xp[0] + Dr * xp[0] / xp[1]) / (ANN * xp[0] + Dr)
   *
   * TODO: waiting for Elder and Marco verify this formula
   * @return price of asset[assetBIndex] base on asset[assetAIndex]
   */
  export function getPrice(
    balances: bigint[],
    multiples: bigint[],
    amp: bigint,
    assetAIndex: number,
    assetBIndex: number,
  ): [bigint, bigint] {
    const mulBalances = zipWith(balances, multiples, (a, b) => a * b);
    const length = BigInt(mulBalances.length);
    const ann = amp * length;
    const d = getD(mulBalances, amp);

    // Dr = D / (N_COINS ** N_COINS)
    // for i in range(N_COINS):
    //     Dr = Dr * D / xp[i]

    //drNumerator = D^(n+1)
    //drDenominator = n^n*xp[0]*xp[1]*...*xp[n-1]
    let drNumerator = d;
    let drDenominator = 1n;
    for (let i = 0n; i < length; ++i) {
      drNumerator = drNumerator * d;
      drDenominator = drDenominator * mulBalances[Number(i)] * length;
    }

    // (ANN * xp[assetAIndex] + Dr * xp[assetAIndex] / xp[assetBIndex]) / (ANN * xp[assetAIndex] + Dr)
    // = (drDenominator * ANN * xp[assetAIndex] * xp[assetBIndex] + drNumerator*xp[assetAIndex])
    //       / xp[assetBIndex] * (drDenominator * Ann * xp[assetAIndex] + drNumerator)
    // this is price of asset[assetBIndex] / multiples[assetBIndex] base on asset[assetAIndex] / multiples[assetAIndex]
    // => price = priceWithMultiple / multiples[assetAIndex] * multiples[assetBIndex]
    return shortenFraction([
      (drDenominator * ann * mulBalances[assetAIndex] * mulBalances[assetBIndex] +
        drNumerator * mulBalances[assetAIndex]) *
        multiples[assetBIndex],
      mulBalances[assetBIndex] *
        (drDenominator * ann * mulBalances[assetAIndex] + drNumerator) *
        multiples[assetAIndex],
    ]);
  }
}

function shortenFraction([numerator, denominator]: [bigint, bigint]): [bigint, bigint] {
  const gcd = gcdFunction(numerator, denominator);
  if (gcd === 0n) {
    return [1n, 1n];
  } else {
    return [numerator / gcd, denominator / gcd];
  }
}

function gcdFunction(a: bigint, b: bigint): bigint {
  if (a > b) {
    if (b === 0n) {
      return a;
    }
    return gcdFunction(a % b, b);
  } else if (a < b) {
    if (a === 0n) {
      return b;
    }
    return gcdFunction(a, b % a);
  }
  return a;
}
