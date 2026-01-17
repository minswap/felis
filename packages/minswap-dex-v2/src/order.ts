import {
  ADA,
  Address,
  AddressType,
  Asset,
  BaseUtxoModel,
  Bytes,
  CredentialType,
  DatumSource,
  type NetworkEnvironment,
  PlutusBytes,
  PlutusConstr,
  PlutusData,
  PlutusInt,
  PlutusList,
  PlutusMaybe,
  TxIn,
  type Utxo,
  type Value,
} from "@repo/ledger-core";
import { type CborHex, type CSLPlutusData, Maybe, Result } from "@repo/ledger-utils";
import { getDexV2Configs, getDexV2OrderScriptHash } from "./constants";
import { InvalidOrder } from "./invalid-order";
import { DexVersion, OrderV2StepType } from "./order-step";
import { normalizePair } from "./utils";

export enum OrderV2AuthorizationMethodType {
  SIGNATURE = 0,
  SPEND_SCRIPT = 1,
  WITHDRAW_SCRIPT = 2,
  MINT_SCRIPT = 3,
}

export type OrderV2AuthorizationMethod = {
  type: OrderV2AuthorizationMethodType;
  hash: Bytes;
};

export namespace OrderV2AuthorizationMethod {
  export function fromPlutusJson(d: PlutusData): OrderV2AuthorizationMethod {
    const { constructor, fields } = PlutusConstr.unwrap(d, {
      [OrderV2AuthorizationMethodType.SIGNATURE]: 1,
      [OrderV2AuthorizationMethodType.SPEND_SCRIPT]: 1,
      [OrderV2AuthorizationMethodType.WITHDRAW_SCRIPT]: 1,
      [OrderV2AuthorizationMethodType.MINT_SCRIPT]: 1,
    });
    return {
      type: constructor,
      hash: Bytes.fromHex(PlutusBytes.unwrap(fields[0])),
    };
  }
  export function toPlutusJson(method: OrderV2AuthorizationMethod): PlutusData {
    return {
      constructor: method.type,
      fields: [PlutusBytes.wrap(method.hash)],
    };
  }
}

export enum OrderV2Direction {
  B_TO_A = 0,
  A_TO_B = 1,
}

export namespace OrderV2Direction {
  export function fromPlutusJson(d: PlutusData): OrderV2Direction {
    const { constructor } = PlutusConstr.unwrap(d, {
      [0]: 0,
      [1]: 0,
    });
    switch (constructor) {
      case 0:
        return OrderV2Direction.B_TO_A;
      case 1:
        return OrderV2Direction.A_TO_B;
      default:
        throw new InvalidOrder.OrderError(
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `Unexpected Constr ${d} when decoding Direction`,
        );
    }
  }
  export function toPlutusJson(direction: OrderV2Direction): PlutusData {
    return {
      constructor: direction,
      fields: [],
    };
  }
}

export enum OrderV2Killable {
  PENDING_ON_FAILED = 0,
  KILL_ON_FAILED = 1,
}

export namespace OrderV2Killable {
  export function fromPlutusJson(d: PlutusData): OrderV2Killable {
    const { constructor } = PlutusConstr.unwrap(d, {
      [0]: 0,
      [1]: 0,
    });
    switch (constructor) {
      case 0:
        return OrderV2Killable.PENDING_ON_FAILED;
      case 1:
        return OrderV2Killable.KILL_ON_FAILED;
      default:
        throw new InvalidOrder.OrderError(
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `Unexpected Constr ${d} when decoding Killable`,
        );
    }
  }
  export function toPlutusJson(direction: OrderV2Killable): PlutusData {
    return {
      constructor: direction,
      fields: [],
    };
  }
}

export enum OrderV2AmountType {
  SPECIFIC_AMOUNT = 0,
  ALL = 1,
}

export type OrderV2DepositAmountOption =
  | {
      type: OrderV2AmountType.SPECIFIC_AMOUNT;
      depositAmountA: bigint;
      depositAmountB: bigint;
    }
  | {
      type: OrderV2AmountType.ALL;
      deductedAmountA: bigint;
      deductedAmountB: bigint;
    };

export namespace OrderV2DepositAmountOption {
  export function fromPlutusJson(d: PlutusData): OrderV2DepositAmountOption {
    const { constructor, fields } = PlutusConstr.unwrap(d, {
      [0]: 2,
      [1]: 2,
    });
    switch (constructor) {
      case 0:
        return {
          type: OrderV2AmountType.SPECIFIC_AMOUNT,
          depositAmountA: PlutusInt.unwrapToBigInt(fields[0]),
          depositAmountB: PlutusInt.unwrapToBigInt(fields[1]),
        };
      case 1:
        return {
          type: OrderV2AmountType.ALL,
          deductedAmountA: PlutusInt.unwrapToBigInt(fields[0]),
          deductedAmountB: PlutusInt.unwrapToBigInt(fields[1]),
        };
      default:
        throw new InvalidOrder.OrderError(
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `Unexpected Constr ${d} when decoding DepositAmount`,
        );
    }
  }
  export function toPlutusJson(depositAmount: OrderV2DepositAmountOption): PlutusData {
    switch (depositAmount.type) {
      case OrderV2AmountType.SPECIFIC_AMOUNT: {
        return {
          constructor: depositAmount.type,
          fields: [PlutusInt.wrap(depositAmount.depositAmountA), PlutusInt.wrap(depositAmount.depositAmountB)],
        };
      }
      case OrderV2AmountType.ALL: {
        return {
          constructor: depositAmount.type,
          fields: [PlutusInt.wrap(depositAmount.deductedAmountA), PlutusInt.wrap(depositAmount.deductedAmountB)],
        };
      }
    }
  }

  export function validateOnChainConstraint(depositAmount: OrderV2DepositAmountOption): void {
    switch (depositAmount.type) {
      case OrderV2AmountType.SPECIFIC_AMOUNT: {
        const { depositAmountA, depositAmountB } = depositAmount;
        InvalidOrder.assert(
          depositAmountA >= 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `depositAmountA: ${depositAmountA}`,
        );
        InvalidOrder.assert(
          depositAmountB >= 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `depositAmountB: ${depositAmountB}`,
        );
        InvalidOrder.assert(
          depositAmountA + depositAmountB > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `totalDeposit: ${depositAmountA + depositAmountB}`,
        );
        break;
      }
      case OrderV2AmountType.ALL: {
        const { deductedAmountA, deductedAmountB } = depositAmount;
        InvalidOrder.assert(
          deductedAmountA >= 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `deductedAmountA: ${deductedAmountA}`,
        );
        InvalidOrder.assert(
          deductedAmountB >= 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `deductedAmountB: ${deductedAmountB}`,
        );
        break;
      }
    }
  }
}

export type OrderV2SwapAmountOption =
  | {
      type: OrderV2AmountType.SPECIFIC_AMOUNT;
      swapAmount: bigint;
    }
  | {
      type: OrderV2AmountType.ALL;
      deductedAmount: bigint;
    };

