import { type Address, type TxIn, type Value, XJSON } from "@repo/ledger-core";
import { getErrorMessage } from "@repo/ledger-utils";
import type { DexVersion } from "./order-step";

export type InvalidOrder = {
  dexVersion: DexVersion;
  txIn: TxIn;
  utxoAddress: Address;
  owner?: Address;
  datumHash?: string;
  datum?: string;
  value: Value;
  reason: InvalidOrder.OrderError;
};

export namespace InvalidOrder {
  export class OrderError extends Error {
    code: ErrorCode;
    msg: string;
    extra: string[];

    constructor(code: ErrorCode, ...extra: string[]) {
      // 'Error' breaks prototype chain here
      super(code);
      this.code = code;
      this.msg = getOrderErrorMessage(code);
      this.extra = extra;
      // Set the prototype explicitly.
      Object.setPrototypeOf(this, OrderError.prototype);
    }

    override toString(): string {
      return XJSON.stringify({
        code: this.code,
        errorMessage: this.msg,
        extra: this.extra,
      });
    }
    toJSON(): string {
      return this.toString();
    }
    toXJSON(): { $orderError: { code: string; extra: string[] } } {
      return {
        $orderError: {
          code: this.code,
          extra: this.extra,
        },
      };
    }
    static fromString(s: string): OrderError {
      const {
        code,
        extra,
      }: {
        code: string;
        extra: string[];
      } = XJSON.parse(s);

      return new OrderError(code as ErrorCode, ...extra);
    }

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    static new(err: any): OrderError {
      if (err instanceof OrderError) {
        return err;
      }
      return new OrderError(ErrorCode.UNEXPECTED, getErrorMessage(err));
    }
  }
  export enum ErrorCode {
    // Error of orders that we can detect in order creation phase
    MISSING_DATUM_HASH = "MISSING_DATUM_HASH",
    MISSING_DATUM = "MISSING_DATUM",
    INVALID_DATUM = "INVALID_DATUM",
    INVALID_SCRIPT_HASH = "INVALID_SCRIPT_HASH",
    INVALID_PARAMETER = "INVALID_PARAMETER",
    INVALID_VALUE = "INVALID_VALUE",
    NON_EXISTENCE_POOL = "NON_EXISTENCE_POOL",

    // Error of orders that we can detect in order batching phase
    EXPIRED = "EXPIRED",
    MISSING_BATCHER_FEE = "MISSING_BATCHER_FEE",
    MISSING_DEPOSIT_ADA = "MISSING_DEPOSIT_ADA",

    // Unexpected error
    UNEXPECTED = "UNEXPECTED",
  }
  export function getOrderErrorMessage(code: ErrorCode): string {
    switch (code) {
      case ErrorCode.MISSING_DATUM_HASH: {
        return "the order is lack of datum hash";
      }
      case ErrorCode.MISSING_DATUM: {
        return "the order is lack of datum";
      }
      case ErrorCode.INVALID_DATUM: {
        return "the order contains an invalid datum";
      }
      case ErrorCode.INVALID_PARAMETER: {
        return "the order contains invalid parameters in the datum";
      }
      case ErrorCode.INVALID_SCRIPT_HASH: {
        return "order script hash (payment address) is not correct";
      }
      case ErrorCode.INVALID_VALUE: {
        return "the order is missed required assets or contains invalid assets";
      }
      case ErrorCode.NON_EXISTENCE_POOL: {
        return "the order is pairing with the non existence liquidity pool";
      }
      case ErrorCode.MISSING_BATCHER_FEE: {
        return "the order is lack of required batcher fee";
      }
      case ErrorCode.MISSING_DEPOSIT_ADA: {
        return "the order is lack of deposit ADA";
      }
      case ErrorCode.EXPIRED: {
        return "the order become expired and no longer be able to apply on the pool";
      }
      case ErrorCode.UNEXPECTED: {
        return "unexpected error occur";
      }
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  export function assert(condition: any, code: InvalidOrder.ErrorCode, ...extra: string[]): asserts condition {
    if (!condition) {
      throw new OrderError(code, ...extra);
    }
  }
}
