import invariant from "@minswap/tiny-invariant";

import { ADA, type Address, type NetworkEnvironment, TxOut, Utxo, Value } from "@repo/ledger-core";
import { Result } from "@repo/ledger-utils";
import { ChangeValueTooLargeError, CoverForDustAdaError, CoverForFeesError, DustAdaNotCoveredCause, IncorrectInputSupplied, InsufficientBalanceCause, InsufficientBalanceError } from "./tx-builder-error";
import { selectUtxos } from "./select-utxos";
import { TxBuilderUtils } from "./utils";

export const MAX_TOKEN_BUNDLE_SIZE = 20;

const LEFT_OVER_ADA_SPLIT_THRESHOLD = 20_000_000n;

export type ChangeBuilderOptions = {
  initMinFee: bigint;
  outputs: TxOut[];
  mintValue: Value;
  withdrawalsAmt: bigint;
  shouldSplitChange: boolean;
};

export type BuildChangeSuccess = {
  feeWithChange: bigint;
  changeOuts: TxOut[];
  additionalChosenInputs: Utxo[];
};

export type SplitChangeOutResult = {
  coins: TxOut[];
  nativeTokens: TxOut[];
};

export class SplitChangeOutError extends Error {
  additionalAdaRequired: bigint;
  constructor(additionalAdaRequired: bigint) {
    super(`require ${additionalAdaRequired} more ADA`);
    this.additionalAdaRequired = additionalAdaRequired;
  }
}

export type BuildChangeOutsAndFeeSuccess = {
  changeOuts: TxOut[];
  feeWithChange: bigint;
};

export type BuildChangeOutsAndFeeError = NeedMoreInputsError | InsufficientBalanceError | ChangeValueTooLargeError;
class NeedMoreInputsError extends Error {
  needMoreInputs: Utxo[];
  constructor(needMoreInputs: Utxo[]) {
    super(`require more inputs`);
    this.needMoreInputs = needMoreInputs;
  }
}

export type ChangeBuilderError = InsufficientBalanceError | ChangeValueTooLargeError | IncorrectInputSupplied;

/**
 * ChangeBuilder takes available information from current tx, calculate final tx fee and return one (or many) change outputs.
 * First, it splits change value into ADA-only utxos ("coins") and native tokens bundle utxos ("nativeTokens")
 * The native tokens bundle has MAX_TOKEN_BUNDLE_SIZE max tokens and minimum ADA required
 * The coins are put into 1 single utxo
 * Then, it select more inputs if needed to cover for changeOutputs minADA and calculate final fee.
 * The fee is then deducted from some current changeOutputs.
 */
export class ChangeBuilder {
  private readonly networkEnvironment: NetworkEnvironment;
  private readonly changeAddress: Address;
  private readonly inputsToChoose: Utxo[];
  private readonly chosenInputUtxos: Utxo[];

  private changeValue: Value;
  private changeOuts: TxOut[] | undefined;
  private feeWithChange: bigint | undefined;
  private additionalChosenInputs: Utxo[];

  private builtResult: Result<BuildChangeSuccess, ChangeBuilderError> | undefined;

  constructor(
    networkEnvironment: NetworkEnvironment,
    changeAddress: Address,
    inputsToChoose: Utxo[],
    chosenInputUtxos: Utxo[],
  ) {
    this.networkEnvironment = networkEnvironment;
    this.changeAddress = changeAddress;
    this.inputsToChoose = inputsToChoose;
    this.chosenInputUtxos = chosenInputUtxos;

    this.changeValue = new Value();

    this.additionalChosenInputs = [];
  }

  private addAdditionalChosenInputs(utxos: Utxo[]): void {
    this.additionalChosenInputs.push(...utxos);
    for (const utxo of utxos) {
      this.changeValue.addAll(utxo.output.value);
    }
  }

  private getAvailableUtxos(): Utxo[] {
    const chosenInputs = [...this.chosenInputUtxos, ...this.additionalChosenInputs];
    return this.inputsToChoose.filter((utxo) => !Utxo.contains(chosenInputs, utxo));
  }