export namespace OrderV2SwapAmountOption {
  export function fromPlutusJson(d: PlutusData): OrderV2SwapAmountOption {
    const { constructor, fields } = PlutusConstr.unwrap(d, {
      [0]: 1,
      [1]: 1,
    });
    switch (constructor) {
      case 0:
        return {
          type: OrderV2AmountType.SPECIFIC_AMOUNT,
          swapAmount: PlutusInt.unwrapToBigInt(fields[0]),
        };
      case 1:
        return {
          type: OrderV2AmountType.ALL,
          deductedAmount: PlutusInt.unwrapToBigInt(fields[0]),
        };
      default:
        throw new InvalidOrder.OrderError(
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `Unexpected Constr ${d} when decoding SwapAmount`,
        );
    }
  }
  export function toPlutusJson(swapAmount: OrderV2SwapAmountOption): PlutusData {
    switch (swapAmount.type) {
      case OrderV2AmountType.SPECIFIC_AMOUNT: {
        return {
          constructor: swapAmount.type,
          fields: [PlutusInt.wrap(swapAmount.swapAmount)],
        };
      }
      case OrderV2AmountType.ALL: {
        return {
          constructor: swapAmount.type,
          fields: [PlutusInt.wrap(swapAmount.deductedAmount)],
        };
      }
    }
  }
  export function validateOnChainConstraint(swapAmountOption: OrderV2SwapAmountOption): void {
    switch (swapAmountOption.type) {
      case OrderV2AmountType.SPECIFIC_AMOUNT: {
        const { swapAmount } = swapAmountOption;
        InvalidOrder.assert(swapAmount > 0n, InvalidOrder.ErrorCode.INVALID_PARAMETER, `swapAmount: ${swapAmount}`);
        break;
      }
      case OrderV2AmountType.ALL: {
        const { deductedAmount } = swapAmountOption;
        InvalidOrder.assert(
          deductedAmount >= 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `deductedAmount: ${deductedAmount}`,
        );
        break;
      }
    }
  }
}

export type OrderV2WithdrawAmountOption =
  | {
      type: OrderV2AmountType.SPECIFIC_AMOUNT;
      withdrawalLPAmount: bigint;
    }
  | {
      type: OrderV2AmountType.ALL;
      deductedLPAmount: bigint;
    };

export namespace OrderV2WithdrawAmountOption {
  export function fromPlutusJson(d: PlutusData): OrderV2WithdrawAmountOption {
    const { constructor, fields } = PlutusConstr.unwrap(d, {
      [0]: 1,
      [1]: 1,
    });
    switch (constructor) {
      case 0:
        return {
          type: OrderV2AmountType.SPECIFIC_AMOUNT,
          withdrawalLPAmount: PlutusInt.unwrapToBigInt(fields[0]),
        };
      case 1:
        return {
          type: OrderV2AmountType.ALL,
          deductedLPAmount: PlutusInt.unwrapToBigInt(fields[0]),
        };
      default:
        throw new InvalidOrder.OrderError(
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `Unexpected Constr ${d} when decoding WithdrawAmount`,
        );
    }
  }
  export function toPlutusJson(withdrawalAmount: OrderV2WithdrawAmountOption): PlutusData {
    switch (withdrawalAmount.type) {
      case OrderV2AmountType.SPECIFIC_AMOUNT: {
        return {
          constructor: withdrawalAmount.type,
          fields: [PlutusInt.wrap(withdrawalAmount.withdrawalLPAmount)],
        };
      }
      case OrderV2AmountType.ALL: {
        return {
          constructor: withdrawalAmount.type,
          fields: [PlutusInt.wrap(withdrawalAmount.deductedLPAmount)],
        };
      }
    }
  }
  export function validateOnChainConstraint(withdrawalAmountOption: OrderV2WithdrawAmountOption): void {
    switch (withdrawalAmountOption.type) {
      case OrderV2AmountType.SPECIFIC_AMOUNT: {
        const { withdrawalLPAmount } = withdrawalAmountOption;
        InvalidOrder.assert(
          withdrawalLPAmount > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `withdrawalLPAmount: ${withdrawalLPAmount}`,
        );
        break;
      }
      case OrderV2AmountType.ALL: {
        const { deductedLPAmount } = withdrawalAmountOption;
        InvalidOrder.assert(
          deductedLPAmount >= 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `deductedLPAmount: ${deductedLPAmount}`,
        );
        break;
      }
    }
  }
}

export type OrderV2SwapExactInStep = {
  type: OrderV2StepType.SWAP_EXACT_IN;
  direction: OrderV2Direction;
  swapAmountOption: OrderV2SwapAmountOption;
  minimumReceived: bigint;
  killable: OrderV2Killable;
};

export type OrderV2StopLossStep = {
  type: OrderV2StepType.STOP_LOSS;
  direction: OrderV2Direction;
  swapAmountOption: OrderV2SwapAmountOption;
  stopLossReceived: bigint;
};

export type OrderV2OcoStep = {
  type: OrderV2StepType.OCO;
  direction: OrderV2Direction;
  swapAmountOption: OrderV2SwapAmountOption;
  minimumReceived: bigint;
  stopLossReceived: bigint;
};

export type OrderV2SwapExactOutStep = {
  type: OrderV2StepType.SWAP_EXACT_OUT;
  direction: OrderV2Direction;
  maximumSwapAmountOption: OrderV2SwapAmountOption;
  expectedReceived: bigint;
  killable: OrderV2Killable;
};

export type OrderV2DepositStep = {
  type: OrderV2StepType.DEPOSIT;
  depositAmountOption: OrderV2DepositAmountOption;
  minimumLP: bigint;
  killable: OrderV2Killable;
};

export type OrderV2WithdrawStep = {
  type: OrderV2StepType.WITHDRAW;
  withdrawalAmountOption: OrderV2WithdrawAmountOption;
  minimumAssetA: bigint;
  minimumAssetB: bigint;
  killable: OrderV2Killable;
};

export type OrderV2ZapOutStep = {
  type: OrderV2StepType.ZAP_OUT;
  direction: OrderV2Direction;
  withdrawalAmountOption: OrderV2WithdrawAmountOption;
  minimumReceived: bigint;
  killable: OrderV2Killable;
};

export type OrderV2PartialSwapStep = {
  type: OrderV2StepType.PARTIAL_SWAP;
  direction: OrderV2Direction;
  totalSwapAmount: bigint;
  ioRatioNumerator: bigint;
  ioRatioDenominator: bigint;
  hops: bigint;
  minimumSwapAmountRequired: bigint;
  maxBatcherFeeEachTime: bigint;
};

export type OrderV2WithdrawImbalanceStep = {
  type: OrderV2StepType.WITHDRAW_IMBALANCE;
  withdrawalAmountOption: OrderV2WithdrawAmountOption;
  ratioAssetA: bigint;
  ratioAssetB: bigint;
  minimumAssetA: bigint;
  killable: OrderV2Killable;
};

export type OrderV2SwapRouting = {
  lpAsset: Asset;
  direction: OrderV2Direction;
};

export type OrderV2SwapMultiRoutingStep = {
  type: OrderV2StepType.SWAP_MULTI_ROUTING;
  routings: OrderV2SwapRouting[];
  swapAmountOption: OrderV2SwapAmountOption;
  minimumReceived: bigint;
};

export type OrderV2DonationStep = {
  type: OrderV2StepType.DONATION;
};

export namespace OrderV2SwapRouting {
  export function fromPlutusJson(d: PlutusData): OrderV2SwapRouting {
    const { fields } = PlutusConstr.unwrap(d, {
      [0]: 2,
    });
    return {
      lpAsset: Asset.fromPlutusJson(fields[0]),
      direction: OrderV2Direction.fromPlutusJson(fields[1]),
    };
  }

  export function toPlutusJson(data: OrderV2SwapRouting): PlutusData {
    return {
      constructor: 0,
      fields: [data.lpAsset.toPlutusJson(), OrderV2Direction.toPlutusJson(data.direction)],
    };
  }
}

export type OrderV2Step =
  | OrderV2SwapExactInStep
  | OrderV2StopLossStep
  | OrderV2OcoStep
  | OrderV2SwapExactOutStep
  | OrderV2DepositStep
  | OrderV2WithdrawStep
  | OrderV2ZapOutStep
  | OrderV2PartialSwapStep
  | OrderV2WithdrawImbalanceStep
  | OrderV2SwapMultiRoutingStep
  | OrderV2DonationStep;

