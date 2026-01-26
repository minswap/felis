import {
  ADA,
  Address,
  type Asset,
  BaseUtxoModel,
  Bytes,
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
} from "@minswap/felis-ledger-core";
import { type CborHex, type CSLPlutusData, Maybe, Result } from "@minswap/felis-ledger-utils";
import { DexVersion, InvalidOrder } from "@minswap/felis-dex-v2";
import { getLPAssetFromStableswapOrderAddress, getStableswapPoolConfigByLPAsset } from "./configs";

export type AssetAmount = {
  asset: Asset;
  amount: bigint;
};

export enum StableswapStepType {
  EXCHANGE = 0,
  DEPOSIT = 1,
  WITHDRAW = 2,
  WITHDRAW_IMBALANCE = 3,
  WITHDRAW_ONE_COIN = 4,
}

export type StableswapExchangeStep = {
  type: StableswapStepType.EXCHANGE;
  assetInIndex: bigint;
  assetOutIndex: bigint;
  minimumAssetOut: bigint;
};

export type StableswapDepositStep = {
  type: StableswapStepType.DEPOSIT;
  minimumLP: bigint;
};

export type StableswapWithdrawStep = {
  type: StableswapStepType.WITHDRAW;
  minimumAmounts: bigint[];
};

export type StableswapWithdrawImbalanceStep = {
  type: StableswapStepType.WITHDRAW_IMBALANCE;
  withdrawAmounts: bigint[];
};

export type StableswapWithdrawOneCoinStep = {
  type: StableswapStepType.WITHDRAW_ONE_COIN;
  assetOutIndex: bigint;
  minimumAssetOut: bigint;
};

export type StableswapStep =
  | StableswapExchangeStep
  | StableswapDepositStep
  | StableswapWithdrawStep
  | StableswapWithdrawImbalanceStep
  | StableswapWithdrawOneCoinStep;

export namespace StableswapStep {
  export function fromPlutusJson(d: PlutusData): StableswapStep {
    // biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
    const { constructor, fields } = PlutusConstr.unwrap(d, {
      [0]: 3,
      [1]: 1,
      [2]: 1,
      [3]: 1,
      [4]: 2,
    });
    switch (constructor) {
      case StableswapStepType.EXCHANGE:
        return {
          type: constructor,
          assetInIndex: PlutusInt.unwrapToBigInt(fields[0]),
          assetOutIndex: PlutusInt.unwrapToBigInt(fields[1]),
          minimumAssetOut: PlutusInt.unwrapToBigInt(fields[2]),
        };
      case StableswapStepType.DEPOSIT:
        return {
          type: constructor,
          minimumLP: PlutusInt.unwrapToBigInt(fields[0]),
        };
      case StableswapStepType.WITHDRAW:
        return {
          type: constructor,
          minimumAmounts: PlutusList.unwrap(fields[0]).map(PlutusInt.unwrapToBigInt),
        };
      case StableswapStepType.WITHDRAW_IMBALANCE:
        return {
          type: constructor,
          withdrawAmounts: PlutusList.unwrap(fields[0]).map(PlutusInt.unwrapToBigInt),
        };
      case StableswapStepType.WITHDRAW_ONE_COIN:
        return {
          type: constructor,
          assetOutIndex: PlutusInt.unwrapToBigInt(fields[0]),
          minimumAssetOut: PlutusInt.unwrapToBigInt(fields[1]),
        };
      default:
        throw new InvalidOrder.OrderError(
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `Unexpected Constr ${d} when decoding Step`,
        );
    }
  }

