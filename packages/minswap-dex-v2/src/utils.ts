import type { Asset } from "@repo/ledger-core";
import { type Maybe, Result } from "@repo/ledger-utils";
import { OrderV2Direction } from "./order";
import type { PoolV2BaseFee } from "./pool";
import { bigIntPow, sqrt } from "./sqrt";

export function normalizePair([a, b]: [Asset, Asset]): [Asset, Asset] {
  if (a.compare(b) > 0) {
    return [b, a];
  }
  return [a, b];
}

export type PoolFee = {
  // Trading Fee is the total Fee that is taken from the Traders by the Liquidity Pool
  tradingFee: number;
  // Fee Sharing is the percentage of the Trading Fee that is taken by the Protocol
  feeSharing: number;
  // LP Fee is the percentage of the Trading Fee that is distributed for the Liquidity Providers
  lpFee: number;
};

export type DexVolume = {
  volumeA: bigint;
  volumeB: bigint;
};

export const DEFAULT_TRADING_FEE_DENOMINATOR = 10000n;

type Reserves = [bigint, bigint];
type Fraction = [bigint, bigint];

export type DexV2CommonCalculationOptions = {
  datumReserves: Reserves;
  valueReserves: Reserves;
  tradingFee: PoolV2BaseFee;
};

export type DexV2CollectedFee = {
  tradingFeeA: bigint;
  tradingFeeB: bigint;
  feeShareA: bigint;
  feeShareB: bigint;
};

export type DexV2CommonCalculationResult = {
  newDatumReserves: Reserves;
  newValueReserves: Reserves;
  volume: DexVolume;
  collectedFee: DexV2CollectedFee;
};

/* Data types using for DexV2 properties calculation */

export type DexV2CalculateAmountOutOptions = {
  reserveIn: bigint;
  reserveOut: bigint;
  amountIn: bigint;
  tradingFeeNumerator: bigint;
};

export type DexV2CalculateAmountOutFractionOptions = {
  reserveIn: bigint;
  reserveOut: bigint;
  amountIn: Fraction;
  tradingFeeNumerator: bigint;
};

export type DexV2CalculateAmountInOptions = {
  reserveIn: bigint;
  reserveOut: bigint;
  amountOut: bigint;
  tradingFeeNumerator: bigint;
};

export type DexV2CalculateMaxInSwapOptions = {
  reserveIn: bigint;
  reserveOut: bigint;
  tradingFeeNumerator: bigint;
  ioRatio: Fraction;
};

export type DexV2CalculateEarnedFeeInOptions = {
  amountIn: bigint;
  tradingFeeNumerator: bigint;
  feeSharingNumerator: Maybe<bigint>;
};

export type DexV2CalculateEarnedFeeInFractionOptions = {
  amountIn: Fraction;
  tradingFeeNumerator: bigint;
  feeSharingNumerator: Maybe<bigint>;
};

export type DexV2CalculateDepositAmountOptions = {
  amountA: bigint;
  amountB: bigint;
  datumReserves: Reserves;
  totalLiquidity: bigint;
  tradingFee: PoolV2BaseFee;
  feeSharingNumerator: Maybe<bigint>;
};

export type DexV2CalculateDepositSwapAmountOptions = {
  amountIn: bigint;
  amountOut: bigint;
  reserveIn: bigint;
  reserveOut: bigint;
  tradingFeeNumerator: bigint;
};

export type DexV2CalculateZapOutAmountOptions = {
  withdrawalLPAmount: bigint;
  datumReserves: Reserves;
  totalLiquidity: bigint;
  tradingFee: PoolV2BaseFee;
  direction: OrderV2Direction;
  feeSharingNumerator: Maybe<bigint>;
};

export type DexV2CalculateWithdrawAmountOptions = {
  datumReserves: Reserves;
  withdrawalLPAmount: bigint;
  totalLiquidity: bigint;
};

export type DexV2CalculateWithdrawSwapAmountOptions = {
  amountIn: bigint;
  amountOut: bigint;
  reserveIn: bigint;
  reserveOut: bigint;
  expectIORatio: Fraction;
  tradingFeeNumerator: bigint;
};

/* Data types using for DexV2 Action calculation */

export type DexV2CalculateInitialLiquidityOptions = {
  amountA: bigint;
  amountB: bigint;
};

export type DexV2CalculateSwapExactInOptions = DexV2CommonCalculationOptions & {
  amountIn: bigint;
  direction: OrderV2Direction;
  feeSharingNumerator: Maybe<bigint>;
};

export type DexV2CalculateSwapExactInResult = DexV2CommonCalculationResult & {
  amountOut: bigint;
};

export type DexV2CalculateSwapExactOutOptions = DexV2CommonCalculationOptions & {
  expectedReceive: bigint;
  direction: OrderV2Direction;
  feeSharingNumerator: Maybe<bigint>;
};

export type DexV2CalculateSwapExactOutResult = DexV2CommonCalculationResult & {
  necessaryAmountIn: bigint;
};

export type DexV2CalculatePartialSwapOptions = DexV2CommonCalculationOptions & {
  amountIn: bigint;
  direction: OrderV2Direction;
  ioRatio: Fraction;
  feeSharingNumerator: Maybe<bigint>;
};

export type DexV2CalculatePartialSwapResult = DexV2CommonCalculationResult & {
  swapableAmount: bigint;
  amountOut: bigint;
};

export type DexV2CalculateDepositOptions = DexV2CommonCalculationOptions & {
  amountA: bigint;
  amountB: bigint;
  totalLiquidity: bigint;
  feeSharingNumerator: Maybe<bigint>;
};

export type DexV2CalculateDepositResult = DexV2CommonCalculationResult & {
  swapDirection: OrderV2Direction | null;
  lpAmount: bigint;
  newTotalLiquidity: bigint;
};

export type DexV2CalculateWithdrawOptions = Omit<DexV2CommonCalculationOptions, "tradingFee"> & {
  withdrawalLPAmount: bigint;
  totalLiquidity: bigint;
};

export type DexV2CalculateWithdrawResult = DexV2CommonCalculationResult & {
  withdrawalAmountA: bigint;
  withdrawalAmountB: bigint;
  newTotalLiquidity: bigint;
};

export type DexV2CalculateZapOutOptions = DexV2CommonCalculationOptions & {
  withdrawalLPAmount: bigint;
  totalLiquidity: bigint;
  direction: OrderV2Direction;
  feeSharingNumerator: Maybe<bigint>;
};

export type DexV2CalculateZapOutResult = DexV2CommonCalculationResult & {
  amountOut: bigint;
  swapAmount: bigint;
  newTotalLiquidity: bigint;
};