export namespace OrderV2Step {
  export function fromPlutusJson(d: PlutusData): OrderV2Step {
    const { constructor, fields } = PlutusConstr.unwrap(d, {
      [OrderV2StepType.SWAP_EXACT_IN]: 4,
      [OrderV2StepType.STOP_LOSS]: 3,
      [OrderV2StepType.OCO]: 4,
      [OrderV2StepType.SWAP_EXACT_OUT]: 4,
      [OrderV2StepType.DEPOSIT]: 3,
      [OrderV2StepType.WITHDRAW]: 4,
      [OrderV2StepType.ZAP_OUT]: 4,
      [OrderV2StepType.PARTIAL_SWAP]: 7,
      [OrderV2StepType.WITHDRAW_IMBALANCE]: 5,
      [OrderV2StepType.SWAP_MULTI_ROUTING]: 3,
      [OrderV2StepType.DONATION]: 0,
    });
    switch (constructor) {
      case OrderV2StepType.SWAP_EXACT_IN:
        return {
          type: constructor,
          direction: OrderV2Direction.fromPlutusJson(fields[0]),
          swapAmountOption: OrderV2SwapAmountOption.fromPlutusJson(fields[1]),
          minimumReceived: PlutusInt.unwrapToBigInt(fields[2]),
          killable: OrderV2Killable.fromPlutusJson(fields[3]),
        };
      case OrderV2StepType.STOP_LOSS:
        return {
          type: constructor,
          direction: OrderV2Direction.fromPlutusJson(fields[0]),
          swapAmountOption: OrderV2SwapAmountOption.fromPlutusJson(fields[1]),
          stopLossReceived: PlutusInt.unwrapToBigInt(fields[2]),
        };
      case OrderV2StepType.OCO:
        return {
          type: constructor,
          direction: OrderV2Direction.fromPlutusJson(fields[0]),
          swapAmountOption: OrderV2SwapAmountOption.fromPlutusJson(fields[1]),
          minimumReceived: PlutusInt.unwrapToBigInt(fields[2]),
          stopLossReceived: PlutusInt.unwrapToBigInt(fields[3]),
        };
      case OrderV2StepType.SWAP_EXACT_OUT:
        return {
          type: constructor,
          direction: OrderV2Direction.fromPlutusJson(fields[0]),
          maximumSwapAmountOption: OrderV2SwapAmountOption.fromPlutusJson(fields[1]),
          expectedReceived: PlutusInt.unwrapToBigInt(fields[2]),
          killable: OrderV2Killable.fromPlutusJson(fields[3]),
        };
      case OrderV2StepType.DEPOSIT:
        return {
          type: constructor,
          depositAmountOption: OrderV2DepositAmountOption.fromPlutusJson(fields[0]),
          minimumLP: PlutusInt.unwrapToBigInt(fields[1]),
          killable: OrderV2Killable.fromPlutusJson(fields[2]),
        };
      case OrderV2StepType.WITHDRAW:
        return {
          type: constructor,
          withdrawalAmountOption: OrderV2WithdrawAmountOption.fromPlutusJson(fields[0]),
          minimumAssetA: PlutusInt.unwrapToBigInt(fields[1]),
          minimumAssetB: PlutusInt.unwrapToBigInt(fields[2]),
          killable: OrderV2Killable.fromPlutusJson(fields[3]),
        };
      case OrderV2StepType.ZAP_OUT:
        return {
          type: constructor,
          direction: OrderV2Direction.fromPlutusJson(fields[0]),
          withdrawalAmountOption: OrderV2WithdrawAmountOption.fromPlutusJson(fields[1]),
          minimumReceived: PlutusInt.unwrapToBigInt(fields[2]),
          killable: OrderV2Killable.fromPlutusJson(fields[3]),
        };
      case OrderV2StepType.PARTIAL_SWAP: {
        return {
          type: constructor,
          direction: OrderV2Direction.fromPlutusJson(fields[0]),
          totalSwapAmount: PlutusInt.unwrapToBigInt(fields[1]),
          ioRatioNumerator: PlutusInt.unwrapToBigInt(fields[2]),
          ioRatioDenominator: PlutusInt.unwrapToBigInt(fields[3]),
          hops: PlutusInt.unwrapToBigInt(fields[4]),
          minimumSwapAmountRequired: PlutusInt.unwrapToBigInt(fields[5]),
          maxBatcherFeeEachTime: PlutusInt.unwrapToBigInt(fields[6]),
        };
      }
      case OrderV2StepType.WITHDRAW_IMBALANCE: {
        return {
          type: constructor,
          withdrawalAmountOption: OrderV2WithdrawAmountOption.fromPlutusJson(fields[0]),
          ratioAssetA: PlutusInt.unwrapToBigInt(fields[1]),
          ratioAssetB: PlutusInt.unwrapToBigInt(fields[2]),
          minimumAssetA: PlutusInt.unwrapToBigInt(fields[3]),
          killable: OrderV2Killable.fromPlutusJson(fields[4]),
        };
      }
      case OrderV2StepType.SWAP_MULTI_ROUTING:
        return {
          type: constructor,
          routings: PlutusList.unwrap(fields[0]).map(OrderV2SwapRouting.fromPlutusJson),
          swapAmountOption: OrderV2SwapAmountOption.fromPlutusJson(fields[1]),
          minimumReceived: PlutusInt.unwrapToBigInt(fields[2]),
        };
      case OrderV2StepType.DONATION:
        return {
          type: constructor,
        };
      default:
        throw new InvalidOrder.OrderError(
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `Unexpected Constr ${d} when decoding Step`,
        );
    }
  }

  export function toPlutusJson(data: OrderV2Step): PlutusData {
    switch (data.type) {
      case OrderV2StepType.SWAP_EXACT_IN:
        return {
          constructor: data.type,
          fields: [
            OrderV2Direction.toPlutusJson(data.direction),
            OrderV2SwapAmountOption.toPlutusJson(data.swapAmountOption),
            PlutusInt.wrap(data.minimumReceived),
            OrderV2Killable.toPlutusJson(data.killable),
          ],
        };
      case OrderV2StepType.STOP_LOSS:
        return {
          constructor: data.type,
          fields: [
            OrderV2Direction.toPlutusJson(data.direction),
            OrderV2SwapAmountOption.toPlutusJson(data.swapAmountOption),
            PlutusInt.wrap(data.stopLossReceived),
          ],
        };
      case OrderV2StepType.OCO:
        return {
          constructor: data.type,
          fields: [
            OrderV2Direction.toPlutusJson(data.direction),
            OrderV2SwapAmountOption.toPlutusJson(data.swapAmountOption),
            PlutusInt.wrap(data.minimumReceived),
            PlutusInt.wrap(data.stopLossReceived),
          ],
        };
      case OrderV2StepType.SWAP_EXACT_OUT:
        return {
          constructor: data.type,
          fields: [
            OrderV2Direction.toPlutusJson(data.direction),
            OrderV2SwapAmountOption.toPlutusJson(data.maximumSwapAmountOption),
            PlutusInt.wrap(data.expectedReceived),
            OrderV2Killable.toPlutusJson(data.killable),
          ],
        };
      case OrderV2StepType.DEPOSIT:
        return {
          constructor: data.type,
          fields: [
            OrderV2DepositAmountOption.toPlutusJson(data.depositAmountOption),
            PlutusInt.wrap(data.minimumLP),
            OrderV2Killable.toPlutusJson(data.killable),
          ],
        };
      case OrderV2StepType.WITHDRAW:
        return {
          constructor: data.type,
          fields: [
            OrderV2WithdrawAmountOption.toPlutusJson(data.withdrawalAmountOption),
            PlutusInt.wrap(data.minimumAssetA),
            PlutusInt.wrap(data.minimumAssetB),
            OrderV2Killable.toPlutusJson(data.killable),
          ],
        };
      case OrderV2StepType.ZAP_OUT:
        return {
          constructor: data.type,
          fields: [
            OrderV2Direction.toPlutusJson(data.direction),
            OrderV2WithdrawAmountOption.toPlutusJson(data.withdrawalAmountOption),
            PlutusInt.wrap(data.minimumReceived),
            OrderV2Killable.toPlutusJson(data.killable),
          ],
        };
      case OrderV2StepType.PARTIAL_SWAP:
        return {
          constructor: data.type,
          fields: [
            OrderV2Direction.toPlutusJson(data.direction),
            PlutusInt.wrap(data.totalSwapAmount),
            PlutusInt.wrap(data.ioRatioNumerator),
            PlutusInt.wrap(data.ioRatioDenominator),
            PlutusInt.wrap(data.hops),
            PlutusInt.wrap(data.minimumSwapAmountRequired),
            PlutusInt.wrap(data.maxBatcherFeeEachTime),
          ],
        };
      case OrderV2StepType.WITHDRAW_IMBALANCE:
        return {
          constructor: data.type,
          fields: [
            OrderV2WithdrawAmountOption.toPlutusJson(data.withdrawalAmountOption),
            PlutusInt.wrap(data.ratioAssetA),
            PlutusInt.wrap(data.ratioAssetB),
            PlutusInt.wrap(data.minimumAssetA),
            OrderV2Killable.toPlutusJson(data.killable),
          ],
        };
      case OrderV2StepType.SWAP_MULTI_ROUTING:
        return {
          constructor: data.type,
          fields: [
            {
              list: data.routings.map(OrderV2SwapRouting.toPlutusJson),
            },
            OrderV2SwapAmountOption.toPlutusJson(data.swapAmountOption),
            PlutusInt.wrap(data.minimumReceived),
          ],
        };
      case OrderV2StepType.DONATION: {
        return {
          constructor: data.type,
          fields: [],
        };
      }
    }
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>): OrderV2Step {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData);
  }

  export function toDataHex(data: OrderV2Step): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }
}