  private buildChangeOutsAndFee(
    initMinFee: bigint,
    shouldSplitChange: boolean,
  ): Result<BuildChangeOutsAndFeeSuccess, BuildChangeOutsAndFeeError> {
    const changeOut = new TxOut(this.changeAddress, this.changeValue);
    const coins: TxOut[] = [];
    const nativeTokens: TxOut[] = [];
    const leftOverAda = getTotalExtractableAda(this.getAvailableUtxos(), [
      new TxOut(this.changeAddress, this.changeValue),
    ], this.networkEnvironment);
    // skip change out if left over ada is less
    const shouldSplitSkip = leftOverAda < LEFT_OVER_ADA_SPLIT_THRESHOLD;
    if (!shouldSplitSkip && shouldSplitChange) {
      // perform split change
      const splitResult = splitChangeOut(changeOut, this.networkEnvironment);
      if (splitResult.type === "err") {
        const selectUtxosResult = selectUtxos(
          new Value().add(ADA, splitResult.error.additionalAdaRequired),
          this.getAvailableUtxos(),
          shouldSplitChange,
          this.changeAddress,
          this.networkEnvironment,
        );
        if (selectUtxosResult.type === "err") {
          return Result.err(
            new InsufficientBalanceError(
              selectUtxosResult.error.asset,
              selectUtxosResult.error.missingQty,
              InsufficientBalanceCause.CHANGE_SPLIT,
            ),
          );
        }
        return Result.err(new NeedMoreInputsError(selectUtxosResult.value));
      }
      coins.push(...splitResult.value.coins);
      nativeTokens.push(...splitResult.value.nativeTokens);
    } else {
      const missingMinimumAda = changeOut.getMissingMinimumADA(this.networkEnvironment);
      if (missingMinimumAda > 0n) {
        const selectUtxosResult = selectUtxos(
          new Value().add(ADA, missingMinimumAda),
          this.getAvailableUtxos(),
          shouldSplitChange,
          this.changeAddress,
          this.networkEnvironment,
        );
        if (selectUtxosResult.type === "err") {
          return Result.err(
            new InsufficientBalanceError(
              selectUtxosResult.error.asset,
              selectUtxosResult.error.missingQty,
              InsufficientBalanceCause.CHANGE,
            ),
          );
        }
        return Result.err(new NeedMoreInputsError(selectUtxosResult.value));
      }
      if (this.changeValue.hasNativeTokens()) {
        if (this.changeValue.bytesLength() > 5000) {
          return Result.err(new ChangeValueTooLargeError(this.changeValue, 0n));
        }
        nativeTokens.push(changeOut);
      } else {
        coins.push(changeOut);
      }
    }
    const changeOuts = [...nativeTokens, ...coins];
    const feeForAdditionalChosenInputs = TxBuilderUtils.feeForInputs(this.networkEnvironment, this.additionalChosenInputs);
    const feeForChangeOutputs = TxBuilderUtils.feeForOutputs(this.networkEnvironment, changeOuts);
    const feeAfterChangeOut = initMinFee + feeForAdditionalChosenInputs + feeForChangeOutputs;

    const coverForFeesResult = coverForFees(
      this.changeAddress,
      coins,
      nativeTokens,
      feeAfterChangeOut,
      this.networkEnvironment,
    );

    if (coverForFeesResult.type === "err") {
      const selectUtxosResult = selectUtxos(
        new Value().add(ADA, coverForFeesResult.error.additionalAdaRequired),
        this.getAvailableUtxos(),
        shouldSplitChange,
        this.changeAddress,
        this.networkEnvironment,
      );
      if (selectUtxosResult.type === "err") {
        return Result.err(
          new InsufficientBalanceError(
            selectUtxosResult.error.asset,
            selectUtxosResult.error.missingQty,
            InsufficientBalanceCause.FEES,
          ),
        );
      }
      return Result.err(new NeedMoreInputsError(selectUtxosResult.value));
    }
    const { finalFee, finalCoins, finalNativeTokens } = coverForFeesResult.value;
    return Result.ok({
      changeOuts: [...finalCoins, ...finalNativeTokens],
      feeWithChange: finalFee,
    });
  }