export type DexV2CalculateWithdrawImbalanceOptions = DexV2CommonCalculationOptions & {
  withdrawalLPAmount: bigint;
  totalLiquidity: bigint;
  expectABRatio: Fraction;
  feeSharingNumerator: Maybe<bigint>;
};

export type DexV2CalculateWithdrawImbalanceResult = DexV2CommonCalculationResult & {
  swapDirection: OrderV2Direction | null;
  withdrawalAmountA: bigint;
  withdrawalAmountB: bigint;
  newTotalLiquidity: bigint;
};

export type DexV2CalculateMultiRoutingSwapOptions = {
  amountIn: bigint;
  routings: {
    datumReserves: Reserves;
    valueReserves: Reserves;
    tradingFee: PoolV2BaseFee;
    direction: OrderV2Direction;
    feeSharingNumerator: Maybe<bigint>;
  }[];
};

export type DexV2CalculateMultiRoutingSwapResult = {
  amountOut: bigint;
  poolOuts: {
    datumReserves: Reserves;
    valueReserves: Reserves;
    volume: DexVolume;
    collectedFee: DexV2CollectedFee;
  }[];
  midPrice: BigNumber;
};

export type DexV2CalculateDonationOptions = DexV2CommonCalculationOptions & {
  donateAmountA: bigint;
  donateAmountB: bigint;
};

export type DexV2CalculatePriceImpactOptions =
  | ({ type: "swap_exact_in" } & DexV2CalculateSwapExactInOptions)
  | ({ type: "swap_exact_out" } & DexV2CalculateSwapExactOutOptions)
  | ({ type: "partial_swap" } & DexV2CalculatePartialSwapOptions)
  | ({ type: "deposit" } & DexV2CalculateDepositOptions)
  | ({ type: "zap_out" } & DexV2CalculateZapOutOptions)
  | ({ type: "withdraw_imbalance" } & DexV2CalculateWithdrawImbalanceOptions)
  | ({ type: "routing" } & DexV2CalculateMultiRoutingSwapOptions);

export namespace DexV2Calculation {
  /* Functions using for DexV2 properties calculation */
  export function calculateAmountOut({
    reserveIn,
    reserveOut,
    amountIn,
    tradingFeeNumerator,
  }: DexV2CalculateAmountOutOptions): bigint {
    const diff = DEFAULT_TRADING_FEE_DENOMINATOR - tradingFeeNumerator;
    const inWithFee = diff * amountIn;
    const numerator = inWithFee * reserveOut;
    const denominator = DEFAULT_TRADING_FEE_DENOMINATOR * reserveIn + inWithFee;
    return numerator / denominator;
  }

  export function calculateAmountOutFraction({
    reserveIn,
    reserveOut,
    amountIn,
    tradingFeeNumerator,
  }: DexV2CalculateAmountOutFractionOptions): [bigint, bigint] {
    const [amountInNumerator, amountInDenominator] = amountIn;
    const diff = DEFAULT_TRADING_FEE_DENOMINATOR - tradingFeeNumerator;
    const numerator = amountInNumerator * diff * reserveOut;
    const denominator = DEFAULT_TRADING_FEE_DENOMINATOR * amountInDenominator * reserveIn + amountInNumerator * diff;
    return [numerator, denominator];
  }

  export function calculateAmountIn({
    reserveIn,
    reserveOut,
    amountOut,
    tradingFeeNumerator,
  }: DexV2CalculateAmountInOptions): Result<bigint, Error> {
    if (amountOut >= reserveOut) {
      return Result.err(new Error("Amount Out must be less than Reserve Out"));
    }
    const diff = DEFAULT_TRADING_FEE_DENOMINATOR - tradingFeeNumerator;
    const numerator = reserveIn * amountOut * DEFAULT_TRADING_FEE_DENOMINATOR;
    const denominator = (reserveOut - amountOut) * diff;
    return Result.ok(numerator / denominator + 1n);
  }

  export function calculateEarnedFeeIn({
    amountIn,
    tradingFeeNumerator,
    feeSharingNumerator,
  }: DexV2CalculateEarnedFeeInOptions): {
    tradingFee: bigint;
    feeShare: bigint;
  } {
    const tradingFee = (amountIn * tradingFeeNumerator) / DEFAULT_TRADING_FEE_DENOMINATOR;
    let feeShare: bigint = 0n;
    if (feeSharingNumerator) {
      feeShare =
        (amountIn * tradingFeeNumerator * feeSharingNumerator) /
        (DEFAULT_TRADING_FEE_DENOMINATOR * DEFAULT_TRADING_FEE_DENOMINATOR);
    }

    return {
      tradingFee: tradingFee,
      feeShare: feeShare,
    };
  }

  export function calculateEarnedFeeInFraction({
    amountIn,
    tradingFeeNumerator,
    feeSharingNumerator,
  }: DexV2CalculateEarnedFeeInFractionOptions): {
    tradingFee: bigint;
    feeShare: bigint;
  } {
    const [amountInNumerator, amountInDenominator] = amountIn;
    const tradingFee =
      (amountInNumerator * tradingFeeNumerator) / (amountInDenominator * DEFAULT_TRADING_FEE_DENOMINATOR);
    let feeShare: bigint = 0n;
    if (feeSharingNumerator) {
      feeShare =
        (amountInNumerator * tradingFeeNumerator * feeSharingNumerator) /
        (amountInDenominator * DEFAULT_TRADING_FEE_DENOMINATOR * DEFAULT_TRADING_FEE_DENOMINATOR);
    }

    return {
      tradingFee: tradingFee,
      feeShare: feeShare,
    };
  }

  export function calculateMaxInSwap({
    reserveIn,
    reserveOut,
    tradingFeeNumerator,
    ioRatio,
  }: DexV2CalculateMaxInSwapOptions): bigint {
    const [ioRatioNumerator, ioRatioDenominator] = ioRatio;
    const diff = DEFAULT_TRADING_FEE_DENOMINATOR - tradingFeeNumerator;
    const numerator =
      ioRatioNumerator * diff * reserveOut - ioRatioDenominator * DEFAULT_TRADING_FEE_DENOMINATOR * reserveIn;
    const denominator = ioRatioDenominator * diff;
    const maxInSwap = numerator / denominator;
    return maxInSwap > 0 ? maxInSwap : 0n;
  }