export type OrderV2ExpirySetting = {
  expiredTime: bigint;
  maxCancellingTip: bigint;
};

export namespace OrderV2ExpirySetting {
  export function fromPlutusJson(d: PlutusData): OrderV2ExpirySetting {
    const data = PlutusList.unwrap(d).map(PlutusInt.unwrapToBigInt);
    InvalidOrder.assert(
      data.length === 2,
      InvalidOrder.ErrorCode.INVALID_PARAMETER,
      `expiry setting must have 2 elements`,
    );
    return {
      expiredTime: data[0],
      maxCancellingTip: data[1],
    };
  }

  export function toPlutusJson(data: OrderV2ExpirySetting): PlutusData {
    return { list: [PlutusInt.wrap(data.expiredTime), PlutusInt.wrap(data.maxCancellingTip)] };
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>): OrderV2ExpirySetting {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData);
  }

  export function toDataHex(data: OrderV2ExpirySetting): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }
}

export enum OrderV2ExtraDatumType {
  NO_DATUM = 0,
  DATUM_HASH = 1,
  INLINE_DATUM = 2,
}
export type OrderV2ExtraDatum =
  | {
      type: OrderV2ExtraDatumType.NO_DATUM;
    }
  | {
      type: OrderV2ExtraDatumType.DATUM_HASH | OrderV2ExtraDatumType.INLINE_DATUM;
      hash: Bytes;
    };

export namespace OrderV2ExtraDatum {
  export function fromPlutusJson(d: PlutusData): OrderV2ExtraDatum {
    const { constructor, fields } = PlutusConstr.unwrap(d, {
      [0]: 0,
      [1]: 1,
      [2]: 1,
    });

    switch (constructor) {
      case 0: {
        return {
          type: OrderV2ExtraDatumType.NO_DATUM,
        };
      }
      case 1: {
        return {
          type: OrderV2ExtraDatumType.DATUM_HASH,
          hash: Bytes.fromHex(PlutusBytes.unwrap(fields[0])),
        };
      }
      case 2: {
        return {
          type: OrderV2ExtraDatumType.INLINE_DATUM,
          hash: Bytes.fromHex(PlutusBytes.unwrap(fields[0])),
        };
      }
      default:
        throw new InvalidOrder.OrderError(
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `Unexpected Constr ${d} when decoding OrderExtraDatum`,
        );
    }
  }

  export function toPlutusJson(data: OrderV2ExtraDatum): PlutusData {
    switch (data.type) {
      case OrderV2ExtraDatumType.NO_DATUM: {
        return {
          constructor: data.type,
          fields: [],
        };
      }
      case OrderV2ExtraDatumType.DATUM_HASH: {
        return {
          constructor: data.type,
          fields: [PlutusBytes.wrap(data.hash)],
        };
      }
      case OrderV2ExtraDatumType.INLINE_DATUM: {
        return {
          constructor: data.type,
          fields: [PlutusBytes.wrap(data.hash)],
        };
      }
    }
  }

  export function toDatumSource(
    data: OrderV2ExtraDatum,
    mapDatum: Record<string, string>,
  ): Result<Maybe<DatumSource>, Error> {
    switch (data.type) {
      case OrderV2ExtraDatumType.NO_DATUM: {
        return Result.ok(undefined);
      }
      case OrderV2ExtraDatumType.DATUM_HASH: {
        if (mapDatum?.[data.hash.hex]) {
          const datum = mapDatum[data.hash.hex];
          return Result.ok(DatumSource.newOutlineDatum(Bytes.fromHex(datum)));
        } else {
          return Result.ok(DatumSource.newDatumHash(data.hash));
        }
      }
      case OrderV2ExtraDatumType.INLINE_DATUM: {
        if (mapDatum?.[data.hash.hex]) {
          const datum = mapDatum[data.hash.hex];
          return Result.ok(DatumSource.newInlineDatum(Bytes.fromHex(datum)));
        } else {
          return Result.err(new Error(`OrderV2ExtraDatum.toDatumSource: require datum to build Inline Datum Source`));
        }
      }
    }
  }

  export function newNoDatum(): OrderV2ExtraDatum {
    return {
      type: OrderV2ExtraDatumType.NO_DATUM,
    };
  }

  export function newDatumHash(hash: Bytes): OrderV2ExtraDatum {
    return {
      type: OrderV2ExtraDatumType.DATUM_HASH,
      hash: hash,
    };
  }

  export function newInlineDatum(hash: Bytes): OrderV2ExtraDatum {
    return {
      type: OrderV2ExtraDatumType.INLINE_DATUM,
      hash: hash,
    };
  }
}

export type OrderV2Author = {
  canceller: OrderV2AuthorizationMethod;
  refundReceiver: Address;
  refundReceiverDatum: OrderV2ExtraDatum;
  successReceiver: Address;
  successReceiverDatum: OrderV2ExtraDatum;
};

export type OrderV2Datum = {
  author: OrderV2Author;
  lpAsset: Asset;
  step: OrderV2Step;
  maxBatcherFee: bigint;
  expiredOptions: Maybe<OrderV2ExpirySetting>;
};

export namespace OrderV2Datum {
  export function fromPlutusJson(d: PlutusData, networkEnvironment: NetworkEnvironment): OrderV2Datum {
    const { fields } = PlutusConstr.unwrap(d, { [0]: 9 });
    return {
      author: {
        canceller: OrderV2AuthorizationMethod.fromPlutusJson(fields[0]),
        refundReceiver: Address.fromPlutusJson(fields[1], networkEnvironment),
        refundReceiverDatum: OrderV2ExtraDatum.fromPlutusJson(fields[2]),
        successReceiver: Address.fromPlutusJson(fields[3], networkEnvironment),
        successReceiverDatum: OrderV2ExtraDatum.fromPlutusJson(fields[4]),
      },
      lpAsset: Asset.fromPlutusJson(fields[5]),
      step: OrderV2Step.fromPlutusJson(fields[6]),
      maxBatcherFee: PlutusInt.unwrapToBigInt(fields[7]),
      expiredOptions: Maybe.map(PlutusMaybe.unwrap(fields[8]), OrderV2ExpirySetting.fromPlutusJson),
    };
  }