  build({
    initMinFee,
    outputs,
    mintValue,
    withdrawalsAmt,
    shouldSplitChange,
  }: ChangeBuilderOptions): Result<BuildChangeSuccess, ChangeBuilderError> {
    const changeValueResult = getChangeValue(this.chosenInputUtxos, mintValue, withdrawalsAmt, outputs);
    if (changeValueResult.type === "err") {
      return changeValueResult;
    }
    this.changeValue = changeValueResult.value;
    // In case to be change out has only enough txn fee without change out, we do not need change out
    if (initMinFee === this.changeValue.get(ADA) && !this.changeValue.hasNativeTokens()) {
      this.builtResult = Result.ok({
        feeWithChange: initMinFee,
        changeOuts: [],
        additionalChosenInputs: [],
      });
      return this.builtResult;
    }
    while (true) {
      const buildChangeOutsAndFeeResult = this.buildChangeOutsAndFee(initMinFee, shouldSplitChange);
      if (buildChangeOutsAndFeeResult.type === "ok") {
        this.changeOuts = buildChangeOutsAndFeeResult.value.changeOuts;
        this.feeWithChange = buildChangeOutsAndFeeResult.value.feeWithChange;
        break;
      }
      const err = buildChangeOutsAndFeeResult.error;
      if (err instanceof NeedMoreInputsError) {
        this.addAdditionalChosenInputs(err.needMoreInputs);
      } else {
        return Result.err(err);
      }
    }
    invariant(this.feeWithChange, "feeWithChange must be set");
    invariant(this.changeOuts, "changeOuts must be set");
    this.builtResult = Result.ok({
      feeWithChange: this.feeWithChange,
      changeOuts: this.changeOuts,
      additionalChosenInputs: this.additionalChosenInputs,
    });
    return this.builtResult;
  }

  buildAndGetResult(options: ChangeBuilderOptions): Result<BuildChangeSuccess, ChangeBuilderError> {
    if (!this.builtResult) return this.build(options);
    else return this.builtResult;
  }
}

/**
 * Split Change Out if it is big enough (e.g. >20 assets). This should help prevent 2 types of errors:
 *
 * 1. `Value over 5000..` - Value size is max 5k bytes, so with the split value size would be <5k bytes.
 * 2. `Transaction size over 16384..` - When wallet has smaller utxos, this issue will occur less often.
 *
 * @param changeOut Change out to be split into smaller outs with max no of tokens specified in @maxBundleSize
 * @param maxTokenBundleSize max no of tokens contained in each bundle
 * @returns minAdaAddiitional: amount ADA need to add more for satisfied minimumADA
 */
export function splitChangeOut(
  changeOut: TxOut,
  networkEnvironment: NetworkEnvironment,
  maxTokenBundleSize = MAX_TOKEN_BUNDLE_SIZE,
): Result<SplitChangeOutResult, SplitChangeOutError> {
  const nativeTokens: TxOut[] = [];
  const coins: TxOut[] = [];
  const assets = changeOut.value.flatten().filter(([asset]) => !asset.equals(ADA));
  while (assets.length) {
    const value = Value.unflatten(assets.splice(0, maxTokenBundleSize));
    const output = new TxOut(changeOut.address, value);
    output.addMinimumADAIfRequired(networkEnvironment);
    nativeTokens.push(output);
  }
  const remainingCoins = changeOut.value.get(ADA) - TxOut.sumValue(nativeTokens).get(ADA);
  if (remainingCoins < 0n) {
    return Result.err(new SplitChangeOutError(-remainingCoins));
  }
  if (remainingCoins >= TxOut.getMinimumAdaForAdaOnlyOut(networkEnvironment)) {
    coins.push(new TxOut(changeOut.address, new Value().add(ADA, remainingCoins)));
  } else {
    if (nativeTokens.length === 0) {
      return Result.err(new SplitChangeOutError(TxOut.getMinimumAdaForAdaOnlyOut(networkEnvironment) - remainingCoins));
    }
    // push remaining ada to last token bundle out since remaining ada cannot form an independent out
    nativeTokens[nativeTokens.length - 1].value.add(ADA, remainingCoins);
  }
  return Result.ok({
    coins,
    nativeTokens,
  });
}