  export function calculateDepositAmount({
    amountA,
    amountB,
    datumReserves,
    totalLiquidity,
    tradingFee,
    feeSharingNumerator,
  }: DexV2CalculateDepositAmountOptions): {
    lpAmount: bigint;
    volume: DexVolume;
    collectedFee: DexV2CollectedFee;
    direction: OrderV2Direction | null;
  } {
    const [datumReserveA, datumReserveB] = [...datumReserves];
    const ratioA = (amountA * totalLiquidity) / datumReserveA;
    const ratioB = (amountB * totalLiquidity) / datumReserveB;
    if (ratioA > ratioB) {
      // Need swap a part of A to B
      const swapAmountA = calculateDepositSwapAmount({
        amountIn: amountA,
        amountOut: amountB,
        reserveIn: datumReserveA,
        reserveOut: datumReserveB,
        tradingFeeNumerator: tradingFee.feeANumerator,
      });
      const [swapAmountANumerator, swapAmountADenominator] = swapAmountA;
      const [receiveAmountBNumerator, receiveAmountBDenominator] = calculateAmountOutFraction({
        reserveIn: datumReserveA,
        reserveOut: datumReserveB,
        amountIn: swapAmountA,
        tradingFeeNumerator: tradingFee.feeANumerator,
      });
      const { tradingFee: tradingFeeA, feeShare: feeShareA } = calculateEarnedFeeInFraction({
        amountIn: swapAmountA,
        tradingFeeNumerator: tradingFee.feeANumerator,
        feeSharingNumerator: feeSharingNumerator,
      });
      const lpAmount =
        ((amountA * swapAmountADenominator - swapAmountANumerator) * totalLiquidity) /
        (datumReserveA * swapAmountADenominator + swapAmountANumerator);
      const volumeA = swapAmountA[0] / swapAmountA[1];
      return {
        lpAmount: lpAmount,
        volume: {
          volumeA: volumeA,
          volumeB: receiveAmountBNumerator / receiveAmountBDenominator,
        },
        collectedFee: {
          tradingFeeA: tradingFeeA,
          tradingFeeB: 0n,
          feeShareA: feeShareA,
          feeShareB: 0n,
        },
        direction: OrderV2Direction.A_TO_B,
      };
    } else if (ratioA < ratioB) {
      // Need swap a part of B to A
      const swapAmountB = calculateDepositSwapAmount({
        amountIn: amountB,
        amountOut: amountA,
        reserveIn: datumReserveB,
        reserveOut: datumReserveA,
        tradingFeeNumerator: tradingFee.feeBNumerator,
      });
      const [swapAmountBNumerator, swapAmountBDenominator] = swapAmountB;
      const [receiveAmountANumerator, receiveAmountADenominator] = calculateAmountOutFraction({
        reserveIn: datumReserveB,
        reserveOut: datumReserveA,
        amountIn: swapAmountB,
        tradingFeeNumerator: tradingFee.feeBNumerator,
      });
      const { tradingFee: tradingFeeB, feeShare: feeShareB } = calculateEarnedFeeInFraction({
        amountIn: swapAmountB,
        tradingFeeNumerator: tradingFee.feeBNumerator,
        feeSharingNumerator: feeSharingNumerator,
      });
      const lpAmount =
        ((amountB * swapAmountBDenominator - swapAmountBNumerator) * totalLiquidity) /
        (datumReserveB * swapAmountBDenominator + swapAmountBNumerator);
      const volumeB = swapAmountB[0] / swapAmountB[1];
      return {
        lpAmount: lpAmount,
        volume: {
          volumeA: receiveAmountANumerator / receiveAmountADenominator,
          volumeB: volumeB,
        },
        collectedFee: {
          tradingFeeA: 0n,
          tradingFeeB: tradingFeeB,
          feeShareA: 0n,
          feeShareB: feeShareB,
        },
        direction: OrderV2Direction.B_TO_A,
      };
    } else {
      return {
        lpAmount: ratioA,
        collectedFee: {
          tradingFeeA: 0n,
          tradingFeeB: 0n,
          feeShareA: 0n,
          feeShareB: 0n,
        },
        direction: null,
        volume: { volumeA: 0n, volumeB: 0n },
      };
    }
  }

  export function calculateDepositSwapAmount({
    amountIn,
    amountOut,
    reserveIn,
    reserveOut,
    tradingFeeNumerator,
  }: DexV2CalculateDepositSwapAmountOptions): Fraction {
    const x = (amountOut + reserveOut) * reserveIn;
    const y = 4n * (amountOut + reserveOut) * (amountOut * reserveIn * reserveIn - amountIn * reserveIn * reserveOut);
    const z = 2n * (amountOut + reserveOut);
    const a =
      bigIntPow(x) * bigIntPow(2n * DEFAULT_TRADING_FEE_DENOMINATOR - tradingFeeNumerator) -
      y * DEFAULT_TRADING_FEE_DENOMINATOR * (DEFAULT_TRADING_FEE_DENOMINATOR - tradingFeeNumerator);
    const b = (2n * DEFAULT_TRADING_FEE_DENOMINATOR - tradingFeeNumerator) * x;
    const numerator = sqrt(a) - b;
    const denominator = z * (DEFAULT_TRADING_FEE_DENOMINATOR - tradingFeeNumerator);
    return [numerator, denominator];
  }

  export function calculateWithdrawAmount({
    withdrawalLPAmount,
    datumReserves,
    totalLiquidity,
  }: DexV2CalculateWithdrawAmountOptions): {
    withdrawalA: bigint;
    withdrawalB: bigint;
  } {
    const [datumReserveA, datumReserveB] = [...datumReserves];
    const amountA = (withdrawalLPAmount * datumReserveA) / totalLiquidity;
    const amountB = (withdrawalLPAmount * datumReserveB) / totalLiquidity;
    return {
      withdrawalA: amountA,
      withdrawalB: amountB,
    };
  }