  export function toPlutusJson(data: OrderV2Datum): PlutusData {
    return {
      constructor: 0,
      fields: [
        OrderV2AuthorizationMethod.toPlutusJson(data.author.canceller),
        data.author.refundReceiver.toPlutusJson(),
        OrderV2ExtraDatum.toPlutusJson(data.author.refundReceiverDatum),
        data.author.successReceiver.toPlutusJson(),
        OrderV2ExtraDatum.toPlutusJson(data.author.successReceiverDatum),
        data.lpAsset.toPlutusJson(),
        OrderV2Step.toPlutusJson(data.step),
        PlutusInt.wrap(data.maxBatcherFee),
        PlutusMaybe.wrap(Maybe.map(data.expiredOptions, OrderV2ExpirySetting.toPlutusJson)),
      ],
    };
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>, networkEnvironment: NetworkEnvironment): OrderV2Datum {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData, networkEnvironment);
  }

  export function toDataHex(data: OrderV2Datum): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }

  export function getCancellerAddress(datum: OrderV2Datum): Address {
    const { author } = datum;
    const { canceller, refundReceiver, successReceiver } = author;
    const refundHash: Maybe<Bytes> = Maybe.isJust(refundReceiver.toPubKeyHash())
      ? refundReceiver.toPubKeyHash()?.keyHash
      : refundReceiver.toScriptHash();
    const successHash: Maybe<Bytes> = Maybe.isJust(successReceiver.toPubKeyHash())
      ? successReceiver.toPubKeyHash()?.keyHash
      : successReceiver.toScriptHash();
    let credentialType: CredentialType;
    switch (canceller.type) {
      case OrderV2AuthorizationMethodType.SIGNATURE: {
        credentialType = CredentialType.PUB_KEY_CREDENTIAL;
        break;
      }
      case OrderV2AuthorizationMethodType.MINT_SCRIPT: {
        credentialType = CredentialType.SCRIPT_CREDENTIAL;
        break;
      }
      case OrderV2AuthorizationMethodType.SPEND_SCRIPT: {
        credentialType = CredentialType.SCRIPT_CREDENTIAL;
        break;
      }
      case OrderV2AuthorizationMethodType.WITHDRAW_SCRIPT: {
        credentialType = CredentialType.SCRIPT_CREDENTIAL;
        break;
      }
    }
    if (Maybe.isJust(refundHash) && canceller.hash.equals(refundHash)) {
      return refundReceiver;
    } else if (Maybe.isJust(successHash) && canceller.hash.equals(successHash)) {
      return successReceiver;
    } else {
      return Address.fromCardanoAddress({
        type: AddressType.ENTERPRISE_ADDRESS,
        network: refundReceiver.network(),
        payment: {
          type: credentialType,
          payload: canceller.hash,
        },
      });
    }
  }

  export function validateOnChainConstraint(datum: OrderV2Datum, networkEnv: NetworkEnvironment): void {
    const config = getDexV2Configs(networkEnv);
    const { author, lpAsset, expiredOptions, maxBatcherFee, step } = datum;
    InvalidOrder.assert(
      maxBatcherFee > 0n,
      InvalidOrder.ErrorCode.INVALID_PARAMETER,
      `maxBatcherFee: ${maxBatcherFee}`,
    );
    const { canceller, refundReceiverDatum, successReceiverDatum } = author;
    InvalidOrder.assert(
      canceller.hash.length === 28,
      InvalidOrder.ErrorCode.INVALID_PARAMETER,
      `cancellerHash: ${canceller.hash.hex}`,
    );
    if (refundReceiverDatum.type !== OrderV2ExtraDatumType.NO_DATUM) {
      InvalidOrder.assert(
        refundReceiverDatum.hash.length === 32,
        InvalidOrder.ErrorCode.INVALID_PARAMETER,
        `refundReceiverDatum: ${refundReceiverDatum.hash.hex}`,
      );
    }
    if (successReceiverDatum.type !== OrderV2ExtraDatumType.NO_DATUM) {
      InvalidOrder.assert(
        successReceiverDatum.hash.length === 32,
        InvalidOrder.ErrorCode.INVALID_PARAMETER,
        `successReceiverDatum: ${successReceiverDatum.hash.hex}`,
      );
    }
    InvalidOrder.assert(
      lpAsset.currencySymbol.equals(config.lpPolicyId),
      InvalidOrder.ErrorCode.INVALID_PARAMETER,
      `lpAsset: ${lpAsset.toString()}`,
    );
    if (expiredOptions) {
      InvalidOrder.assert(
        expiredOptions.maxCancellingTip >= 0n,
        InvalidOrder.ErrorCode.INVALID_PARAMETER,
        `maxCancellingTip: ${expiredOptions.maxCancellingTip}`,
      );
    }
    switch (step.type) {
      case OrderV2StepType.SWAP_EXACT_IN: {
        const { minimumReceived, swapAmountOption } = step;
        InvalidOrder.assert(
          minimumReceived > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `minimumReceived: ${minimumReceived}`,
        );
        OrderV2SwapAmountOption.validateOnChainConstraint(swapAmountOption);
        break;
      }
      case OrderV2StepType.STOP_LOSS: {
        const { stopLossReceived, swapAmountOption } = step;
        InvalidOrder.assert(
          stopLossReceived > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `stopLossReceived: ${stopLossReceived}`,
        );
        OrderV2SwapAmountOption.validateOnChainConstraint(swapAmountOption);
        break;
      }
      case OrderV2StepType.OCO: {
        const { swapAmountOption, stopLossReceived, minimumReceived } = step;
        InvalidOrder.assert(
          stopLossReceived > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `stopLossReceived: ${stopLossReceived}`,
        );
        InvalidOrder.assert(
          minimumReceived > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `minimumReceived: ${minimumReceived}`,
        );
        OrderV2SwapAmountOption.validateOnChainConstraint(swapAmountOption);
        break;
      }
      case OrderV2StepType.SWAP_EXACT_OUT: {
        const { maximumSwapAmountOption, expectedReceived } = step;
        InvalidOrder.assert(
          expectedReceived > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `expectedReceived: ${expectedReceived}`,
        );
        OrderV2SwapAmountOption.validateOnChainConstraint(maximumSwapAmountOption);
        break;
      }
      case OrderV2StepType.DEPOSIT: {
        const { minimumLP, depositAmountOption } = step;
        InvalidOrder.assert(minimumLP > 0n, InvalidOrder.ErrorCode.INVALID_PARAMETER, `minimumLP: ${minimumLP}`);
        OrderV2DepositAmountOption.validateOnChainConstraint(depositAmountOption);
        break;
      }
      case OrderV2StepType.WITHDRAW: {
        const { minimumAssetA, minimumAssetB, withdrawalAmountOption } = step;
        InvalidOrder.assert(
          minimumAssetA > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `minimumAssetA: ${minimumAssetA}`,
        );
        InvalidOrder.assert(
          minimumAssetB > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `minimumAssetB: ${minimumAssetB}`,
        );
        OrderV2WithdrawAmountOption.validateOnChainConstraint(withdrawalAmountOption);
        break;
      }
      case OrderV2StepType.ZAP_OUT: {
        const { minimumReceived, withdrawalAmountOption } = step;
        InvalidOrder.assert(
          minimumReceived > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `minimumReceived: ${minimumReceived}`,
        );
        OrderV2WithdrawAmountOption.validateOnChainConstraint(withdrawalAmountOption);
        break;
      }
      case OrderV2StepType.PARTIAL_SWAP: {
        const {
          ioRatioNumerator,
          ioRatioDenominator,
          hops,
          totalSwapAmount,
          minimumSwapAmountRequired,
          maxBatcherFeeEachTime,
        } = step;
        InvalidOrder.assert(
          ioRatioNumerator > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `ioRatioNumerator: ${ioRatioNumerator}`,
        );
        InvalidOrder.assert(
          ioRatioDenominator > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `ioRatioDenominator: ${ioRatioDenominator}`,
        );
        InvalidOrder.assert(hops > 0n, InvalidOrder.ErrorCode.INVALID_PARAMETER, `hops: ${hops}`);
        InvalidOrder.assert(
          minimumSwapAmountRequired > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `minimumSwapAmountRequired: ${minimumSwapAmountRequired}`,
        );
        InvalidOrder.assert(
          maxBatcherFeeEachTime > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `maxBatcherFeeEachTime: ${maxBatcherFeeEachTime}`,
        );
        InvalidOrder.assert(
          totalSwapAmount > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `totalSwapAmount: ${totalSwapAmount}`,
        );
        InvalidOrder.assert(
          totalSwapAmount >= minimumSwapAmountRequired,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `totalSwapAmount: ${totalSwapAmount}`,
          `minimumSwapAmountRequired: ${minimumSwapAmountRequired}`,
        );
        break;
      }
      case OrderV2StepType.WITHDRAW_IMBALANCE: {
        const { minimumAssetA, ratioAssetA, ratioAssetB, withdrawalAmountOption } = step;
        InvalidOrder.assert(
          minimumAssetA > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `minimumAssetA: ${minimumAssetA}`,
        );
        InvalidOrder.assert(ratioAssetA > 0n, InvalidOrder.ErrorCode.INVALID_PARAMETER, `ratioAssetA: ${ratioAssetA}`);
        InvalidOrder.assert(ratioAssetB > 0n, InvalidOrder.ErrorCode.INVALID_PARAMETER, `ratioAssetB: ${ratioAssetA}`);
        OrderV2WithdrawAmountOption.validateOnChainConstraint(withdrawalAmountOption);
        break;
      }
      case OrderV2StepType.SWAP_MULTI_ROUTING: {
        const { minimumReceived, routings, swapAmountOption } = step;
        InvalidOrder.assert(
          minimumReceived > 0n,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `minimumReceived: ${minimumReceived}`,
        );
        InvalidOrder.assert(
          routings.length > 1,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `routings length: ${routings.length}`,
        );
        OrderV2SwapAmountOption.validateOnChainConstraint(swapAmountOption);
        break;
      }
      case OrderV2StepType.DONATION: {
        break;
      }
    }
  }
}