export interface CoverForFeesResult {
  finalCoins: TxOut[];
  finalNativeTokens: TxOut[];
  finalFee: bigint;
}

/**
 * Take ADA from coin utxos or native token utxos to cover for the tx fee.
 * May need to remove some outputs if the fee taken doesn't form an utxo with minimum ADA. In that case, some dust ADA
 * will be adjusted into some other out or form a new out.
 */
function coverForFees(
  changeAddress: Address,
  coins: TxOut[],
  nativeTokens: TxOut[],
  feeToCover: bigint,
  networkEnvironment: NetworkEnvironment,
): Result<CoverForFeesResult, CoverForFeesError | CoverForDustAdaError> {
  let dustAda = 0n;
  let finalFee = feeToCover;
  let feeRequired = feeToCover;
  const finalCoins = [];
  const finalNativeTokens = [];
  for (const o of coins) {
    const coinOut = o.clone();
    if (feeRequired > 0n) {
      const availableAda = coinOut.value.get(ADA);
      if (availableAda > feeRequired) {
        const maxExtractableAda = coinOut.getExtractableADA(networkEnvironment);
        if (maxExtractableAda >= feeRequired) {
          coinOut.value.subtract(ADA, feeRequired);
          feeRequired = 0n;
          finalCoins.push(coinOut);
        } else {
          // discard ouput
          // e.g. if fee required is 0.2 ADA and change out has 1 ADA
          // remaining 0.8 ADA cannot form an out due to min ada. So,
          // 0.8 ADA is added to dustAda which is then merged
          // with one of the change out bundles.

          /**
           *  Example:
           *
           *  Assertion: available > feeRequired > revisedFee
           *
           *  available = 1.3
           *  maxExtract = 0.35
           *  feeRequired = 0.37
           *
           *  extraFee = 0.04
           *  revisedFee = 0.33
           *  remainingAda = 1.3 - 0.33 = 0.97
           *  dustAda = remainingAda = 0.97
           *  finalFee = 0.33
           */
          const extraFee = TxBuilderUtils.feeForOutput(networkEnvironment, coinOut);
          const revisedFeeRequired = feeRequired - extraFee;
          const remainingAda = availableAda - revisedFeeRequired;
          feeRequired = 0n;
          dustAda = dustAda + remainingAda;
          finalFee = finalFee - extraFee;
        }
      } else {
        // discard output
        /**
         *  Example:
         *
         *  Assertion: available < feeRequired
         *             revisedFee < feeRequired
         *  -----------------------------
         *  CASE 1:
         *
         *  available = 0.97
         *  feeRequired = 1.17
         *
         *  extraFee = 0.04
         *  revisedFee = 1.17 - 0.04 = 1.13
         *  remainingFeesToCover = 1.13 - 0.97 = 0.16
         *  feeRequired = 0.16
         *  dustAda = 0
         *  finalFee = 1.17 - 0.04 = 1.13
         *
         *  -----------------------------
         *
         *  CASE 2:
         *
         *  available = 1.14
         *  feeRequired = 1.17
         *
         *  extraFee = 0.04
         *  revisedFee = 1.13
         *  remainingFeesToCover = 1.13 - 1.14 = -0.01
         *  feeRequired = 0
         *  dustAda = -(remainingFeesToCover) = 0.01
         *  finalFee = 1.17 - 0.04 = 1.13
         *
         *  -----------------------------
         *
         */
        const extraFee = TxBuilderUtils.feeForOutput(networkEnvironment, coinOut);
        const revisedFeeRequired = feeRequired - extraFee;
        const remainingFeesToCover = revisedFeeRequired - availableAda;
        if (remainingFeesToCover >= 0n) {
          feeRequired = remainingFeesToCover;
        } else {
          feeRequired = 0n;
          dustAda = dustAda - remainingFeesToCover;
        }
        finalFee = finalFee - extraFee;
      }
    } else {
      finalCoins.push(coinOut);
    }
  }
  for (const o of nativeTokens) {
    finalNativeTokens.push(o.clone());
  }
  // Try again with token outs which has additional ADA
  if (finalNativeTokens.length > 0) {
    const lastTokenOut = finalNativeTokens[finalNativeTokens.length - 1];
    if (feeRequired > 0n) {
      if (lastTokenOut.value.get(ADA) > lastTokenOut.getMinimumADA(networkEnvironment)) {
        const maxExtractableLovelace = lastTokenOut.getExtractableADA(networkEnvironment);
        if (maxExtractableLovelace >= feeRequired) {
          lastTokenOut.value.subtract(ADA, feeRequired);
          feeRequired = 0n;
        } else {
          // most certainly this will not be sufficient to be able to cover for fees
          // since only one token out can possibly have additional ADA.
          lastTokenOut.value.subtract(ADA, maxExtractableLovelace);
          feeRequired = feeRequired - maxExtractableLovelace;
        }
      }
    }
  }
  if (feeRequired > 0n) {
    return Result.err(
      new CoverForFeesError(feeRequired, {
        finalCoins: finalCoins,
        finalNativeTokens: finalNativeTokens,
        finalFee: finalFee,
      }),
    );
  }
  if (dustAda > 0n) {
    if (finalCoins.length > 0) {
      // add to first coin out
      finalCoins[0].value.add(ADA, dustAda);
    } else if (finalNativeTokens.length > 0) {
      // add to last native token out
      finalNativeTokens[finalNativeTokens.length - 1].value.add(ADA, dustAda);
    } else if (dustAda >= TxOut.getMinimumAdaForAdaOnlyOut(networkEnvironment)) {
      const dustOutput = new TxOut(changeAddress, new Value().add(ADA, dustAda));
      const extraFee = TxBuilderUtils.feeForOutput(networkEnvironment, dustOutput);
      const maxExtractableLovelace = dustOutput.getExtractableADA(networkEnvironment);
      if (maxExtractableLovelace >= extraFee) {
        dustOutput.value.subtract(ADA, extraFee);
        finalFee += extraFee;
        finalCoins.push(dustOutput);
      } else {
        return Result.err(
          new CoverForDustAdaError(extraFee - maxExtractableLovelace, DustAdaNotCoveredCause.DUST_ADA_OUT, dustAda),
        );
      }
    } else {
      return Result.err(
        new CoverForDustAdaError(
          TxOut.getMinimumAdaForAdaOnlyOut(networkEnvironment) - dustAda,
          DustAdaNotCoveredCause.DUST_ADA_INSUFFICIENT,
          dustAda,
        ),
      );
    }
  }
  return Result.ok({
    finalFee,
    finalCoins,
    finalNativeTokens,
  });
}

