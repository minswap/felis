import {
  ADA,
  type Address,
  DEFAULT_STABLE_PROTOCOL_PARAMS,
  type ExUnit,
  type NetworkEnvironment,
  type ProtocolParameters,
  type ReferenceScriptFee,
  type TxCollateral,
  TxIn,
  TxOut,
  Utxo,
  Value,
} from "@minswap/felis-ledger-core";
import {
  type CSLTransactionBuilder,
  Maybe,
  Result,
  RustModule,
  safeFreeRustObjects,
} from "@minswap/felis-ledger-utils";
import BigNumber from "bignumber.js";
import { selectUtxos, splitChangeOut } from "./select-utxos";
import {
  ChangeValueTooLargeError,
  InsufficientBalanceCause,
  InsufficientBalanceError,
  MaxCollateralBreachError,
} from "./tx-builder-error";
import type { TxDraft } from "./types";

export namespace TxBuilderUtils {
  export function createTransactionBuilder(network: NetworkEnvironment): CSLTransactionBuilder {
    const config = DEFAULT_STABLE_PROTOCOL_PARAMS[network];
    const CSL = RustModule.get;

    const priceMemoryNumerator = CSL.BigNum.from_str(config.executionUnitPrices.priceMemory.numerator.toString());
    const priceMemoryDenomitator = CSL.BigNum.from_str(config.executionUnitPrices.priceMemory.denominator.toString());
    const memPrice = CSL.UnitInterval.new(priceMemoryNumerator, priceMemoryDenomitator);

    const priceStepNumerator = CSL.BigNum.from_str(config.executionUnitPrices.priceSteps.numerator.toString());
    const priceStepDenomitator = CSL.BigNum.from_str(config.executionUnitPrices.priceSteps.denominator.toString());
    const stepPrice = CSL.UnitInterval.new(priceStepNumerator, priceStepDenomitator);

    const exUnitPrices = CSL.ExUnitPrices.new(memPrice, stepPrice);

    const linearFeeCoefficient = CSL.BigNum.from_str(config.txFeePerByte.toString());
    const linearFeeConstant = CSL.BigNum.from_str(config.txFeeFixed.toString());
    const linearFee = CSL.LinearFee.new(linearFeeCoefficient, linearFeeConstant);

    const coinsPerUtxoBytes = CSL.BigNum.from_str(config.utxoCostPerByte.toString());

    const poolDeposit = CSL.BigNum.from_str(config.stakePoolDeposit.toString());
    const keyDeposit = CSL.BigNum.from_str(config.stakeAddressDeposit.toString());

    const cfg = CSL.TransactionBuilderConfigBuilder.new()
      .fee_algo(linearFee)
      .coins_per_utxo_byte(coinsPerUtxoBytes)
      .ex_unit_prices(exUnitPrices)
      .pool_deposit(poolDeposit)
      .key_deposit(keyDeposit)
      .max_value_size(config.maxValueSize)
      .max_tx_size(config.maxTxSize)
      .minswap_mode(true);

    const transactionBuilderConfig = cfg.build();
    const transactionBuilder = CSL.TransactionBuilder.new(transactionBuilderConfig);

    safeFreeRustObjects(
      priceMemoryNumerator,
      priceMemoryDenomitator,
      memPrice,
      priceStepNumerator,
      priceStepDenomitator,
      stepPrice,
      exUnitPrices,
      linearFeeCoefficient,
      linearFeeConstant,
      linearFee,
      coinsPerUtxoBytes,
      poolDeposit,
      transactionBuilderConfig,
    );

    return transactionBuilder;
  }

  export function feeForInput(network: NetworkEnvironment, utxo: Utxo): bigint {
    const feeBuilder = TxBuilderUtils.createTransactionBuilder(network);
    const cslAddress = utxo.output.address.toCSL();
    const cslTxIn = TxIn.toCSL(utxo.input);
    const cslValue = utxo.output.value.toCSL();
    const feeForInput = feeBuilder.fee_for_input(cslAddress, cslTxIn, cslValue);
    const fee = BigInt(feeForInput.to_str());

    safeFreeRustObjects(cslAddress, cslTxIn, cslValue, feeBuilder, feeForInput);

    return fee;
  }

  export function feeForInputs(network: NetworkEnvironment, utxos: Utxo[]) {
    return utxos.reduce((totalFee, utxo) => {
      const fee = feeForInput(network, utxo);
      return totalFee + fee;
    }, 0n);
  }