export enum OrderV2Redeemer {
  APPLY_ORDER = 0,
  CANCEL_ORDER_BY_OWNER = 1,
  CANCEL_EXPIRED_ORDER_BY_ANYONE = 2,
}

export namespace OrderV2Redeemer {
  export function fromPlutusJson(d: PlutusData): OrderV2Redeemer {
    const { constructor } = PlutusConstr.unwrap(d, {
      [0]: 0,
      [1]: 0,
      [2]: 0,
    });
    return constructor;
  }

  export function toPlutusJson(data: OrderV2Redeemer): PlutusData {
    return {
      constructor: data,
      fields: [],
    };
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>): OrderV2Redeemer {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData);
  }

  export function toDataHex(data: OrderV2Redeemer): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }
}

export type DexV2OrderInfo = { depositAda: bigint; unrelatedValue: Value } & (
  | {
      type: "SWAP";
      swapAsset: Asset;
      swapAmount: bigint;
      toAsset: Asset;
    }
  | {
      type: "ROUTING";
      swapAsset: Asset;
      swapAmount: bigint;
    }
  | {
      type: "DEPOSIT";
      depositA: bigint;
      depositB: bigint;
    }
  | {
      type: "WITHDRAW";
      withdrawalAmount: bigint;
    }
  | {
      type: "ZAP_OUT";
      withdrawalAmount: bigint;
      toAsset: Asset;
    }
  | {
      type: "DONATE";
      donateA: bigint;
      donateB: bigint;
    }
);

export type OrderV2Constructor = {
  txIn: TxIn;
  address: Address;
  value: Value;
  datum: OrderV2Datum;
  rawDatum: string;
  networkEnv: NetworkEnvironment;
  // Only for testing purpose,
  // DO NOT ENABLE THIS FLAG ON PRODUCTION
  dangerousSkipCheck?: boolean;
};

export class OrderV2 extends BaseUtxoModel {
  readonly datum: OrderV2Datum;
  readonly networkEnv: NetworkEnvironment;

  private constructor({ txIn, address, value, datum, rawDatum, networkEnv }: OrderV2Constructor) {
    super(txIn, address, value, rawDatum);
    this.datum = datum;
    this.networkEnv = networkEnv;
  }

  static new(constr: OrderV2Constructor): Result<OrderV2, InvalidOrder> {
    const validationResult = OrderV2.validateOrder(constr);
    if (validationResult.type === "err") {
      return validationResult;
    }
    return Result.ok(new OrderV2(constr));
  }

  /**
   * This function might throw an error if the constructor contains invalid data
   * @param constructor
   * @returns the constructed order
   */
  static newUnsafe(constr: OrderV2Constructor): OrderV2 {
    return Result.unwrap(OrderV2.new(constr));
  }

  static validateOrder({
    txIn,
    address,
    value,
    datum,
    dangerousSkipCheck: skipCheck,
    networkEnv,
  }: OrderV2Constructor): Result<null, InvalidOrder> {
    if (skipCheck) {
      return Result.ok(null);
    }
    const { maxBatcherFee } = datum;
    try {
      const valueWithoutFee = value.clone().subtract(ADA, maxBatcherFee).trim();
      const availableAda = valueWithoutFee.get(ADA);
      InvalidOrder.assert(availableAda >= 0n, InvalidOrder.ErrorCode.INVALID_VALUE, `ADA require: ${maxBatcherFee}`);
      OrderV2Datum.validateOnChainConstraint(datum, networkEnv);
      return Result.ok(null);
    } catch (err) {
      return Result.err({
        dexVersion: DexVersion.DEX_V2,
        txIn: txIn,
        utxoAddress: address,
        owner: OrderV2Datum.getCancellerAddress(datum),
        value: value,
        datumHash: undefined,
        datum: OrderV2Datum.toDataHex(datum),
        reason: InvalidOrder.OrderError.new(err),
      });
    }
  }