  export function toPlutusJson(data: StableswapStep): PlutusData {
    switch (data.type) {
      case StableswapStepType.EXCHANGE:
        return {
          constructor: data.type,
          fields: [
            PlutusInt.wrap(data.assetInIndex),
            PlutusInt.wrap(data.assetOutIndex),
            PlutusInt.wrap(data.minimumAssetOut),
          ],
        };
      case StableswapStepType.DEPOSIT:
        return {
          constructor: data.type,
          fields: [PlutusInt.wrap(data.minimumLP)],
        };
      case StableswapStepType.WITHDRAW:
        return {
          constructor: data.type,
          fields: [
            {
              list: data.minimumAmounts.map(PlutusInt.wrap),
            },
          ],
        };
      case StableswapStepType.WITHDRAW_IMBALANCE:
        return {
          constructor: data.type,
          fields: [
            {
              list: data.withdrawAmounts.map(PlutusInt.wrap),
            },
          ],
        };
      case StableswapStepType.WITHDRAW_ONE_COIN:
        return {
          constructor: data.type,
          fields: [PlutusInt.wrap(data.assetOutIndex), PlutusInt.wrap(data.minimumAssetOut)],
        };
    }
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>): StableswapStep {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData);
  }

  export function toDataHex(data: StableswapStep): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }
}

export type StableswapOrderDatum = {
  sender: Address;
  receiver: Address;
  receiverDatumHash: Maybe<string>;
  step: StableswapStep;
  batcherFee: bigint;
  outputADA: bigint;
};

export namespace StableswapOrderDatum {
  export function fromPlutusJson(d: PlutusData, networkEnvironment: NetworkEnvironment): StableswapOrderDatum {
    const { fields } = PlutusConstr.unwrap(d, { [0]: 6 });
    return {
      sender: Address.fromPlutusJson(fields[0], networkEnvironment),
      receiver: Address.fromPlutusJson(fields[1], networkEnvironment),
      receiverDatumHash: Maybe.map(PlutusMaybe.unwrap(fields[2]), PlutusBytes.unwrap),
      step: StableswapStep.fromPlutusJson(fields[3]),
      batcherFee: PlutusInt.unwrapToBigInt(fields[4]),
      outputADA: PlutusInt.unwrapToBigInt(fields[5]),
    };
  }

  export function toPlutusJson(data: StableswapOrderDatum): PlutusData {
    return {
      constructor: 0,
      fields: [
        data.sender.toPlutusJson(),
        data.receiver.toPlutusJson(),
        PlutusMaybe.wrap(Maybe.map(data.receiverDatumHash, (a) => Bytes.fromHex(a).toPlutusJson())),
        StableswapStep.toPlutusJson(data.step),
        PlutusInt.wrap(data.batcherFee),
        PlutusInt.wrap(data.outputADA),
      ],
    };
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>, networkEnvironment: NetworkEnvironment): StableswapOrderDatum {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData, networkEnvironment);
  }

  export function toDataHex(data: StableswapOrderDatum): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }
}

export enum StableswapOrderRedeemer {
  APPLY_ORDER = 0,
  CANCEL_ORDER = 1,
}

export namespace StableswapOrderRedeemer {
  export function fromPlutusJson(d: PlutusData): StableswapOrderRedeemer {
    // biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
    const { constructor } = PlutusConstr.unwrap(d, {
      [0]: 0,
      [1]: 0,
    });
    return constructor;
  }

  export function toPlutusJson(data: StableswapOrderRedeemer): PlutusData {
    return {
      constructor: data,
      fields: [],
    };
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>): StableswapOrderRedeemer {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData);
  }

  export function toDataHex(data: StableswapOrderRedeemer): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }
}

export type StableswapOrderInfo =
  | {
      type: "SWAP";
      swapAsset: Asset;
      swapAmount: bigint;
      toAsset: Asset;
    }
  | {
      type: "DEPOSIT";
      depositAssets: AssetAmount[];
    }
  | {
      type: "WITHDRAW";
      withdrawalAmount: bigint;
    }
  | {
      type: "ZAP_OUT";
      withdrawalAmount: bigint;
      toAsset: Asset;
    };

export type StableswapOrderConstructor = {
  txIn: TxIn;
  address: Address;
  value: Value;
  datum: StableswapOrderDatum;
  rawDatum: string;
  lpAsset: Asset;
  networkEnv: NetworkEnvironment;
};