  export function feeForOutput(network: NetworkEnvironment, out: TxOut): bigint {
    const feeBuilder = TxBuilderUtils.createTransactionBuilder(network);
    const cslOut = out.toCSL();
    const cslFee = feeBuilder.fee_for_output(cslOut);
    const fee = BigInt(cslFee.to_str());
    safeFreeRustObjects(cslOut, cslFee, feeBuilder);
    return fee;
  }

  export function feeForOutputs(network: NetworkEnvironment, outs: TxOut[]): bigint {
    return outs.reduce((totalFee, out) => {
      const feeForChangeOutput = feeForOutput(network, out);
      return totalFee + feeForChangeOutput;
    }, 0n);
  }

  export function calContractFee(networkEnv: NetworkEnvironment, exUnit: ExUnit): bigint {
    const protocolParams = DEFAULT_STABLE_PROTOCOL_PARAMS[networkEnv];
    const executionUnitPrices = protocolParams.executionUnitPrices;
    const memPrice = new BigNumber(exUnit.memory.toString())
      .times(executionUnitPrices.priceMemory.numerator)
      .div(executionUnitPrices.priceMemory.denominator);
    const stepsPrice = new BigNumber(exUnit.step.toString())
      .times(executionUnitPrices.priceSteps.numerator)
      .div(executionUnitPrices.priceSteps.denominator);
    return BigInt(memPrice.plus(stepsPrice).integerValue(BigNumber.ROUND_CEIL).toFixed(0));
  }

  export function maxContractFee(networkEnv: NetworkEnvironment): bigint {
    const protocolParams = DEFAULT_STABLE_PROTOCOL_PARAMS[networkEnv];
    const executionUnitPrices = protocolParams.executionUnitPrices;
    const maxExecutionUnit = protocolParams.maxTxExecutionUnits;
    const memPrice = new BigNumber(maxExecutionUnit.memory)
      .times(executionUnitPrices.priceMemory.numerator)
      .div(executionUnitPrices.priceMemory.denominator);
    const stepsPrice = new BigNumber(maxExecutionUnit.steps)
      .times(executionUnitPrices.priceSteps.numerator)
      .div(executionUnitPrices.priceSteps.denominator);
    return BigInt(memPrice.plus(stepsPrice).integerValue(BigNumber.ROUND_CEIL).toFixed(0));
  }

  export function maxTxSizeFee(networkEnv: NetworkEnvironment): bigint {
    const protocolParams = DEFAULT_STABLE_PROTOCOL_PARAMS[networkEnv];
    return BigInt(
      new BigNumber(protocolParams.maxTxSize)
        .times(protocolParams.txFeePerByte)
        .plus(protocolParams.txFeeFixed)
        .integerValue(BigNumber.ROUND_CEIL)
        .toFixed(),
    );
  }

  /**
   * Reference: https://github.com/CardanoSolutions/ogmios/releases/tag/v6.5.0
   * After Conway releases, the reference scripts are referred in transaction will have incremental cost
   * The formula is inside the Ogmios documentation above
   *
   * The incremental cost is only be applied for "Script" in the Reference Inputs, other parts won't be charged any additional fee
   * It means that if the transaction is referred to PubKey Utxos, Smart contract Utxos having Datum Hash or Inline Datum won't have the Reference Scripts fee
   * @param referenceInputs Transaction reference inputs
   * @param referenceFeeCfg Reference Scripts Fee configuration of the Cardano Node. This configurations are only available in Conway era
   * @returns the additional fee for Reference Scripts
   */
  export function calReferenceInputsFee({
    inputs,
    referenceInputs,
    referenceFeeCfg,
  }: {
    inputs: Utxo[];
    referenceInputs: Utxo[];
    referenceFeeCfg?: ReferenceScriptFee;
  }): bigint {
    if (referenceFeeCfg === undefined) {
      return 0n;
    }
    let refFee = 0;
    let referenceScriptSize = 0;
    for (const utxo of [...inputs, ...referenceInputs]) {
      if (Maybe.isJust(utxo.output.scriptRef)) {
        referenceScriptSize += utxo.output.scriptRef.script.bytes.length;
      }
    }
    let ceil = referenceFeeCfg.range;
    let baseFee = referenceFeeCfg.base;
    while (referenceScriptSize > 0) {
      const cur = Math.min(ceil, referenceScriptSize);
      const curFee = cur * baseFee;
      refFee += curFee;

      referenceScriptSize -= ceil;
      ceil += referenceFeeCfg.range;
      baseFee *= referenceFeeCfg.multiplier;
    }
    // Round up
    return BigInt(Math.ceil(refFee));
  }
}

export namespace UtxoSelection {
  export const DEFAULT_COLLATERAL_AMOUNT = 5_000000n;