  export function calculateZapOutAmount({
    withdrawalLPAmount,
    datumReserves,
    totalLiquidity,
    direction,
    tradingFee,
    feeSharingNumerator,
  }: DexV2CalculateZapOutAmountOptions): {
    amountOut: bigint;
    volume: DexVolume;
    collectedFee: DexV2CollectedFee;
    swapAmount: bigint;
  } {
    const [datumReserveA, datumReserveB] = [...datumReserves];
    const { withdrawalA, withdrawalB } = calculateWithdrawAmount({
      withdrawalLPAmount: withdrawalLPAmount,
      datumReserves: datumReserves,
      totalLiquidity: totalLiquidity,
    });

    const reserveAAfterWithdraw = datumReserveA - withdrawalA;
    const reserveBAfterWithdraw = datumReserveB - withdrawalB;
    let amountOut = 0n;
    switch (direction) {
      case OrderV2Direction.A_TO_B: {
        const extraAmountOut = calculateAmountOut({
          amountIn: withdrawalA,
          reserveIn: reserveAAfterWithdraw,
          reserveOut: reserveBAfterWithdraw,
          tradingFeeNumerator: tradingFee.feeANumerator,
        });
        const { tradingFee: tradingFeeA, feeShare: feeShareA } = calculateEarnedFeeIn({
          amountIn: withdrawalA,
          tradingFeeNumerator: tradingFee.feeANumerator,
          feeSharingNumerator: feeSharingNumerator,
        });
        amountOut = withdrawalB + extraAmountOut;
        return {
          amountOut: amountOut,
          swapAmount: withdrawalA,
          volume: {
            volumeA: withdrawalA,
            volumeB: extraAmountOut,
          },
          collectedFee: {
            tradingFeeA: tradingFeeA,
            tradingFeeB: 0n,
            feeShareA: feeShareA,
            feeShareB: 0n,
          },
        };
      }
      case OrderV2Direction.B_TO_A: {
        const extraAmountOut = calculateAmountOut({
          amountIn: withdrawalB,
          reserveIn: reserveBAfterWithdraw,
          reserveOut: reserveAAfterWithdraw,
          tradingFeeNumerator: tradingFee.feeBNumerator,
        });
        const { tradingFee: tradingFeeB, feeShare: feeShareB } = calculateEarnedFeeIn({
          amountIn: withdrawalB,
          tradingFeeNumerator: tradingFee.feeBNumerator,
          feeSharingNumerator: feeSharingNumerator,
        });
        amountOut = withdrawalA + extraAmountOut;
        return {
          amountOut: amountOut,
          swapAmount: withdrawalB,
          volume: {
            volumeA: extraAmountOut,
            volumeB: withdrawalB,
          },
          collectedFee: {
            tradingFeeA: 0n,
            tradingFeeB: tradingFeeB,
            feeShareA: 0n,
            feeShareB: feeShareB,
          },
        };
      }
    }
  }

  /* Functions using for DexV2 Action calculation */

  export function calculateInitialLiquidity({ amountA, amountB }: DexV2CalculateInitialLiquidityOptions): bigint {
    let x = sqrt(amountA * amountB);
    if (x * x < amountA * amountB) {
      x += 1n;
    }
    return x;
  }

  export function calculateSwapExactIn({
    datumReserves,
    valueReserves,
    tradingFee,
    amountIn,
    direction,
    feeSharingNumerator,
  }: DexV2CalculateSwapExactInOptions): DexV2CalculateSwapExactInResult {
    const [datumReserveA, datumReserveB] = [...datumReserves];
    const [valueReserveA, valueReserveB] = [...valueReserves];
    const [reserveIn, reserveOut, tradingFeeNumIn] =
      direction === OrderV2Direction.A_TO_B
        ? [datumReserveA, datumReserveB, tradingFee.feeANumerator]
        : [datumReserveB, datumReserveA, tradingFee.feeBNumerator];
    const amountOut = calculateAmountOut({
      amountIn: amountIn,
      reserveIn: reserveIn,
      reserveOut: reserveOut,
      tradingFeeNumerator: tradingFeeNumIn,
    });
    const { tradingFee: tradingFeeIn, feeShare: feeShareIn } = calculateEarnedFeeIn({
      amountIn: amountIn,
      tradingFeeNumerator: tradingFeeNumIn,
      feeSharingNumerator: feeSharingNumerator,
    });
    let newDatumReserveA: bigint;
    let newDatumReserveB: bigint;
    let newValueReserveA: bigint;
    let newValueReserveB: bigint;
    let volume: DexVolume;
    let collectedFee: DexV2CollectedFee;
    switch (direction) {
      case OrderV2Direction.A_TO_B: {
        newDatumReserveA = datumReserveA + amountIn - feeShareIn;
        newDatumReserveB = datumReserveB - amountOut;
        newValueReserveA = valueReserveA + amountIn;
        newValueReserveB = valueReserveB - amountOut;
        volume = {
          volumeA: amountIn,
          volumeB: amountOut,
        };
        collectedFee = {
          tradingFeeA: tradingFeeIn,
          tradingFeeB: 0n,
          feeShareA: feeShareIn,
          feeShareB: 0n,
        };
        break;
      }
      case OrderV2Direction.B_TO_A: {
        newDatumReserveA = datumReserveA - amountOut;
        newDatumReserveB = datumReserveB + amountIn - feeShareIn;
        newValueReserveA = valueReserveA - amountOut;
        newValueReserveB = valueReserveB + amountIn;
        volume = {
          volumeA: amountOut,
          volumeB: amountIn,
        };
        collectedFee = {
          tradingFeeA: 0n,
          tradingFeeB: tradingFeeIn,
          feeShareA: 0n,
          feeShareB: feeShareIn,
        };
        break;
      }
    }
    return {
      newDatumReserves: [newDatumReserveA, newDatumReserveB],
      newValueReserves: [newValueReserveA, newValueReserveB],
      amountOut: amountOut,
      volume: volume,
      collectedFee: collectedFee,
    };
  }

  export function calculateSwapExactOut({
    datumReserves,
    valueReserves,
    tradingFee,
    expectedReceive,
    direction,
    feeSharingNumerator,
  }: DexV2CalculateSwapExactOutOptions): Result<DexV2CalculateSwapExactOutResult, Error> {
    const [datumReserveA, datumReserveB] = [...datumReserves];
    const [valueReserveA, valueReserveB] = [...valueReserves];
    const [reserveIn, reserveOut, tradingFeeNumIn] =
      direction === OrderV2Direction.A_TO_B
        ? [datumReserveA, datumReserveB, tradingFee.feeANumerator]
        : [datumReserveB, datumReserveA, tradingFee.feeBNumerator];

    const necessaryAmountInResult = calculateAmountIn({
      reserveIn: reserveIn,
      reserveOut: reserveOut,
      tradingFeeNumerator: tradingFeeNumIn,
      amountOut: expectedReceive,
    });

    if (necessaryAmountInResult.type === "err") {
      return necessaryAmountInResult;
    }

    const necessaryAmountIn = necessaryAmountInResult.value;
    const { tradingFee: tradingFeeIn, feeShare: feeShareIn } = calculateEarnedFeeIn({
      amountIn: necessaryAmountIn,
      tradingFeeNumerator: tradingFeeNumIn,
      feeSharingNumerator: feeSharingNumerator,
    });

    let newDatumReserveA: bigint;
    let newDatumReserveB: bigint;
    let newValueReserveA: bigint;
    let newValueReserveB: bigint;
    let volume: DexVolume;
    let collectedFee: DexV2CollectedFee;
    switch (direction) {
      case OrderV2Direction.A_TO_B: {
        newDatumReserveA = datumReserveA + necessaryAmountIn - feeShareIn;
        newDatumReserveB = datumReserveB - expectedReceive;
        newValueReserveA = valueReserveA + necessaryAmountIn;
        newValueReserveB = valueReserveB - expectedReceive;
        volume = {
          volumeA: necessaryAmountIn,
          volumeB: expectedReceive,
        };
        collectedFee = {
          tradingFeeA: tradingFeeIn,
          tradingFeeB: 0n,
          feeShareA: feeShareIn,
          feeShareB: 0n,
        };
        break;
      }
      case OrderV2Direction.B_TO_A: {
        newDatumReserveA = datumReserveA - expectedReceive;
        newDatumReserveB = datumReserveB + necessaryAmountIn - feeShareIn;
        newValueReserveA = valueReserveA - expectedReceive;
        newValueReserveB = valueReserveB + necessaryAmountIn;
        volume = {
          volumeA: expectedReceive,
          volumeB: necessaryAmountIn,
        };
        collectedFee = {
          tradingFeeA: 0n,
          tradingFeeB: tradingFeeIn,
          feeShareA: 0n,
          feeShareB: feeShareIn,
        };
        break;
      }
    }

    const result: DexV2CalculateSwapExactOutResult = {
      newDatumReserves: [newDatumReserveA, newDatumReserveB],
      newValueReserves: [newValueReserveA, newValueReserveB],
      necessaryAmountIn: necessaryAmountIn,
      volume: volume,
      collectedFee: collectedFee,
    };

    return Result.ok(result);
  }