export class StableswapOrder extends BaseUtxoModel {
  readonly datum: StableswapOrderDatum;
  readonly lpAsset: Asset;
  readonly orderInfo: StableswapOrderInfo;
  readonly networkEnv: NetworkEnvironment;

  private constructor(
    txIn: TxIn,
    address: Address,
    value: Value,
    datum: StableswapOrderDatum,
    rawDatum: string,
    lpAsset: Asset,
    orderInfo: StableswapOrderInfo,
    networkEnv: NetworkEnvironment,
  ) {
    super(txIn, address, value, rawDatum);
    this.datum = datum;
    this.lpAsset = lpAsset;
    this.orderInfo = orderInfo;
    this.networkEnv = networkEnv;
  }

  // biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
  static new(constructor: StableswapOrderConstructor): Result<StableswapOrder, InvalidOrder> {
    const { txIn, address, value, datum, rawDatum, lpAsset, networkEnv } = constructor;
    const orderInfoResult = StableswapOrder.getAndValidateOrderInfo(constructor);
    if (orderInfoResult.type === "err") {
      return orderInfoResult;
    }

    return Result.ok(new StableswapOrder(txIn, address, value, datum, rawDatum, lpAsset, orderInfoResult.value, networkEnv));
  }

  /**
   * This function might throw an error if the constructor contains invalid data
   * @param constructor
   * @returns the constructed order
   */
  // biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
  static newUnsafe(constructor: StableswapOrderConstructor): StableswapOrder {
    return Result.unwrap(StableswapOrder.new(constructor));
  }