  /**
   * CIP-40
   * Common constrains:
   * - At least 1 collateral input
   * - At most maxCollateralInputs (3 | ref https://cardanoscan.io/protocolparams)
   * - All Collateral inputs at vkey address (pubkey only)
   * - sum(inputs).ada ≥ ⌈fee × collateralPercent / 100⌉  (150%)
   * Case 1: NOT set `collateral_return`
   * - Collateral inputs must be ada-only UTxOs
   * Case 2: set `collateral_return`
   * - CNT tokens are allowed in collateral inputs
   * - Exactly ONE collateral_return output
   */
  export function selectCollaterals({
    walletCollaterals,
    walletUtxos,
    currentInputs,
    maxCollateralInputs,
    changeAddress,
    networkEnv,
  }: {
    walletCollaterals: Utxo[];
    walletUtxos: Utxo[];
    currentInputs: Utxo[];
    maxCollateralInputs: number;
    changeAddress: Address;
    networkEnv: NetworkEnvironment;
  }): Result<TxCollateral, MaxCollateralBreachError> {
    const uniqueUtxoInputs = new Set<string>();
    const uniqueCollateralCandidates: Utxo[] = [];
    for (const utxo of [
      ...walletCollaterals,
      ...walletUtxos,
      ...currentInputs.filter((utxo) => utxo.output.address.equals(changeAddress)),
    ]) {
      const txIn = TxIn.toString(utxo.input);
      if (!uniqueUtxoInputs.has(txIn)) {
        uniqueCollateralCandidates.push(utxo);
        uniqueUtxoInputs.add(txIn);
      }
    }
    const sortedCollateralCandidates = uniqueCollateralCandidates.sort((a, b) =>
      Utxo.sortDesc(a, b, ADA, networkEnv, true),
    );

    let collateralInputs: Utxo[] | undefined;
    let collateralReturn: TxOut | undefined;

    for (let count = 1; count <= maxCollateralInputs; count++) {
      if (Maybe.isJust(collateralInputs)) {
        break;
      }
      for (const candidates of pickCombination(
        sortedCollateralCandidates,
        count,
        (combo) => Utxo.sumValue(combo).get(ADA) >= DEFAULT_COLLATERAL_AMOUNT,
      )) {
        const sumValue = Utxo.sumValue(candidates);
        const draftCollateralReturn = TxOut.newPubKeyOut({
          address: changeAddress,
          value: sumValue.clone().remove(ADA, DEFAULT_COLLATERAL_AMOUNT),
        });
        if (sumValue.size() > 1) {
          if (draftCollateralReturn.getMissingMinimumADA(networkEnv) <= 0n) {
            collateralInputs = candidates;
            collateralReturn = draftCollateralReturn;
            break;
          }
        } else {
          collateralInputs = candidates;
          if (draftCollateralReturn.getMissingMinimumADA(networkEnv) <= 0n) {
            collateralReturn = draftCollateralReturn;
          }
          break;
        }
      }
    }

    if (Maybe.isJust(collateralInputs)) {
      return Result.ok({
        collaterals: collateralInputs,
        collateralReturn: collateralReturn,
      });
    } else {
      return Result.err(new MaxCollateralBreachError());
    }
  }

  export function* pickCombination<T>(items: T[], count: number, stopFn?: (combo: T[]) => boolean): Generator<T[]> {
    if (count <= 0 || count > items.length) return;

    const combo: T[] = [];

    function* backtrack(start: number): Generator<T[]> {
      const remaining = count - combo.length;
      for (let i = start; i <= items.length - remaining; i++) {
        if (stopFn && !stopFn([...combo, ...items.slice(i, i + remaining)])) break;
        combo.push(items[i]);
        if (combo.length === count) yield [...combo];
        else yield* backtrack(i + 1);
        combo.pop();
      }
    }

    yield* backtrack(0);
  }
}

export namespace ChangeOutputBuilder {
  export type ChangeOutputResult = {
    additionalInputs: Utxo[];
    changeOuts: TxOut[];
    txFee: bigint;
  };

  export type ChangeOutputSendAllResult = {
    changeOuts: TxOut[];
    txFee: bigint;
  };

  export type ChangeValueResult = {
    changeValue: Value;
    txFee: bigint;
  };

  export class ChangeOutputExceedAttempt extends Error {
    constructor() {
      super("Change splitting exceed maximum attempts");
      Object.setPrototypeOf(this, ChangeOutputExceedAttempt.prototype);
    }
  }

