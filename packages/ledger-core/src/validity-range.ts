import { type Maybe, Result } from "@repo/ledger-utils";

export type ValidityRange = {
  validFrom: Maybe<number>;
  validUntil: Maybe<number>;
};

export type FiniteValidityRange = {
  validFrom: number;
  validUntil: number;
};

export namespace ValidityRange {
  export function getCurrentTimeApproximation(finiteRange: FiniteValidityRange): Result<number, Error> {
    const { validFrom, validUntil } = finiteRange;
    if (validUntil - validFrom <= 600) {
      const approximationTime = (validUntil - validFrom) / 2 + validFrom;
      return Result.ok(approximationTime);
    } else {
      return Result.err(
        new Error(
          `getCurrentTimeApproximation requires the different between validFrom and validUntil is less than or equals 10 minutes`,
        ),
      );
    }
  }
}
