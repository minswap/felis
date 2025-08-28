import type { Value } from "@repo/ledger-core";
import { getErrorMessage } from "@repo/ledger-utils";
import type { CoverForFeesResult, DebugInfo } from "./types";

export type ExtendedDebugInfo = DebugInfo & {
  allUtxos: string[] | undefined;
  walletCollateralUtxos: string[] | undefined;
  changeAddress: string;
  stakeAddress: string | undefined;
};

export class TxBuildingError extends Error {
  debugInfo: ExtendedDebugInfo;
  error: unknown;

  constructor(error: unknown, debugInfo: ExtendedDebugInfo) {
    // 'Error' breaks prototype chain here
    super(getErrorMessage(error));
    this.error = error;
    this.debugInfo = debugInfo;
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, TxBuildingError.prototype);
  }
}

export enum InsufficientBalanceCause {
  INPUTS = "inputs",
  COLLATERAL = "collateral",
  CHANGE = "change",
  CHANGE_SPLIT = "change_split",
  FEES = "fees",
  OUT_CHANGE = "out_change",
  OUT_FEE = "out_fee",
}

export const CHANGE_LARGE_ERROR_MESSAGE =
  "Change value is too large, try again after enabling split option in settings.";

export class ChangeValueTooLargeError extends Error {
  changeValue: Value;
  maxTxFee: bigint;

  constructor(changeValue: Value, maxTxFee: bigint) {
    super(CHANGE_LARGE_ERROR_MESSAGE);
    this.changeValue = changeValue;
    this.maxTxFee = maxTxFee;
    Object.setPrototypeOf(this, ChangeValueTooLargeError.prototype);
  }
}

export const INSUFFICIENT_BALANCE_ERROR_MESSAGE = "Insufficient balance";

export class InsufficientBalanceError extends Error {
  asset: string;
  missingQty: string;
  override cause: InsufficientBalanceCause;

  constructor(asset: string, missingQty: string, cause: InsufficientBalanceCause) {
    super(INSUFFICIENT_BALANCE_ERROR_MESSAGE);
    this.asset = asset;
    this.missingQty = missingQty;
    this.cause = cause;
    Object.setPrototypeOf(this, InsufficientBalanceError.prototype);
  }
}

export class SelectUtxosError extends Error {
  asset: string;
  missingQty: string;

  constructor(asset: string, missingQty: string) {
    super(INSUFFICIENT_BALANCE_ERROR_MESSAGE);
    this.asset = asset;
    this.missingQty = missingQty;
    Object.setPrototypeOf(this, SelectUtxosError.prototype);
  }
}

export const MAX_COLLATERAL_BREACH_ERROR_MESSAGE = "Max collateral breach";

export class MaxCollateralBreachError extends Error {
  inputsCount: number;
  constructor(inputsCount: number) {
    super(MAX_COLLATERAL_BREACH_ERROR_MESSAGE);
    this.inputsCount = inputsCount;
    Object.setPrototypeOf(this, MaxCollateralBreachError.prototype);
  }
}

export class IncorrectInputSupplied extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, IncorrectInputSupplied.prototype);
  }
}

export enum DustAdaNotCoveredCause {
  DUST_ADA_OUT = "dust_ada_out",
  DUST_ADA_INSUFFICIENT = "dust_ada_insufficient",
}

export class CoverForFeesError extends Error {
  additionalAdaRequired: bigint;
  outFeeOptions: CoverForFeesResult;

  constructor(additionalAdaRequired: bigint, outFeeOptions: CoverForFeesResult) {
    super(`require ${additionalAdaRequired} more ADA`);
    this.additionalAdaRequired = additionalAdaRequired;
    this.outFeeOptions = outFeeOptions;
  }
}

export class CoverForDustAdaError extends Error {
  additionalAdaRequired: bigint;
  override cause: DustAdaNotCoveredCause;
  dustAda?: bigint;

  constructor(additionalAdaRequired: bigint, cause: DustAdaNotCoveredCause, dustAda?: bigint) {
    super(`require ${additionalAdaRequired} more ADA`);
    this.additionalAdaRequired = additionalAdaRequired;
    this.cause = cause;
    this.dustAda = dustAda;
  }
}