  export function calculateWithdraw({
    withdrawalLPAmount,
    datumReserves,
    valueReserves,
    totalLiquidity,
  }: DexV2CalculateWithdrawOptions): DexV2CalculateWithdrawResult {
    const [datumReserveA, datumReserveB] = [...datumReserves];
    const [valueReserveA, valueReserveB] = [...valueReserves];
    const { withdrawalA, withdrawalB } = calculateWithdrawAmount({
      withdrawalLPAmount: withdrawalLPAmount,
      datumReserves: datumReserves,
      totalLiquidity: totalLiquidity,
    });
    return {
      withdrawalAmountA: withdrawalA,
      withdrawalAmountB: withdrawalB,
      newDatumReserves: [datumReserveA - withdrawalA, datumReserveB - withdrawalB],
      newValueReserves: [valueReserveA - withdrawalA, valueReserveB - withdrawalB],
      newTotalLiquidity: totalLiquidity - withdrawalLPAmount,
      volume: { volumeA: 0n, volumeB: 0n },
      collectedFee: {
        tradingFeeA: 0n,
        tradingFeeB: 0n,
        feeShareA: 0n,
        feeShareB: 0n,
      },
    };
  }

  export function calculateZapOut({
    datumReserves,
    valueReserves,
    totalLiquidity,
    withdrawalLPAmount,
    tradingFee,
    direction,
    feeSharingNumerator,
  }: DexV2CalculateZapOutOptions): DexV2CalculateZapOutResult {
    const [datumReserveA, datumReserveB] = [...datumReserves];
    const [valueReserveA, valueReserveB] = [...valueReserves];

    const { amountOut, volume, collectedFee, swapAmount } = calculateZapOutAmount({
      withdrawalLPAmount: withdrawalLPAmount,
      datumReserves: datumReserves,
      totalLiquidity: totalLiquidity,
      direction: direction,
      tradingFee: tradingFee,
      feeSharingNumerator: feeSharingNumerator,
    });

    const { feeShareA, feeShareB } = collectedFee;

    let newDatumReserveA: bigint;
    let newDatumReserveB: bigint;
    let newValueReserveA: bigint;
    let newValueReserveB: bigint;
    switch (direction) {
      case OrderV2Direction.A_TO_B: {
        newDatumReserveA = datumReserveA - feeShareA;
        newDatumReserveB = datumReserveB - amountOut - feeShareB;
        newValueReserveA = valueReserveA;
        newValueReserveB = valueReserveB - amountOut;
        break;
      }
      case OrderV2Direction.B_TO_A: {
        newDatumReserveA = datumReserveA - amountOut - feeShareA;
        newDatumReserveB = datumReserveB - feeShareB;
        newValueReserveA = valueReserveA - amountOut;
        newValueReserveB = valueReserveB;
        break;
      }
    }

    return {
      newDatumReserves: [newDatumReserveA, newDatumReserveB],
      newValueReserves: [newValueReserveA, newValueReserveB],
      amountOut: amountOut,
      swapAmount: swapAmount,
      newTotalLiquidity: totalLiquidity - withdrawalLPAmount,
      volume: volume,
      collectedFee: collectedFee,
    };
  }

  export function calculateDeposit({
    datumReserves,
    valueReserves,
    tradingFee,
    amountA,
    amountB,
    totalLiquidity,
    feeSharingNumerator,
  }: DexV2CalculateDepositOptions): DexV2CalculateDepositResult {
    const [datumReserveA, datumReserveB] = [...datumReserves];
    const [valueReserveA, valueReserveB] = [...valueReserves];
    const { lpAmount, volume, collectedFee, direction } = calculateDepositAmount({
      amountA: amountA,
      amountB: amountB,
      datumReserves: datumReserves,
      totalLiquidity: totalLiquidity,
      tradingFee: tradingFee,
      feeSharingNumerator: feeSharingNumerator,
    });

    const { feeShareA, feeShareB } = collectedFee;

    const newDatumReserveA = datumReserveA + amountA - feeShareA;
    const newDatumReserveB = datumReserveB + amountB - feeShareB;
    const newValueReserveA = valueReserveA + amountA;
    const newValueReserveB = valueReserveB + amountB;

    return {
      newDatumReserves: [newDatumReserveA, newDatumReserveB],
      newValueReserves: [newValueReserveA, newValueReserveB],
      newTotalLiquidity: totalLiquidity + lpAmount,
      lpAmount: lpAmount,
      volume: volume,
      swapDirection: direction,
      collectedFee: collectedFee,
    };
  }