export function getChangeValue(
  inputs: Utxo[],
  mint: Value,
  withdrawalsAmt: bigint,
  outputs: TxOut[],
): Result<Value, IncorrectInputSupplied> {
  const inputsValue = Utxo.sumValue(inputs);
  const outputsValue = TxOut.sumValue(outputs);
  const changeValue = new Value()
    .addAll(inputsValue)
    .addAll(mint)
    .add(ADA, withdrawalsAmt)
    .subtractAll(outputsValue)
    .trim();
  if (changeValue.flatten().some(([_, amount]) => amount < 0n)) {
    // In some cases when an input is spent while the output was already created by dApp,
    // it can lead to incomprehensible errors like "ParseIntError { kind: InvalidDigit }".
    return Result.err(new IncorrectInputSupplied("Incorrect input supplied, please try again."));
  }
  return Result.ok(changeValue);
}

// NOTE: this function will work correctly only if change out is always merged into a single out
// (done in tx-builder.ts before change building)
function getTotalExtractableAda(availableUtxos: Utxo[], changeOuts: TxOut[], networkEnvironment: NetworkEnvironment): bigint {
  const usableAdaInAvailableUtxos = availableUtxos.reduce((pre, u) => pre + u.output.getExtractableADA(networkEnvironment), 0n);
  const usableAdaInChangeOuts = changeOuts.reduce((pre, o) => pre + o.getExtractableADA(networkEnvironment), 0n);
  const totalExtractableAda = usableAdaInAvailableUtxos + usableAdaInChangeOuts;
  return totalExtractableAda;
}