  export function getChangeValue({
    networkEnv,
    txDraft,
    protocolParameters,
  }: {
    networkEnv: NetworkEnvironment;
    txDraft: TxDraft;
    protocolParameters: ProtocolParameters;
  }): Result<ChangeValueResult, ChangeValueTooLargeError | InsufficientBalanceError> {
    let maxTxFee = 0n;
    const referenceInputsFee = TxBuilderUtils.calReferenceInputsFee({
      inputs: txDraft.body.inputs,
      referenceInputs: txDraft.body.referenceInputs,
      referenceFeeCfg: protocolParameters.referenceFee,
    });
    const isUsingPlutus = Object.keys(txDraft.plutusScripts).length > 0;
    if (isUsingPlutus) {
      maxTxFee =
        TxBuilderUtils.maxTxSizeFee(networkEnv) + TxBuilderUtils.maxContractFee(networkEnv) + referenceInputsFee;
    } else {
      maxTxFee = TxBuilderUtils.maxTxSizeFee(networkEnv) + referenceInputsFee;
    }
    const sumInputsValue = Utxo.sumValue(txDraft.body.inputs);
    const sumOutputsValue = TxOut.sumValue(txDraft.body.outputs);
    const sumMint = txDraft.body.mint.clone();
    const sumWithdrawalAmount = Object.values(txDraft.body.withdrawals).reduce((acc, a) => acc + a, 0n);
    const sumStakeKeyRegistrationFee = BigInt(
      protocolParameters.stakeAddressDeposit * (txDraft.body.certificates?.registrations.length ?? 0),
    );
    const sumStakeKeyDeRegistrationFee = BigInt(
      protocolParameters.stakeAddressDeposit * (txDraft.body.certificates?.deregistration.length ?? 0),
    );
    const changeValue = sumInputsValue
      .addAll(sumMint)
      .add(ADA, sumWithdrawalAmount + sumStakeKeyDeRegistrationFee)
      .subtractAll(sumOutputsValue)
      .subtract(ADA, maxTxFee + sumStakeKeyRegistrationFee)
      .trim();

    for (const [asset, amount] of changeValue.flatten()) {
      if (amount < 0n) {
        return Result.err(
          new InsufficientBalanceError(asset.toString(), (-amount).toString(), InsufficientBalanceCause.CHANGE),
        );
      }
    }

    if (changeValue.bytesLength() > 5000) {
      return Result.err(new ChangeValueTooLargeError(changeValue, maxTxFee));
    }
    return Result.ok({
      changeValue: changeValue,
      txFee: maxTxFee,
    });
  }