  export function calculateSwapMultiRouting({
    amountIn,
    routings,
  }: DexV2CalculateMultiRoutingSwapOptions): DexV2CalculateMultiRoutingSwapResult {
    let tempAmountIn = amountIn;
    let tempAmountOut = 0n;
    const newPoolOuts: {
      datumReserves: Reserves;
      valueReserves: Reserves;
      volume: DexVolume;
      collectedFee: DexV2CollectedFee;
    }[] = [];
    let midPrice = new BigNumber(1);
    for (const routing of routings) {
      const { datumReserves, valueReserves, direction, tradingFee, feeSharingNumerator } = routing;
      const [datumReserveA, datumReserveB] = [...datumReserves];
      const [valueReserveA, valueReserveB] = [...valueReserves];
      const [reserveIn, reserveOut, tradingFeeNumIn] =
        direction === OrderV2Direction.A_TO_B
          ? [datumReserveA, datumReserveB, tradingFee.feeANumerator]
          : [datumReserveB, datumReserveA, tradingFee.feeBNumerator];
      const amountOut = calculateAmountOut({
        amountIn: tempAmountIn,
        reserveIn: reserveIn,
        reserveOut: reserveOut,
        tradingFeeNumerator: tradingFeeNumIn,
      });

      midPrice = midPrice.multipliedBy(reserveIn.toString()).div(reserveOut.toString());

      const { tradingFee: tradingFeeIn, feeShare: feeShareIn } = calculateEarnedFeeIn({
        amountIn: tempAmountIn,
        tradingFeeNumerator: tradingFeeNumIn,
        feeSharingNumerator: feeSharingNumerator,
      });
      let newDatumReserveA: bigint;
      let newDatumReserveB: bigint;
      let newValueReserveA: bigint;
      let newValueReserveB: bigint;
      let volume: DexVolume;
      let collectedFee: DexV2CollectedFee;
      switch (direction) {
        case OrderV2Direction.A_TO_B: {
          newDatumReserveA = datumReserveA + tempAmountIn - feeShareIn;
          newDatumReserveB = datumReserveB - amountOut;
          newValueReserveA = valueReserveA + tempAmountIn;
          newValueReserveB = valueReserveB - amountOut;
          volume = {
            volumeA: tempAmountIn,
            volumeB: amountOut,
          };
          collectedFee = {
            tradingFeeA: tradingFeeIn,
            tradingFeeB: 0n,
            feeShareA: feeShareIn,
            feeShareB: 0n,
          };
          break;
        }
        case OrderV2Direction.B_TO_A: {
          newDatumReserveA = datumReserveA - amountOut;
          newDatumReserveB = datumReserveB + tempAmountIn - feeShareIn;
          newValueReserveA = valueReserveA - amountOut;
          newValueReserveB = valueReserveB + tempAmountIn;
          volume = {
            volumeA: amountOut,
            volumeB: tempAmountIn,
          };
          collectedFee = {
            tradingFeeA: 0n,
            tradingFeeB: tradingFeeIn,
            feeShareA: 0n,
            feeShareB: feeShareIn,
          };
          break;
        }
      }
      tempAmountIn = amountOut;
      tempAmountOut = amountOut;
      newPoolOuts.push({
        datumReserves: [newDatumReserveA, newDatumReserveB],
        valueReserves: [newValueReserveA, newValueReserveB],
        volume: volume,
        collectedFee: collectedFee,
      });
    }

    return {
      amountOut: tempAmountOut,
      poolOuts: newPoolOuts,
      midPrice: midPrice,
    };
  }

  export function calculatePartialSwap({
    datumReserves,
    valueReserves,
    tradingFee,
    amountIn,
    direction,
    ioRatio,
    feeSharingNumerator,
  }: DexV2CalculatePartialSwapOptions): Result<DexV2CalculatePartialSwapResult, Error> {
    const [datumReserveA, datumReserveB] = [...datumReserves];
    const [valueReserveA, valueReserveB] = [...valueReserves];
    const [reserveIn, reserveOut, tradingFeeNumIn] =
      direction === OrderV2Direction.A_TO_B
        ? [datumReserveA, datumReserveB, tradingFee.feeANumerator]
        : [datumReserveB, datumReserveA, tradingFee.feeBNumerator];
    const maxInSwap = calculateMaxInSwap({
      reserveIn: reserveIn,
      reserveOut: reserveOut,
      tradingFeeNumerator: tradingFeeNumIn,
      ioRatio: ioRatio,
    });
    if (maxInSwap <= 0n) {
      return Result.err(new Error("Maximum swap amount is zero"));
    }

    const swapable = amountIn > maxInSwap ? maxInSwap : amountIn;
    const amountOut = calculateAmountOut({
      amountIn: swapable,
      reserveIn: reserveIn,
      reserveOut: reserveOut,
      tradingFeeNumerator: tradingFeeNumIn,
    });

    const { tradingFee: tradingFeeIn, feeShare: feeShareIn } = calculateEarnedFeeIn({
      amountIn: swapable,
      tradingFeeNumerator: tradingFeeNumIn,
      feeSharingNumerator: feeSharingNumerator,
    });

    let newDatumReserveA: bigint;
    let newDatumReserveB: bigint;
    let newValueReserveA: bigint;
    let newValueReserveB: bigint;
    let volume: DexVolume;
    let collectedFee: DexV2CollectedFee;
    switch (direction) {
      case OrderV2Direction.A_TO_B: {
        newDatumReserveA = datumReserveA + swapable - feeShareIn;
        newDatumReserveB = datumReserveB - amountOut;
        newValueReserveA = valueReserveA + swapable;
        newValueReserveB = valueReserveB - amountOut;
        volume = {
          volumeA: swapable,
          volumeB: amountOut,
        };
        collectedFee = {
          tradingFeeA: tradingFeeIn,
          tradingFeeB: 0n,
          feeShareA: feeShareIn,
          feeShareB: 0n,
        };
        break;
      }
      case OrderV2Direction.B_TO_A: {
        newDatumReserveA = datumReserveA - amountOut;
        newDatumReserveB = datumReserveB + swapable - feeShareIn;
        newValueReserveA = valueReserveA - amountOut;
        newValueReserveB = valueReserveB + swapable;
        volume = {
          volumeA: amountOut,
          volumeB: swapable,
        };
        collectedFee = {
          tradingFeeA: 0n,
          tradingFeeB: tradingFeeIn,
          feeShareA: 0n,
          feeShareB: feeShareIn,
        };
        break;
      }
    }

    const result: DexV2CalculatePartialSwapResult = {
      newDatumReserves: [newDatumReserveA, newDatumReserveB],
      newValueReserves: [newValueReserveA, newValueReserveB],
      amountOut: amountOut,
      swapableAmount: swapable,
      volume: volume,
      collectedFee: collectedFee,
    };
    return Result.ok(result);
  }

