import BigNumber from "bignumber.js";
import * as fc from "fast-check";

import { Result } from "@minswap/felis-ledger-utils";
import { describe, expect, it } from "vitest";
import { StableswapCalculation } from "../src/utils";

describe("stableswap price", () => {
  it("test price", () => {
    //correct but not exactly
    const validateFunction = function (
      balances: bigint[],
      multiples: bigint[],
      amp: bigint,
      assetAIndex: number,
      assetBIndex: number,
    ): [bigint, bigint] {
      const simulatedAmountIn = balances[assetAIndex] / 1000n;
      const { amountOut: simulatedAmountOut } = Result.unwrap(
        StableswapCalculation.calculateExchange({
          inIndex: assetAIndex,
          outIndex: assetBIndex,
          amountIn: simulatedAmountIn,
          amp: amp,
          multiples: multiples,
          datumBalances: balances,
          valueBalances: balances,
          fee: 0n,
          adminFee: 0n,
          feeDenominator: 1n,
        }),
      );
      return [simulatedAmountIn, simulatedAmountOut];
    };

    const data: { assetLength: number; amp: number }[] = [
      { assetLength: 2, amp: 500 },
      { assetLength: 2, amp: 100 },
      { assetLength: 2, amp: 50 },
      { assetLength: 2, amp: 10 },
      { assetLength: 3, amp: 500 },
      { assetLength: 3, amp: 100 },
      { assetLength: 3, amp: 50 },
      { assetLength: 3, amp: 10 },
    ];
    for (const { assetLength, amp } of data) {
      const minBalance = 100_000_000n;
      let maxBalance = 100_000_000n;
      switch (amp) {
        case 500: {
          maxBalance = minBalance * 20n;
          break;
        }
        case 100: {
          maxBalance = minBalance * 10n;
          break;
        }
        case 50: {
          maxBalance = minBalance * 10n;
          break;
        }
        case 10: {
          maxBalance = minBalance * 2n;
          break;
        }
        default: {
          maxBalance = minBalance;
        }
      }
      const balancesAndTestDataGenerator = fc.record({
        balances: fc.array(fc.integer({ min: Number(minBalance), max: Number(maxBalance) }), {
          minLength: assetLength,
          maxLength: assetLength,
        }),
        inOutIndex: fc.array(fc.integer({ min: 0, max: assetLength - 1 }), {
          minLength: 2,
          maxLength: 2,
        }),
      });
      fc.assert(
        fc.property(balancesAndTestDataGenerator, ({ balances, inOutIndex }) => {
          const [inIndex, outIndex] = inOutIndex;
          if (inIndex === outIndex) {
            return;
          }
          const [priceNumerator, priceDenominator] = StableswapCalculation.getPrice(
            balances.map((x) => BigInt(x)),
            balances.map((_) => 1n),
            BigInt(amp),
            inIndex,
            outIndex,
          );
          const [expectPriceNumerator, expectPriceDenominator] = validateFunction(
            balances.map((x) => BigInt(x)),
            balances.map((_) => 1000n),
            BigInt(amp),
            inIndex,
            outIndex,
          );
          const expectPrice = new BigNumber(expectPriceNumerator.toString()).div(expectPriceDenominator.toString());
          const realityPrice = new BigNumber(priceNumerator.toString()).dividedBy(priceDenominator.toString());
          expect(expectPrice.isGreaterThanOrEqualTo(realityPrice)).toBeTruthy();

          // always positive
          const gap = expectPrice.minus(realityPrice).div(expectPrice);
          const epsilon = new BigNumber(0.01);
          expect(gap.isLessThanOrEqualTo(epsilon)).toBeTruthy();
        }),
      );
    }
  });

  it("test 2 asset with different decimal(multiple)", () => {
    const amp = 1000n;
    const balances = [1_000_000n, 10_000_000n];
    const multiples = [10n, 1n];
    // find price of asset[1] base on asset[0].
    // that mean asset[1]=0.1 asset[0]
    // equal 0.1
    const [priceNumerator, priceDenominator] = StableswapCalculation.getPrice(balances, multiples, amp, 0, 1);
    expect(priceNumerator * 10n === priceDenominator).toBeTruthy();
  });

  it("test 2 asset(not equal balances*multiple) with different decimal(multiple) 2", () => {
    const amp = 1000n;
    const [price1Numerator, price1Denominator] = StableswapCalculation.getPrice(
      [5_000_000n, 10_000_000n],
      [10n, 1n],
      amp,
      0,
      1,
    );
    const [price2Numerator, price2Denominator] = StableswapCalculation.getPrice(
      [50_000_000n, 10_000_000n],
      [1n, 1n],
      amp,
      0,
      1,
    );
    expect(price1Numerator * 10n * price2Denominator === price1Denominator * price2Numerator).toBeTruthy();
  });
});