  getOrderInfo(pair: [Asset, Asset]): Result<DexV2OrderInfo, InvalidOrder> {
    const [assetA, assetB] = normalizePair(pair);
    const step = this.datum.step;
    const maxBatcherFee = this.datum.maxBatcherFee;
    const valueWithoutFee = this.value.clone().subtract(ADA, maxBatcherFee).trim();
    try {
      let orderInfo: DexV2OrderInfo;
      switch (step.type) {
        case OrderV2StepType.SWAP_EXACT_IN:
        case OrderV2StepType.STOP_LOSS:
        case OrderV2StepType.OCO:
        case OrderV2StepType.SWAP_EXACT_OUT:
        case OrderV2StepType.PARTIAL_SWAP: {
          const { direction } = step;
          const [assetIn, assetOut] = direction === OrderV2Direction.A_TO_B ? [assetA, assetB] : [assetB, assetA];
          const swapAmount = OrderV2.getSwapAmount({
            step: step,
            assetIn: assetIn,
            orderValue: this.value,
          });
          InvalidOrder.assert(
            swapAmount > 0n,
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `missing swap asset, swap amount request: ${swapAmount}`,
          );
          const remainingValue = valueWithoutFee.clone().subtract(assetIn, swapAmount).trim();
          InvalidOrder.assert(
            remainingValue.isNonNegative(),
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `value cannot cover swap amount and fee`,
            `swap amount: ${swapAmount}`,
            `fee: ${maxBatcherFee}`,
          );
          orderInfo = {
            type: "SWAP",
            swapAsset: assetIn,
            toAsset: assetOut,
            swapAmount: swapAmount,
            depositAda: remainingValue.get(ADA),
            unrelatedValue: remainingValue,
          };
          break;
        }
        case OrderV2StepType.SWAP_MULTI_ROUTING: {
          const direction = step.routings[0].direction;
          const assetIn = direction === OrderV2Direction.A_TO_B ? assetA : assetB;
          const swapAmount = OrderV2.getSwapAmount({
            step: step,
            assetIn: assetIn,
            orderValue: this.value,
          });
          InvalidOrder.assert(
            swapAmount > 0n,
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `missing swap asset, swap amount request: ${swapAmount}`,
          );
          const remainingValue = valueWithoutFee.clone().subtract(assetIn, swapAmount).trim();
          InvalidOrder.assert(
            remainingValue.isNonNegative(),
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `value cannot cover swap amount and fee`,
            `swap amount: ${swapAmount}`,
            `fee: ${maxBatcherFee}`,
          );
          orderInfo = {
            type: "ROUTING",
            swapAsset: assetIn,
            swapAmount: swapAmount,
            depositAda: remainingValue.get(ADA),
            unrelatedValue: remainingValue,
          };
          break;
        }
        case OrderV2StepType.DEPOSIT: {
          const { depositAmountA, depositAmountB } = OrderV2.getDepositAmount({
            step: step,
            assetA: assetA,
            assetB: assetB,
            orderValue: this.value,
          });
          InvalidOrder.assert(
            depositAmountA >= 0n,
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `depositAmountA: ${depositAmountA}`,
          );
          InvalidOrder.assert(
            depositAmountB >= 0n,
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `depositAmountA: ${depositAmountB}`,
          );
          InvalidOrder.assert(
            depositAmountA + depositAmountB > 0n,
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `totalDeposit: ${depositAmountA + depositAmountB}`,
          );
          const remainingValue = valueWithoutFee
            .clone()
            .subtract(assetA, depositAmountA)
            .subtract(assetB, depositAmountB)
            .trim();
          InvalidOrder.assert(
            remainingValue.isNonNegative(),
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `value cannot cover deposit amount and fee`,
            `deposit amount A: ${depositAmountA}`,
            `deposit amount B: ${depositAmountB}`,
            `fee: ${maxBatcherFee}`,
          );
          orderInfo = {
            type: "DEPOSIT",
            depositA: depositAmountA,
            depositB: depositAmountB,
            depositAda: remainingValue.get(ADA),
            unrelatedValue: remainingValue,
          };
          break;
        }
        case OrderV2StepType.WITHDRAW:
        case OrderV2StepType.WITHDRAW_IMBALANCE: {
          const withdrawalLPAmount = OrderV2.getWithdrawAmount({
            step: step,
            lpAsset: this.lpAsset,
            orderValue: this.value,
          });
          InvalidOrder.assert(
            withdrawalLPAmount > 0n,
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `missing withdrawal asset, withdrawal amount request: ${withdrawalLPAmount}`,
          );
          const remainingValue = valueWithoutFee.clone().subtract(this.lpAsset, withdrawalLPAmount).trim();
          InvalidOrder.assert(
            remainingValue.isNonNegative(),
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `value cannot cover withdrawal amount and fee`,
            `withdrawal amount: ${withdrawalLPAmount}`,
            `fee: ${maxBatcherFee}`,
          );
          orderInfo = {
            type: "WITHDRAW",
            withdrawalAmount: withdrawalLPAmount,
            depositAda: remainingValue.get(ADA),
            unrelatedValue: remainingValue,
          };
          break;
        }
        case OrderV2StepType.ZAP_OUT: {
          const { direction } = step;
          const assetOut = direction === OrderV2Direction.A_TO_B ? assetB : assetA;
          const withdrawalLPAmount = OrderV2.getWithdrawAmount({
            step: step,
            lpAsset: this.lpAsset,
            orderValue: valueWithoutFee,
          });
          InvalidOrder.assert(
            withdrawalLPAmount > 0n,
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `missing withdrawal asset, withdrawal amount request: ${withdrawalLPAmount}`,
          );
          const remainingValue = valueWithoutFee.clone().subtract(this.lpAsset, withdrawalLPAmount).trim();
          InvalidOrder.assert(
            remainingValue.isNonNegative(),
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `value cannot cover zap out amount and fee`,
            `zap out amount: ${withdrawalLPAmount}`,
            `fee: ${maxBatcherFee}`,
          );
          orderInfo = {
            type: "ZAP_OUT",
            withdrawalAmount: withdrawalLPAmount,
            toAsset: assetOut,
            depositAda: remainingValue.get(ADA),
            unrelatedValue: remainingValue,
          };
          break;
        }
        case OrderV2StepType.DONATION: {
          /**
           * TODO: Consider update the donation validation
           * In On-chain, we ensure that the donation order has enough batcher fee by using @var usedBatcherFee instead of @var maxBatcherFee
           * References: https://github.com/minswap/minswap-dex-v2/blob/main/lib/amm_dex_v2/order_validation.ak#L994
           */
          const donateAmountA = valueWithoutFee.get(assetA);
          const donateAmountB = valueWithoutFee.get(assetB);
          InvalidOrder.assert(
            donateAmountA >= 0n,
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `donateAmountA: ${donateAmountA}`,
          );
          InvalidOrder.assert(
            donateAmountB >= 0n,
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `donateAmountB: ${donateAmountB}`,
          );
          InvalidOrder.assert(
            donateAmountA + donateAmountB > 0n,
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `totalDonation: ${donateAmountA + donateAmountB}`,
          );
          const remainingValue = valueWithoutFee
            .clone()
            .subtract(assetA, donateAmountA)
            .subtract(assetB, donateAmountB)
            .trim();
          InvalidOrder.assert(
            remainingValue.isNonNegative(),
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `value cannot cover donation amount and fee`,
            `donation amount A: ${donateAmountA}`,
            `donation amount B: ${donateAmountB}`,
            `fee: ${maxBatcherFee}`,
          );
          orderInfo = {
            type: "DONATE",
            donateA: donateAmountA,
            donateB: donateAmountB,
            depositAda: remainingValue.get(ADA),
            unrelatedValue: remainingValue,
          };
          break;
        }
      }
      return Result.ok(orderInfo);
    } catch (err) {
      return Result.err({
        dexVersion: DexVersion.DEX_V2,
        txIn: this.txIn,
        utxoAddress: this.address,
        owner: OrderV2Datum.getCancellerAddress(this.datum),
        value: this.value,
        datumHash: undefined,
        datum: OrderV2Datum.toDataHex(this.datum),
        reason: InvalidOrder.OrderError.new(err),
      });
    }
  }

  validateOrderOnBatching({
    pair,
    customBatcherFee,
    executionTime,
  }: {
    pair: [Asset, Asset];
    customBatcherFee?: bigint;
    executionTime: bigint;
  }): Result<DexV2OrderInfo, InvalidOrder.OrderError> {
    const isExpired = this.isExpired(executionTime);
    if (isExpired) {
      return Result.err(new InvalidOrder.OrderError(InvalidOrder.ErrorCode.EXPIRED, `executionTime: ${executionTime}`));
    }
    const batcherFeeResult = this.validateAndGetBatcherFee(customBatcherFee);
    if (batcherFeeResult.type === "err") {
      return batcherFeeResult;
    }

    const orderInfoResult = this.getOrderInfo(pair);
    if (orderInfoResult.type === "err") {
      return Result.err(orderInfoResult.error.reason);
    }
    return Result.ok(orderInfoResult.value);
  }

  validateAndGetBatcherFee(customBatcherFee?: bigint): Result<bigint, InvalidOrder.OrderError> {
    let maxBatcherFee: bigint;
    switch (this.datum.step.type) {
      case OrderV2StepType.PARTIAL_SWAP: {
        maxBatcherFee = this.datum.step.maxBatcherFeeEachTime;
        break;
      }
      default: {
        maxBatcherFee = this.datum.maxBatcherFee;
      }
    }
    if (maxBatcherFee <= 0n) {
      return Result.err(
        new InvalidOrder.OrderError(InvalidOrder.ErrorCode.INVALID_PARAMETER, `maxBatcherFee : ${maxBatcherFee}`),
      );
    }
    if (customBatcherFee) {
      if (customBatcherFee <= 0n) {
        return Result.err(
          new InvalidOrder.OrderError(
            InvalidOrder.ErrorCode.INVALID_PARAMETER,
            `customBatcherFee : ${customBatcherFee}`,
          ),
        );
      }
      if (customBatcherFee > maxBatcherFee) {
        return Result.err(
          new InvalidOrder.OrderError(
            InvalidOrder.ErrorCode.MISSING_BATCHER_FEE,
            `require fee : ${customBatcherFee}`,
            `offer: ${maxBatcherFee}`,
          ),
        );
      }
      return Result.ok(customBatcherFee);
    } else {
      return Result.ok(maxBatcherFee);
    }
  }