  export function calculateWithdrawSwapAmount({
    amountIn,
    amountOut,
    reserveIn,
    reserveOut,
    expectIORatio,
    tradingFeeNumerator,
  }: DexV2CalculateWithdrawSwapAmountOptions): bigint {
    const [expectIORatioNumerator, expectIORatioDenominator] = expectIORatio;
    const diff = DEFAULT_TRADING_FEE_DENOMINATOR - tradingFeeNumerator;
    const a = expectIORatioDenominator * diff;
    const b =
      expectIORatioNumerator * diff * (reserveOut + amountOut) +
      expectIORatioDenominator * (reserveIn * DEFAULT_TRADING_FEE_DENOMINATOR - diff * amountIn);
    const c =
      DEFAULT_TRADING_FEE_DENOMINATOR *
      reserveIn *
      (expectIORatioNumerator * amountOut - expectIORatioDenominator * amountIn);
    // a*x^2+b*x+c=0
    // delta = b^2 - 4ac
    // x = (-b +sqrt(delta))/(2*a) or (-b - sqrt(delta))/(2*a)
    const delta = b * b - 4n * a * c;
    return (sqrt(delta) - b) / (2n * a);
  }

  export function calculateWithdrawImbalance({
    datumReserves,
    valueReserves,
    tradingFee,
    expectABRatio,
    withdrawalLPAmount,
    totalLiquidity,
    feeSharingNumerator,
  }: DexV2CalculateWithdrawImbalanceOptions): DexV2CalculateWithdrawImbalanceResult {
    const [datumReserveA, datumReserveB] = [...datumReserves];
    const [valueReserveA, valueReserveB] = [...valueReserves];
    const [expectABRatioNumerator, expectABRatioDenominator] = expectABRatio;
    const { withdrawalA, withdrawalB } = calculateWithdrawAmount({
      withdrawalLPAmount: withdrawalLPAmount,
      datumReserves: datumReserves,
      totalLiquidity: totalLiquidity,
    });

    const reserveAAfterWithdraw = datumReserveA - withdrawalA;
    const reserveBAfterWithdraw = datumReserveB - withdrawalB;
    const ratioA = withdrawalA * expectABRatioDenominator;
    const ratioB = withdrawalB * expectABRatioNumerator;

    if (ratioA > ratioB) {
      const swapAmountA = calculateWithdrawSwapAmount({
        amountIn: withdrawalA,
        amountOut: withdrawalB,
        reserveIn: reserveAAfterWithdraw,
        reserveOut: reserveBAfterWithdraw,
        expectIORatio: expectABRatio,
        tradingFeeNumerator: tradingFee.feeANumerator,
      });
      const receiveAmountB = calculateAmountOut({
        reserveIn: reserveAAfterWithdraw,
        reserveOut: reserveBAfterWithdraw,
        amountIn: swapAmountA,
        tradingFeeNumerator: tradingFee.feeANumerator,
      });
      const { tradingFee: tradingFeeA, feeShare: feeShareA } = calculateEarnedFeeIn({
        amountIn: swapAmountA,
        tradingFeeNumerator: tradingFee.feeANumerator,
        feeSharingNumerator: feeSharingNumerator,
      });
      const realWithdrawalA = withdrawalA - swapAmountA;
      const realWithdrawalB = withdrawalB + receiveAmountB;
      return {
        withdrawalAmountA: realWithdrawalA,
        withdrawalAmountB: realWithdrawalB,
        newDatumReserves: [datumReserveA - realWithdrawalA - feeShareA, datumReserveB - realWithdrawalB],
        newValueReserves: [valueReserveA - realWithdrawalA, valueReserveB - realWithdrawalB],
        newTotalLiquidity: totalLiquidity - withdrawalLPAmount,
        volume: {
          volumeA: swapAmountA,
          volumeB: receiveAmountB,
        },
        swapDirection: OrderV2Direction.A_TO_B,
        collectedFee: {
          tradingFeeA: tradingFeeA,
          tradingFeeB: 0n,
          feeShareA: feeShareA,
          feeShareB: 0n,
        },
      };
    } else if (ratioA < ratioB) {
      const swapAmountB = calculateWithdrawSwapAmount({
        amountIn: withdrawalB,
        amountOut: withdrawalA,
        reserveIn: reserveBAfterWithdraw,
        reserveOut: reserveAAfterWithdraw,
        expectIORatio: [expectABRatioDenominator, expectABRatioNumerator],
        tradingFeeNumerator: tradingFee.feeBNumerator,
      });
      const receiveAmountA = calculateAmountOut({
        reserveIn: reserveBAfterWithdraw,
        reserveOut: reserveAAfterWithdraw,
        amountIn: swapAmountB,
        tradingFeeNumerator: tradingFee.feeBNumerator,
      });
      const { tradingFee: tradingFeeB, feeShare: feeShareB } = calculateEarnedFeeIn({
        amountIn: swapAmountB,
        tradingFeeNumerator: tradingFee.feeBNumerator,
        feeSharingNumerator: feeSharingNumerator,
      });
      const realWithdrawalA = withdrawalA + receiveAmountA;
      const realWithdrawalB = withdrawalB - swapAmountB;
      return {
        withdrawalAmountA: realWithdrawalA,
        withdrawalAmountB: realWithdrawalB,
        newDatumReserves: [datumReserveA - realWithdrawalA, datumReserveB - realWithdrawalB - feeShareB],
        newValueReserves: [valueReserveA - realWithdrawalA, valueReserveB - realWithdrawalB],
        newTotalLiquidity: totalLiquidity - withdrawalLPAmount,
        volume: {
          volumeA: receiveAmountA,
          volumeB: swapAmountB,
        },
        swapDirection: OrderV2Direction.B_TO_A,
        collectedFee: {
          tradingFeeA: 0n,
          tradingFeeB: tradingFeeB,
          feeShareA: 0n,
          feeShareB: feeShareB,
        },
      };
    } else {
      return {
        withdrawalAmountA: withdrawalA,
        withdrawalAmountB: withdrawalB,
        newDatumReserves: [datumReserveA - withdrawalA, datumReserveB - withdrawalB],
        newValueReserves: [valueReserveA - withdrawalA, valueReserveB - withdrawalB],
        newTotalLiquidity: totalLiquidity - withdrawalLPAmount,
        volume: { volumeA: 0n, volumeB: 0n },
        swapDirection: null,
        collectedFee: {
          tradingFeeA: 0n,
          tradingFeeB: 0n,
          feeShareA: 0n,
          feeShareB: 0n,
        },
      };
    }
  }

  // TODO: calculate volume and update direction
  export function calculateDonation({
    datumReserves,
    valueReserves,
    donateAmountA,
    donateAmountB,
  }: DexV2CalculateDonationOptions): DexV2CommonCalculationResult {
    const [datumReserveA, datumReserveB] = [...datumReserves];
    const [valueReserveA, valueReserveB] = [...valueReserves];
    return {
      newDatumReserves: [datumReserveA + donateAmountA, datumReserveB + donateAmountB],
      newValueReserves: [valueReserveA + donateAmountA, valueReserveB + donateAmountB],
      volume: { volumeA: 0n, volumeB: 0n },
      collectedFee: {
        tradingFeeA: 0n,
        tradingFeeB: 0n,
        feeShareA: 0n,
        feeShareB: 0n,
      },
    };
  }