  export function buildChangeOut(options: {
    networkEnv: NetworkEnvironment;
    changeAddress: Address;
    walletUtxos: Utxo[];
    txDraft: TxDraft;
    protocolParameters: ProtocolParameters;
  }): Result<ChangeOutputResult, InsufficientBalanceError | ChangeOutputExceedAttempt> {
    const { networkEnv, changeAddress, walletUtxos: _walletUtxos, txDraft, protocolParameters } = options;
    const currentInputs = [...txDraft.body.inputs];
    let maxTxFee = 0n;
    const referenceInputsFee = TxBuilderUtils.calReferenceInputsFee({
      inputs: [...currentInputs, ..._walletUtxos],
      referenceInputs: txDraft.body.referenceInputs,
      referenceFeeCfg: protocolParameters.referenceFee,
    });
    const isUsingPlutus = Object.keys(txDraft.plutusScripts).length > 0;
    if (isUsingPlutus) {
      maxTxFee =
        TxBuilderUtils.maxTxSizeFee(networkEnv) + TxBuilderUtils.maxContractFee(networkEnv) + referenceInputsFee;
    } else {
      maxTxFee = TxBuilderUtils.maxTxSizeFee(networkEnv) + referenceInputsFee;
    }
    const sumInputsValue = Utxo.sumValue(txDraft.body.inputs);
    const sumOutputsValue = TxOut.sumValue(txDraft.body.outputs);
    const sumMint = txDraft.body.mint.clone();
    const sumWithdrawalAmount = Object.values(txDraft.body.withdrawals).reduce((acc, a) => acc + a, 0n);
    const sumStakeKeyRegistrationFee = BigInt(
      protocolParameters.stakeAddressDeposit * (txDraft.body.certificates?.registrations.length ?? 0),
    );
    const sumStakeKeyDeRegistrationFee = BigInt(
      protocolParameters.stakeAddressDeposit * (txDraft.body.certificates?.deregistration.length ?? 0),
    );

    const draftChangeValue = sumInputsValue
      .addAll(sumMint)
      .add(ADA, sumWithdrawalAmount + sumStakeKeyDeRegistrationFee)
      .subtractAll(sumOutputsValue)
      .subtract(ADA, maxTxFee + sumStakeKeyRegistrationFee)
      .trim();

    const requiredValue = new Value();
    for (const [asset, amount] of draftChangeValue.flatten()) {
      if (amount < 0n) {
        requiredValue.add(asset, -1n * amount);
      }
    }

    const walletUtxos: Utxo[] = [..._walletUtxos];
    // Select Utxo to cover negative amount in change output
    const utxosToCoverChangeOut = selectUtxos(requiredValue, walletUtxos, true, changeAddress, networkEnv);
    if (utxosToCoverChangeOut.type === "err") {
      return Result.err(
        new InsufficientBalanceError(
          utxosToCoverChangeOut.error.asset,
          utxosToCoverChangeOut.error.missingQty,
          InsufficientBalanceCause.CHANGE,
        ),
      );
    }
    currentInputs.push(...utxosToCoverChangeOut.value);

    const remainingUtxoMap: Record<string, Utxo> = {};
    for (const utxo of walletUtxos) {
      if (!Utxo.contains(currentInputs, utxo)) {
        remainingUtxoMap[TxIn.toString(utxo.input)] = utxo;
      }
    }
    const changeOutputs: TxOut[] = [];
    let attempt = 0;
    while (true) {
      if (attempt >= 10) {
        return Result.err(new ChangeOutputExceedAttempt());
      }
      attempt++;
      const changeValue = Utxo.sumValue(currentInputs)
        .addAll(sumMint)
        .add(ADA, sumWithdrawalAmount + sumStakeKeyDeRegistrationFee)
        .subtractAll(sumOutputsValue)
        .subtract(ADA, maxTxFee + sumStakeKeyRegistrationFee)
        .trim();
      const changeOut = TxOut.newPubKeyOut({
        address: changeAddress,
        value: changeValue,
      });
      const splitResult = splitChangeOut(changeOut, networkEnv);
      if (splitResult.type === "err") {
        const utxosToCoverChangeOutSplitting = selectUtxos(
          new Value().add(ADA, splitResult.error.additionalAdaRequired),
          Object.values(remainingUtxoMap),
          true,
          changeAddress,
          networkEnv,
        );
        if (utxosToCoverChangeOutSplitting.type === "err") {
          return Result.err(
            new InsufficientBalanceError(
              utxosToCoverChangeOutSplitting.error.asset,
              utxosToCoverChangeOutSplitting.error.missingQty,
              InsufficientBalanceCause.CHANGE_SPLIT,
            ),
          );
        } else {
          for (const utxo of utxosToCoverChangeOutSplitting.value) {
            currentInputs.push(utxo);
            delete remainingUtxoMap[TxIn.toString(utxo.input)];
          }
        }
      } else {
        changeOutputs.push(...splitResult.value.coins, ...splitResult.value.nativeTokens);
        break;
      }
    }
    const additionalUtxos = currentInputs.filter((utxo) => !Utxo.contains(txDraft.body.inputs, utxo));
    return Result.ok({
      additionalInputs: additionalUtxos,
      changeOuts: changeOutputs,
      txFee: maxTxFee,
    });
  }

  export function buildChangeOutSendAll({
    networkEnv,
    txDraft,
    protocolParameters,
    changeAddress,
  }: {
    networkEnv: NetworkEnvironment;
    txDraft: TxDraft;
    protocolParameters: ProtocolParameters;
    changeAddress: Address;
  }): Result<ChangeOutputSendAllResult, InsufficientBalanceError> {
    const changeValueResult = ChangeOutputBuilder.getChangeValue({
      networkEnv,
      txDraft,
      protocolParameters: protocolParameters,
    });
    if (changeValueResult.type === "err") {
      if (changeValueResult.error instanceof InsufficientBalanceError) {
        return Result.err(changeValueResult.error);
      }
      const changeOut = TxOut.newPubKeyOut({
        address: changeAddress,
        value: changeValueResult.error.changeValue,
      });
      const splitResult = splitChangeOut(changeOut, networkEnv);
      if (splitResult.type === "err") {
        throw new InsufficientBalanceError(
          ADA.toString(),
          splitResult.error.additionalAdaRequired.toString(),
          InsufficientBalanceCause.CHANGE_SPLIT,
        );
      }
      return Result.ok({
        changeOuts: [...splitResult.value.coins, ...splitResult.value.nativeTokens],
        txFee: changeValueResult.error.maxTxFee,
      });
    }
    const changeOut = TxOut.newPubKeyOut({
      address: changeAddress,
      value: changeValueResult.value.changeValue,
    });
    return Result.ok({
      changeOuts: [changeOut],
      txFee: changeValueResult.value.txFee,
    });
  }
}