  static getAndValidateOrderInfo({
    txIn,
    address,
    value,
    datum,
    lpAsset,
    networkEnv,
  }: StableswapOrderConstructor): Result<StableswapOrderInfo, InvalidOrder> {
    try {
      const poolConfig = getStableswapPoolConfigByLPAsset(lpAsset, networkEnv);
      InvalidOrder.assert(poolConfig, InvalidOrder.ErrorCode.NON_EXISTENCE_POOL);
      const poolAssets = poolConfig.assets;
      const { batcherFee, outputADA, receiverDatumHash, step } = datum;
      const valueWithoutFee = value
        .clone()
        .subtract(ADA, batcherFee + outputADA)
        .trim();
      const availableAda = valueWithoutFee.get(ADA);

      InvalidOrder.assert(batcherFee > 0n, InvalidOrder.ErrorCode.INVALID_PARAMETER, `batcher fee: ${batcherFee}`);
      InvalidOrder.assert(outputADA > 0n, InvalidOrder.ErrorCode.INVALID_PARAMETER, `deposit ADA: ${outputADA}`);
      InvalidOrder.assert(
        availableAda >= 0n,
        InvalidOrder.ErrorCode.INVALID_VALUE,
        `ADA require: ${batcherFee + outputADA}`,
      );

      if (Maybe.isJust(receiverDatumHash)) {
        InvalidOrder.assert(
          receiverDatumHash.length === 32,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `receiver datum hash: ${receiverDatumHash}`,
        );
      }

      let orderInfo: StableswapOrderInfo;
      switch (step.type) {
        case StableswapStepType.EXCHANGE: {
          const { assetInIndex, assetOutIndex, minimumAssetOut } = step;
          InvalidOrder.assert(
            minimumAssetOut > 0n,
            InvalidOrder.ErrorCode.INVALID_PARAMETER,
            `minimumAssetOut: ${minimumAssetOut}`,
          );
          InvalidOrder.assert(
            assetInIndex >= 0n &&
              assetOutIndex >= 0n &&
              assetInIndex !== assetOutIndex &&
              assetOutIndex < BigInt(poolAssets.length),
            InvalidOrder.ErrorCode.INVALID_PARAMETER,
            `assetInIndex: ${assetInIndex}`,
            `assetOutIndex: ${assetOutIndex}`,
            `assetsLength: ${poolAssets.length}`,
          );
          const fromAsset = poolAssets[Number(assetInIndex)];
          const toAsset = poolAssets[Number(assetOutIndex)];
          const swapAmount = valueWithoutFee.get(fromAsset);
          InvalidOrder.assert(swapAmount > 0n, InvalidOrder.ErrorCode.INVALID_VALUE, `missing swap asset`);
          orderInfo = {
            type: "SWAP",
            swapAsset: fromAsset,
            toAsset: toAsset,
            swapAmount: swapAmount,
          };
          break;
        }
        case StableswapStepType.DEPOSIT: {
          const { minimumLP } = step;
          InvalidOrder.assert(minimumLP > 0n, InvalidOrder.ErrorCode.INVALID_PARAMETER, `minimumLP: ${minimumLP}`);
          const depositAssets: AssetAmount[] = [];
          for (const asset of poolAssets) {
            const amountIn = valueWithoutFee.get(asset);
            depositAssets.push({
              asset: asset,
              amount: amountIn,
            });
          }
          const sumDepositAmounts = depositAssets.reduce((acc, a) => acc + a.amount, 0n);
          InvalidOrder.assert(sumDepositAmounts > 0, InvalidOrder.ErrorCode.INVALID_VALUE, `missing deposit assets`);
          orderInfo = {
            type: "DEPOSIT",
            depositAssets: depositAssets,
          };
          break;
        }
        case StableswapStepType.WITHDRAW: {
          const { minimumAmounts } = step;
          let sumMinimumAmounts = 0n;
          for (const amount of minimumAmounts) {
            InvalidOrder.assert(amount >= 0n, InvalidOrder.ErrorCode.INVALID_PARAMETER, `minimumAmount: ${amount}`);
            sumMinimumAmounts += amount;
          }
          InvalidOrder.assert(
            sumMinimumAmounts > 0n,
            InvalidOrder.ErrorCode.INVALID_PARAMETER,
            `sum of minimumAmounts: ${sumMinimumAmounts}`,
          );
          const lpAmount = valueWithoutFee.get(lpAsset);
          InvalidOrder.assert(lpAmount > 0n, InvalidOrder.ErrorCode.INVALID_VALUE, `missing withdrawal LP Asset`);
          orderInfo = {
            type: "WITHDRAW",
            withdrawalAmount: lpAmount,
          };
          break;
        }
        case StableswapStepType.WITHDRAW_IMBALANCE: {
          const { withdrawAmounts } = step;
          let sumWithdrawAmounts = 0n;
          for (const amount of withdrawAmounts) {
            InvalidOrder.assert(amount >= 0n, InvalidOrder.ErrorCode.INVALID_PARAMETER, `withdrawAmount: ${amount}`);
            sumWithdrawAmounts += amount;
          }
          InvalidOrder.assert(
            sumWithdrawAmounts > 0n,
            InvalidOrder.ErrorCode.INVALID_PARAMETER,
            `sum of withdrawAmounts: ${sumWithdrawAmounts}`,
          );
          const lpAmount = valueWithoutFee.get(lpAsset);
          InvalidOrder.assert(lpAmount > 0n, InvalidOrder.ErrorCode.INVALID_VALUE, `missing withdrawal LP Asset`);
          orderInfo = {
            type: "WITHDRAW",
            withdrawalAmount: lpAmount,
          };
          break;
        }
        case StableswapStepType.WITHDRAW_ONE_COIN: {
          const { assetOutIndex, minimumAssetOut } = step;
          InvalidOrder.assert(
            minimumAssetOut > 0n,
            InvalidOrder.ErrorCode.INVALID_PARAMETER,
            `minimumAssetOut: ${minimumAssetOut}`,
          );
          InvalidOrder.assert(
            assetOutIndex >= 0n && assetOutIndex < BigInt(poolAssets.length),
            InvalidOrder.ErrorCode.INVALID_PARAMETER,
            `assetOutIndex: ${assetOutIndex}`,
            `assetsLength: ${poolAssets.length}`,
          );
          const lpAmount = valueWithoutFee.get(lpAsset);
          InvalidOrder.assert(lpAmount > 0n, InvalidOrder.ErrorCode.INVALID_VALUE, `missing withdrawal LP Asset`);
          orderInfo = {
            type: "ZAP_OUT",
            withdrawalAmount: lpAmount,
            toAsset: poolAssets[Number(assetOutIndex)],
          };
          break;
        }
      }

      return Result.ok(orderInfo);
    } catch (err) {
      return Result.err({
        dexVersion: DexVersion.STABLESWAP,
        txIn: txIn,
        utxoAddress: address,
        owner: datum.sender,
        value: value,
        datumHash: undefined,
        datum: StableswapOrderDatum.toDataHex(datum),
        reason: InvalidOrder.OrderError.new(err),
      });
    }
  }

