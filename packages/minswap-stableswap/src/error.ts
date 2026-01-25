export enum StableswapCalculationErrorCode {
  INVALID_PARAMS,
  AMOUNT_TOO_SMALL,
  AMOUNT_TOO_BIG,
}

export class StableswapPoolCalculationError extends Error {
  readonly errorCode: StableswapCalculationErrorCode;
  constructor(errorCode: StableswapCalculationErrorCode, message?: string) {
    super(message);
    this.errorCode = errorCode;
  }
}