  isExpired(executionTime: bigint): boolean {
    const { expiredOptions } = this.datum;
    if (Maybe.isNothing(expiredOptions)) {
      return false;
    }
    return executionTime > expiredOptions.expiredTime;
  }

  get lpAsset(): Asset {
    return this.datum.lpAsset;
  }

  /** @returns A unique string key for this order */
  get key(): string {
    return TxIn.toString(this.txIn);
  }

  get canceller(): OrderV2AuthorizationMethod {
    return this.datum.author.canceller;
  }

  get refundReceiver(): Address {
    return this.datum.author.refundReceiver;
  }

  get refundReceiverDatum(): OrderV2ExtraDatum {
    return this.datum.author.refundReceiverDatum;
  }

  get successReceiver(): Address {
    return this.datum.author.successReceiver;
  }

  get successReceiverDatum(): OrderV2ExtraDatum {
    return this.datum.author.successReceiverDatum;
  }

  /**
   * Return the address who can unlock the fund of an order
   */
  get owner(): Address {
    return OrderV2Datum.getCancellerAddress(this.datum);
  }

  toXJSON(): { $dexV2Order: OrderV2Constructor } {
    return {
      $dexV2Order: {
        txIn: this.txIn,
        address: this.address,
        value: this.value,
        datum: this.datum,
        rawDatum: this.rawDatum,
        networkEnv: this.networkEnv,
      },
    };
  }

  static fromUtxo({
    utxo,
    rawDatum,
    skipCheck,
    networkEnv,
  }: {
    utxo: Utxo;
    networkEnv: NetworkEnvironment;
    rawDatum?: Bytes;
    skipCheck?: boolean;
  }): Result<OrderV2, InvalidOrder> {
    const v2OrderScriptHash = getDexV2OrderScriptHash(networkEnv);
    const { input, output } = utxo;
    const { address, value } = output;
    let datumHash: Maybe<Bytes>;
    let datumRaw: Maybe<Bytes>;
    let datum: Maybe<OrderV2Datum>;
    try {
      InvalidOrder.assert(
        address.toScriptHash()?.equals(v2OrderScriptHash),
        InvalidOrder.ErrorCode.INVALID_SCRIPT_HASH,
      );
      if (output.includeInlineDatums()) {
        datumRaw = Result.unwrap(utxo.output.getInlineDatum());
        datum = OrderV2Datum.fromDataHex(datumRaw.hex, networkEnv);
      } else {
        // eslint-disable-next-line @minswap/result-type-handling
        const datumHashResult = output.getDatumHash();
        InvalidOrder.assert(datumHashResult.type === "ok", InvalidOrder.ErrorCode.MISSING_DATUM_HASH);
        datumHash = datumHashResult.value;
        InvalidOrder.assert(Maybe.isJust(rawDatum), InvalidOrder.ErrorCode.MISSING_DATUM_HASH);
        datumRaw = rawDatum;
        datum = OrderV2Datum.fromDataHex(rawDatum.hex, networkEnv);
      }
      return OrderV2.new({
        txIn: input,
        address: address,
        value: value,
        datum: datum,
        rawDatum: datumRaw.hex,
        dangerousSkipCheck: skipCheck,
        networkEnv: networkEnv,
      });
    } catch (err) {
      return Result.err({
        dexVersion: DexVersion.DEX_V2,
        txIn: utxo.input,
        utxoAddress: address,
        owner: datum ? OrderV2Datum.getCancellerAddress(datum) : undefined,
        value: value,
        datumHash: datumHash?.hex,
        datum: rawDatum?.hex,
        reason: InvalidOrder.OrderError.new(err),
      });
    }
  }

  static getSwapAmount({
    step,
    assetIn,
    orderValue,
  }: {
    step:
      | OrderV2SwapExactInStep
      | OrderV2StopLossStep
      | OrderV2OcoStep
      | OrderV2SwapExactOutStep
      | OrderV2SwapMultiRoutingStep
      | OrderV2PartialSwapStep;
    assetIn: Asset;
    orderValue: Value;
  }): bigint {
    switch (step.type) {
      case OrderV2StepType.SWAP_EXACT_IN:
      case OrderV2StepType.STOP_LOSS:
      case OrderV2StepType.OCO:
      case OrderV2StepType.SWAP_MULTI_ROUTING: {
        const swapAmountOption = step.swapAmountOption;
        if (swapAmountOption.type === OrderV2AmountType.SPECIFIC_AMOUNT) {
          return swapAmountOption.swapAmount;
        } else {
          return orderValue.get(assetIn) - swapAmountOption.deductedAmount;
        }
      }
      case OrderV2StepType.SWAP_EXACT_OUT: {
        const swapAmountOption = step.maximumSwapAmountOption;
        if (swapAmountOption.type === OrderV2AmountType.SPECIFIC_AMOUNT) {
          return swapAmountOption.swapAmount;
        } else {
          return orderValue.get(assetIn) - swapAmountOption.deductedAmount;
        }
      }
      case OrderV2StepType.PARTIAL_SWAP: {
        return step.totalSwapAmount;
      }
    }
  }

  static getDepositAmount({
    step,
    assetA,
    assetB,
    orderValue,
  }: {
    step: OrderV2DepositStep;
    assetA: Asset;
    assetB: Asset;
    orderValue: Value;
  }): {
    depositAmountA: bigint;
    depositAmountB: bigint;
  } {
    switch (step.depositAmountOption.type) {
      case OrderV2AmountType.SPECIFIC_AMOUNT: {
        return {
          depositAmountA: step.depositAmountOption.depositAmountA,
          depositAmountB: step.depositAmountOption.depositAmountB,
        };
      }
      case OrderV2AmountType.ALL: {
        const deductedAmountA = step.depositAmountOption.deductedAmountA;
        const deductedAmountB = step.depositAmountOption.deductedAmountB;
        return {
          depositAmountA: orderValue.get(assetA) - deductedAmountA,
          depositAmountB: orderValue.get(assetB) - deductedAmountB,
        };
      }
    }
  }

  static getWithdrawAmount({
    step,
    lpAsset,
    orderValue,
  }: {
    step: OrderV2WithdrawStep | OrderV2WithdrawImbalanceStep | OrderV2ZapOutStep;
    lpAsset: Asset;
    orderValue: Value;
  }): bigint {
    switch (step.withdrawalAmountOption.type) {
      case OrderV2AmountType.SPECIFIC_AMOUNT: {
        return step.withdrawalAmountOption.withdrawalLPAmount;
      }
      case OrderV2AmountType.ALL: {
        return orderValue.get(lpAsset) - step.withdrawalAmountOption.deductedLPAmount;
      }
    }
  }

  static getDonationAmount({
    assetA,
    assetB,
    orderValue,
    batcherFee,
  }: {
    assetA: Asset;
    assetB: Asset;
    orderValue: Value;
    batcherFee: bigint;
  }): {
    donateAmountA: bigint;
    donateAmountB: bigint;
  } {
    const donateAmountA = assetA.equals(ADA) ? orderValue.get(assetA) - batcherFee : orderValue.get(assetA);
    const donateAmountB = orderValue.get(assetB);
    return {
      donateAmountA: donateAmountA,
      donateAmountB: donateAmountB,
    };
  }
}