  /** @returns A unique string key for this order */
  get key(): string {
    return TxIn.toString(this.txIn);
  }

  /**
   * Return the address who can unlock the fund of an order
   */
  get owner(): Address {
    return this.datum.sender;
  }

  toXJSON(): { $stableswapOrder: StableswapOrderConstructor } {
    return {
      $stableswapOrder: {
        txIn: this.txIn,
        address: this.address,
        value: this.value,
        datum: this.datum,
        rawDatum: this.rawDatum,
        lpAsset: this.lpAsset,
        networkEnv: this.networkEnv,
      },
    };
  }

  getAmountIn(assetIn: Asset): bigint {
    let inputAmount = this.value.get(assetIn);
    if (assetIn.equals(ADA)) {
      inputAmount -= this.datum.outputADA + this.datum.batcherFee;
    }

    return inputAmount;
  }

  static fromUtxo(
    utxo: Utxo,
    networkEnvironment: NetworkEnvironment,
    datums?: Record<string, string>,
  ): Result<StableswapOrder, InvalidOrder> {
    let datumHash: Maybe<Bytes> = undefined;
    let datumRaw: Maybe<Bytes> = undefined;
    let datum: Maybe<StableswapOrderDatum> = undefined;
    try {
      const lpAssetResult = getLPAssetFromStableswapOrderAddress(utxo.output.address, networkEnvironment);
      if (lpAssetResult.type === "err") {
        throw new InvalidOrder.OrderError(InvalidOrder.ErrorCode.NON_EXISTENCE_POOL, lpAssetResult.error.message);
      }
      const lpAsset = lpAssetResult.value;
      if (utxo.output.includeInlineDatums()) {
        datumRaw = Result.unwrap(utxo.output.getInlineDatum());
        datum = StableswapOrderDatum.fromDataHex(datumRaw.hex, networkEnvironment);
      } else {
        // eslint-disable-next-line @minswap/result-type-handling
        const datumHashResult = utxo.output.getDatumHash();
        InvalidOrder.assert(datumHashResult.type === "ok", InvalidOrder.ErrorCode.MISSING_DATUM_HASH);
        datumHash = datumHashResult.value;
        const datumHex = datums?.[datumHash.hex];
        InvalidOrder.assert(datumHex, InvalidOrder.ErrorCode.MISSING_DATUM);
        datumRaw = Bytes.fromHex(datumHex);
        datum = StableswapOrderDatum.fromDataHex(datumHex, networkEnvironment);
      }
      return StableswapOrder.new({
        txIn: utxo.input,
        address: utxo.output.address,
        value: utxo.output.value,
        datum: datum,
        rawDatum: datumRaw.hex,
        lpAsset: lpAsset,
        networkEnv: networkEnvironment,
      });
    } catch (err) {
      return Result.err({
        dexVersion: DexVersion.STABLESWAP,
        txIn: utxo.input,
        utxoAddress: utxo.output.address,
        owner: datum?.sender,
        value: utxo.output.value,
        datumHash: datumHash?.hex,
        datum: datumRaw?.hex,
        reason: InvalidOrder.OrderError.new(err),
      });
    }
  }
}