  export function calculatePoolFee({
    tradingFeeANum,
    tradingFeeBNum,
    feeSharingNum,
  }: {
    tradingFeeANum: bigint;
    tradingFeeBNum: bigint;
    feeSharingNum?: bigint;
  }): {
    feeA: PoolFee;
    feeB: PoolFee;
  } {
    const tradingFeeA = new BigNumber(tradingFeeANum.toString()).div(DEFAULT_TRADING_FEE_DENOMINATOR.toString());
    const feeSharingPercentOfTradingFeeA = feeSharingNum
      ? new BigNumber(feeSharingNum.toString()).div(DEFAULT_TRADING_FEE_DENOMINATOR.toString())
      : new BigNumber(0);
    const feeSharingA = tradingFeeA.multipliedBy(feeSharingPercentOfTradingFeeA);
    const lpFeeA = tradingFeeA.minus(feeSharingA);

    const tradingFeeB = new BigNumber(tradingFeeBNum.toString()).div(DEFAULT_TRADING_FEE_DENOMINATOR.toString());
    const feeSharingPercentOfTradingFeeB = feeSharingNum
      ? new BigNumber(feeSharingNum.toString()).div(DEFAULT_TRADING_FEE_DENOMINATOR.toString())
      : new BigNumber(0);
    const feeSharingB = tradingFeeB.multipliedBy(feeSharingPercentOfTradingFeeB);
    const lpFeeB = tradingFeeB.minus(feeSharingB);
    return {
      feeA: {
        tradingFee: tradingFeeA.multipliedBy(100).toNumber(),
        feeSharing: feeSharingA.multipliedBy(100).toNumber(),
        lpFee: lpFeeA.multipliedBy(100).toNumber(),
      },
      feeB: {
        tradingFee: tradingFeeB.multipliedBy(100).toNumber(),
        feeSharing: feeSharingB.multipliedBy(100).toNumber(),
        lpFee: lpFeeB.multipliedBy(100).toNumber(),
      },
    };
  }

  /**
   * Price impact is the difference between the current market price and the price you will actually pay when performing a swap on a decentralized exchange.
   */
  export function calculatePriceImpact(options: DexV2CalculatePriceImpactOptions): Result<number, Error> {
    let marketPrice: BigNumber;
    let executionPrice: BigNumber;
    switch (options.type) {
      case "swap_exact_in": {
        const { direction, datumReserves, amountIn } = options;
        marketPrice =
          direction === OrderV2Direction.A_TO_B
            ? new BigNumber(datumReserves[0].toString()).div(datumReserves[1].toString())
            : new BigNumber(datumReserves[1].toString()).div(datumReserves[0].toString());

        const { amountOut } = calculateSwapExactIn(options);
        executionPrice = new BigNumber(amountIn.toString()).div(amountOut.toString());
        break;
      }
      case "swap_exact_out": {
        const { direction, datumReserves, expectedReceive } = options;
        marketPrice =
          direction === OrderV2Direction.A_TO_B
            ? new BigNumber(datumReserves[0].toString()).div(datumReserves[1].toString())
            : new BigNumber(datumReserves[1].toString()).div(datumReserves[0].toString());

        const calculationResult = calculateSwapExactOut(options);
        if (calculationResult.type === "err") {
          return calculationResult;
        }
        const { necessaryAmountIn } = calculationResult.value;
        executionPrice = new BigNumber(necessaryAmountIn.toString()).div(expectedReceive.toString());
        break;
      }
      case "partial_swap": {
        const { direction, datumReserves } = options;
        marketPrice =
          direction === OrderV2Direction.A_TO_B
            ? new BigNumber(datumReserves[0].toString()).div(datumReserves[1].toString())
            : new BigNumber(datumReserves[1].toString()).div(datumReserves[0].toString());

        const calculationResult = calculatePartialSwap(options);
        if (calculationResult.type === "err") {
          return calculationResult;
        }
        const { swapableAmount, amountOut } = calculationResult.value;
        executionPrice = new BigNumber(swapableAmount.toString()).div(amountOut.toString());
        break;
      }
      case "deposit": {
        const { datumReserves } = options;
        const { swapDirection, volume } = calculateDeposit(options);
        if (!swapDirection) {
          return Result.ok(0);
        }
        if (swapDirection === OrderV2Direction.A_TO_B) {
          marketPrice = new BigNumber(datumReserves[0].toString()).div(datumReserves[1].toString());
          executionPrice = new BigNumber(volume.volumeA.toString()).div(volume.volumeB.toString());
        } else {
          marketPrice = new BigNumber(datumReserves[1].toString()).div(datumReserves[0].toString());
          executionPrice = new BigNumber(volume.volumeB.toString()).div(volume.volumeA.toString());
        }
        break;
      }
      case "withdraw_imbalance": {
        const { datumReserves } = options;
        const { swapDirection, volume } = calculateWithdrawImbalance(options);
        if (!swapDirection) {
          return Result.ok(0);
        }
        if (swapDirection === OrderV2Direction.A_TO_B) {
          marketPrice = new BigNumber(datumReserves[0].toString()).div(datumReserves[1].toString());
          executionPrice = new BigNumber(volume.volumeA.toString()).div(volume.volumeB.toString());
        } else {
          marketPrice = new BigNumber(datumReserves[1].toString()).div(datumReserves[0].toString());
          executionPrice = new BigNumber(volume.volumeB.toString()).div(volume.volumeA.toString());
        }
        break;
      }
      case "zap_out": {
        const { datumReserves, direction } = options;
        const { swapAmount, amountOut } = calculateZapOut(options);
        marketPrice =
          direction === OrderV2Direction.A_TO_B
            ? new BigNumber(datumReserves[0].toString()).div(datumReserves[1].toString())
            : new BigNumber(datumReserves[1].toString()).div(datumReserves[0].toString());
        executionPrice = new BigNumber(swapAmount.toString()).div(amountOut.toString());
        break;
      }
      case "routing": {
        const { amountIn } = options;
        const { amountOut, midPrice } = calculateSwapMultiRouting(options);
        marketPrice = midPrice;
        executionPrice = new BigNumber(amountIn.toString()).div(amountOut.toString());
        break;
      }
    }
    const priceImpactBN = new BigNumber(1).minus(marketPrice.div(executionPrice)).abs().multipliedBy(100);
    if (!priceImpactBN.isFinite()) {
      return Result.ok(0);
    }
    const priceImpact = Number(priceImpactBN.toFixed(6));
    return Result.ok(priceImpact);
  }
}
