import { Asset, PlutusData, PlutusConstr, PlutusInt, Bytes, NetworkEnvironment, Address, PlutusMaybe, PlutusBytes, TxIn, Value, BaseUtxoModel, ADA, Utxo } from "@repo/ledger-core";
import { CborHex, CSLPlutusData, Maybe, Result } from "@repo/ledger-utils";
import { getDexV1OrderScriptHash, LP_CURRENCY_SYMBOL } from "./constants";
import { InvalidOrder } from "./invalid-order";
import { isNormalizePair, normalizePair } from "./utils";

export enum StepType {
  SWAP_EXACT_IN = 0,
  SWAP_EXACT_OUT = 1,
  DEPOSIT = 2,
  WITHDRAW = 3,
  ONE_SIDE_DEPOSIT = 4,
}

export type SwapExactInStep = {
  type: StepType.SWAP_EXACT_IN;
  desiredAsset: Asset;
  minimumReceived: bigint;
};

export type SwapExactOutStep = {
  type: StepType.SWAP_EXACT_OUT;
  desiredAsset: Asset;
  expectedReceived: bigint;
};

export type DepositStep = {
  type: StepType.DEPOSIT;
  minimumLP: bigint;
};

export type WithdrawStep = {
  type: StepType.WITHDRAW;
  minimumAssetA: bigint;
  minimumAssetB: bigint;
};

export type OneSideDepositStep = {
  type: StepType.ONE_SIDE_DEPOSIT;
  desiredAsset: Asset;
  minimumLP: bigint;
};

export type Step = SwapExactInStep | SwapExactOutStep | DepositStep | WithdrawStep | OneSideDepositStep;

export namespace Step {
  export function fromPlutusJson(d: PlutusData): Step {
    // biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
    const { constructor, fields } = PlutusConstr.unwrap(d, {
      [0]: 2,
      [1]: 2,
      [2]: 1,
      [3]: 2,
      [4]: 2,
    });
    switch (constructor) {
      case StepType.SWAP_EXACT_IN:
        return {
          type: constructor,
          desiredAsset: Asset.fromPlutusJson(fields[0]),
          minimumReceived: PlutusInt.unwrapToBigInt(fields[1]),
        };
      case StepType.SWAP_EXACT_OUT:
        return {
          type: constructor,
          desiredAsset: Asset.fromPlutusJson(fields[0]),
          expectedReceived: PlutusInt.unwrapToBigInt(fields[1]),
        };
      case StepType.DEPOSIT:
        return {
          type: constructor,
          minimumLP: PlutusInt.unwrapToBigInt(fields[0]),
        };
      case StepType.WITHDRAW:
        return {
          type: constructor,
          minimumAssetA: PlutusInt.unwrapToBigInt(fields[0]),
          minimumAssetB: PlutusInt.unwrapToBigInt(fields[1]),
        };
      case StepType.ONE_SIDE_DEPOSIT:
        return {
          type: constructor,
          desiredAsset: Asset.fromPlutusJson(fields[0]),
          minimumLP: PlutusInt.unwrapToBigInt(fields[1]),
        };
      default:
        throw new InvalidOrder.OrderError(
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `Unexpected Constr ${d} when decoding Step`,
        );
    }
  }

  export function toPlutusJson(data: Step): PlutusData {
    switch (data.type) {
      case StepType.SWAP_EXACT_IN:
        return {
          constructor: data.type,
          fields: [data.desiredAsset.toPlutusJson(), PlutusInt.wrap(data.minimumReceived)],
        };
      case StepType.SWAP_EXACT_OUT:
        return {
          constructor: data.type,
          fields: [data.desiredAsset.toPlutusJson(), PlutusInt.wrap(data.expectedReceived)],
        };
      case StepType.DEPOSIT:
        return {
          constructor: data.type,
          fields: [PlutusInt.wrap(data.minimumLP)],
        };
      case StepType.WITHDRAW:
        return {
          constructor: data.type,
          fields: [PlutusInt.wrap(data.minimumAssetA), PlutusInt.wrap(data.minimumAssetB)],
        };
      case StepType.ONE_SIDE_DEPOSIT:
        return {
          constructor: data.type,
          fields: [data.desiredAsset.toPlutusJson(), PlutusInt.wrap(data.minimumLP)],
        };
    }
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>): Step {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData);
  }

  export function toDataHex(data: Step): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }
}

export type OrderDatum = {
  sender: Address;
  receiver: Address;
  receiverDatumHash: Maybe<string>;
  step: Step;
  batcherFee: bigint;
  outputADA: bigint;
};

export namespace OrderDatum {
  export function fromPlutusJson(
    d: PlutusData,
    networkEnvironment: NetworkEnvironment,
  ): OrderDatum {
    const { fields } = PlutusConstr.unwrap(d, { [0]: 6 });
    return {
      sender: Address.fromPlutusJson(fields[0], networkEnvironment),
      receiver: Address.fromPlutusJson(fields[1], networkEnvironment),
      receiverDatumHash: Maybe.map(PlutusMaybe.unwrap(fields[2]), PlutusBytes.unwrap),
      step: Step.fromPlutusJson(fields[3]),
      batcherFee: PlutusInt.unwrapToBigInt(fields[4]),
      outputADA: PlutusInt.unwrapToBigInt(fields[5]),
    };
  }

  export function toPlutusJson(data: OrderDatum): PlutusData {
    return {
      constructor: 0,
      fields: [
        data.sender.toPlutusJson(),
        data.receiver.toPlutusJson(),
        PlutusMaybe.wrap(Maybe.map(data.receiverDatumHash, (a) => Bytes.fromHex(a).toPlutusJson())),
        Step.toPlutusJson(data.step),
        PlutusInt.wrap(data.batcherFee),
        PlutusInt.wrap(data.outputADA),
      ],
    };
  }

  export function fromDataHex(
    data: CborHex<CSLPlutusData>,
    networkEnvironment: NetworkEnvironment,
  ): OrderDatum {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData, networkEnvironment);
  }

  export function toDataHex(data: OrderDatum): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }
}

export enum OrderRedeemer {
  APPLY_ORDER = 0,
  CANCEL_ORDER = 1,
}

export namespace OrderRedeemer {
  export function fromPlutusJson(d: PlutusData): OrderRedeemer {
    // biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
    const { constructor } = PlutusConstr.unwrap(d, {
      [0]: 0,
      [1]: 0,
    });
    return constructor;
  }

  export function toPlutusJson(data: OrderRedeemer): PlutusData {
    return {
      constructor: data,
      fields: [],
    };
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>): OrderRedeemer {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData);
  }

  export function toDataHex(data: OrderRedeemer): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }
}

export type DexV1OrderInfo =
  | {
      type: "SWAP";
      pair: [Asset, Asset];
      swapAsset: Asset;
      swapAmount: bigint;
      toAsset: Asset;
    }
  | {
      type: "DEPOSIT";
      pair: [Asset, Asset];
      depositA: bigint;
      depositB: bigint;
    }
  | {
      type: "WITHDRAW";
      lpAsset: Asset;
      withdrawalAmount: bigint;
    }
  | {
      type: "ZAP_IN";
      pair: [Asset, Asset];
      zapAsset: Asset;
      zapAmount: bigint;
    };

export type DexV1OrderConstructor = {
  txIn: TxIn;
  address: Address;
  value: Value;
  datum: OrderDatum;
  rawDatum: string;
  networkEnv: NetworkEnvironment;
};

export class Order extends BaseUtxoModel {
  readonly datum: OrderDatum;
  private lpAsset: Asset | undefined = undefined;
  readonly orderInfo: DexV1OrderInfo;
  readonly networkEnv: NetworkEnvironment;

  private constructor(
    txIn: TxIn,
    address: Address,
    value: Value,
    datum: OrderDatum,
    rawDatum: string,
    orderInfo: DexV1OrderInfo,
    networkEnv: NetworkEnvironment,
  ) {
    super(txIn, address, value, rawDatum);
    this.datum = datum;
    this.orderInfo = orderInfo;
    if (orderInfo.type === "WITHDRAW") {
      this.lpAsset = orderInfo.lpAsset;
    }
    this.networkEnv = networkEnv;
  }

  static new(params: DexV1OrderConstructor): Result<Order, InvalidOrder> {
    const { txIn, address, value, datum, rawDatum, networkEnv } = params;
    const orderInfoResult = Order.getAndValidateOrderInfo(params);
    if (orderInfoResult.type === "err") {
      return orderInfoResult;
    }
    return Result.ok(new Order(txIn, address, value, datum, rawDatum, orderInfoResult.value, networkEnv));
  }

  /**
   * This function might throw an error if the constructor contains invalid data
   * @param params
   * @returns the constructed order
   */
  static newUnsafe(params: DexV1OrderConstructor): Order {
    return Result.unwrap(Order.new(params));
  }

  static getAndValidateOrderInfo({
    txIn,
    address,
    value,
    datum,
    networkEnv,
  }: DexV1OrderConstructor): Result<DexV1OrderInfo, InvalidOrder> {
    const v1OrderScriptHash = getDexV1OrderScriptHash(networkEnv);
    InvalidOrder.assert(
      address.toScriptHash()?.equals(v1OrderScriptHash),
      InvalidOrder.ErrorCode.INVALID_SCRIPT_HASH,
    );
    const { batcherFee, outputADA, receiverDatumHash, step } = datum;
    try {
      InvalidOrder.assert(batcherFee > 0n, InvalidOrder.ErrorCode.INVALID_PARAMETER, `batcher fee: ${batcherFee}`);
      InvalidOrder.assert(outputADA > 0n, InvalidOrder.ErrorCode.INVALID_PARAMETER, `deposit ADA: ${outputADA}`);

      const valueWithoutFee = value
        .clone()
        .subtract(ADA, batcherFee + outputADA)
        .trim();
      const availableAda = valueWithoutFee.get(ADA);
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
        InvalidOrder.assert(
          step.type !== StepType.DEPOSIT && step.type !== StepType.WITHDRAW && step.type !== StepType.ONE_SIDE_DEPOSIT,
          InvalidOrder.ErrorCode.INVALID_PARAMETER,
          `not support script output in deposit, withdraw or zap in transaction`,
        );
      }

      let orderInfo: DexV1OrderInfo;

      switch (step.type) {
        case StepType.SWAP_EXACT_IN: {
          InvalidOrder.assert(
            step.minimumReceived >= 0n,
            InvalidOrder.ErrorCode.INVALID_PARAMETER,
            `minimumReceived: ${step.minimumReceived}`,
          );
          const swapAsset = Order.getSingleAssetIn(valueWithoutFee);
          InvalidOrder.assert(swapAsset, InvalidOrder.ErrorCode.INVALID_VALUE, `missing swap asset`);
          const swapAmount = valueWithoutFee.get(swapAsset);
          orderInfo = {
            type: "SWAP",
            pair: normalizePair([swapAsset, step.desiredAsset]),
            swapAmount: swapAmount,
            swapAsset: swapAsset,
            toAsset: step.desiredAsset,
          };
          break;
        }
        case StepType.SWAP_EXACT_OUT: {
          InvalidOrder.assert(
            step.expectedReceived > 0n,
            InvalidOrder.ErrorCode.INVALID_PARAMETER,
            `expectedReceived: ${step.expectedReceived}`,
          );
          const swapAsset = Order.getSingleAssetIn(valueWithoutFee);
          InvalidOrder.assert(swapAsset, InvalidOrder.ErrorCode.INVALID_VALUE, `missing swap asset`);
          const swapAmount = valueWithoutFee.get(swapAsset);
          orderInfo = {
            type: "SWAP",
            pair: normalizePair([swapAsset, step.desiredAsset]),
            swapAmount: swapAmount,
            swapAsset: swapAsset,
            toAsset: step.desiredAsset,
          };
          break;
        }
        case StepType.DEPOSIT: {
          InvalidOrder.assert(
            step.minimumLP >= 0n,
            InvalidOrder.ErrorCode.INVALID_PARAMETER,
            `minimumLP: ${step.minimumLP}`,
          );
          const depositAssets = Order.getTwoAssetIns(valueWithoutFee);
          InvalidOrder.assert(depositAssets, InvalidOrder.ErrorCode.INVALID_VALUE, `missing deposit assets`);
          InvalidOrder.assert(
            valueWithoutFee.size() === 2,
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `require two deposit asset`,
          );
          const [asset1, asset2] = depositAssets;
          let assetA: Asset;
          let assetB: Asset;
          if (isNormalizePair([asset1, asset2])) {
            assetA = asset1;
            assetB = asset2;
          } else {
            assetA = asset2;
            assetB = asset1;
          }
          orderInfo = {
            type: "DEPOSIT",
            pair: normalizePair([assetA, assetB]),
            depositA: valueWithoutFee.get(assetA),
            depositB: valueWithoutFee.get(assetB),
          };
          break;
        }
        case StepType.WITHDRAW: {
          InvalidOrder.assert(
            step.minimumAssetA >= 0n,
            InvalidOrder.ErrorCode.INVALID_PARAMETER,
            `minimumAssetA: ${step.minimumAssetA}`,
          );
          InvalidOrder.assert(
            step.minimumAssetB >= 0n,
            InvalidOrder.ErrorCode.INVALID_PARAMETER,
            `minimumAssetB: ${step.minimumAssetB}`,
          );
          const lpAsset = Order.getSingleAssetIn(valueWithoutFee);
          InvalidOrder.assert(
            lpAsset && lpAsset.currencySymbol.equals(LP_CURRENCY_SYMBOL),
            InvalidOrder.ErrorCode.INVALID_VALUE,
            `missing LP asset`,
          );
          const lpAmount = valueWithoutFee.get(lpAsset);

          orderInfo = {
            type: "WITHDRAW",
            lpAsset: lpAsset,
            withdrawalAmount: lpAmount,
          };
          break;
        }
        case StepType.ONE_SIDE_DEPOSIT: {
          InvalidOrder.assert(
            step.minimumLP >= 0n,
            InvalidOrder.ErrorCode.INVALID_PARAMETER,
            `minimumLP: ${step.minimumLP}`,
          );
          const zapInAsset = Order.getSingleAssetIn(valueWithoutFee);
          InvalidOrder.assert(zapInAsset, InvalidOrder.ErrorCode.INVALID_VALUE, `missing zap asset`);
          const zapInAmount = valueWithoutFee.get(zapInAsset);
          orderInfo = {
            type: "ZAP_IN",
            pair: normalizePair([zapInAsset, step.desiredAsset]),
            zapAmount: zapInAmount,
            zapAsset: zapInAsset,
          };
          break;
        }
      }

      return Result.ok(orderInfo);
    } catch (err) {
      return Result.err({
        dexVersion: "DEX_V1",
        txIn: txIn,
        utxoAddress: address,
        owner: datum.sender,
        value: value,
        datumHash: undefined,
        datum: OrderDatum.toDataHex(datum),
        reason: InvalidOrder.OrderError.new(err),
      });
    }
  }

  setLPAsset(lpAsset: Asset): void {
    this.lpAsset = lpAsset;
  }

  getLPAsset(): Asset | undefined {
    return this.lpAsset;
  }

  /** @returns A unique string key for this order */
  get key(): string {
    return `${this.txIn.txId.hex}#${this.txIn.index}`;
  }

  /**
   * Return the address who can unlock the fund of an order
   */
  get owner(): Address {
    return this.datum.sender;
  }

  toXJSON(): { $dexV1Order: DexV1OrderConstructor } {
    return {
      $dexV1Order: {
        txIn: this.txIn,
        address: this.address,
        value: this.value,
        datum: this.datum,
        rawDatum: this.rawDatum,
        networkEnv: this.networkEnv,
      },
    };
  }

  static fromUtxo({ input, output }: Utxo, rawDatum: Maybe<Bytes>, networkEnv: NetworkEnvironment): Result<Order, InvalidOrder> {
    const { address, value } = output;
    let datumHash: Maybe<Bytes> = undefined;
    let datum: Maybe<OrderDatum> = undefined;
    try {
      // eslint-disable-next-line @minswap/result-type-handling
      const datumHashResult = output.getDatumHash();
      InvalidOrder.assert(datumHashResult.type === "ok", InvalidOrder.ErrorCode.MISSING_DATUM_HASH);
      InvalidOrder.assert(Maybe.isJust(rawDatum), InvalidOrder.ErrorCode.MISSING_DATUM);
      datumHash = datumHashResult.value;
      datum = OrderDatum.fromDataHex(rawDatum.hex, networkEnv);
      return Order.new({
        txIn: input,
        address: address,
        value: value,
        datum: datum,
        rawDatum: rawDatum.hex,
        networkEnv,
      });
    } catch (err) {
      return Result.err({
        dexVersion: "DEX_V1",
        txIn: input,
        utxoAddress: address,
        owner: datum?.sender,
        value: value,
        datumHash: datumHash?.hex,
        datum: rawDatum?.hex,
        reason: InvalidOrder.OrderError.new(err),
      });
    }
  }

  /**
   * This function will extract an asset in the input based on the Order Value that has been subtracted the fee
   * @param valueWithoutFee Order Value that has been subtracted the fee
   * @returns an asset
   */
  private static getSingleAssetIn(valueWithoutFee: Value): Asset | null {
    if (valueWithoutFee.size() === 0) {
      return null;
    }
    const assets = valueWithoutFee.assets();

    // If the remaining value contains only 1 asset, we assume this asset is the main asset involving the order
    if (assets.length === 1) {
      return assets[0];
    }

    /**
     * If the remaining value contains only 1 non ADA asset, we assume this asset is the main asset involving the order
     * Otherwise the order will be ignored
     */
    const otherAssets = assets.filter((a: Asset) => !a.equals(ADA));
    if (otherAssets.length !== 1) {
      return null;
    }
    return otherAssets[0];
  }

  /**
   * This function will extract 2 assets in the input based on the Order Value that has been subtracted the fee
   * @param valueWithoutFee Order Value that has been subtracted the fee
   * @returns 2 assets
   */
  private static getTwoAssetIns(valueWithoutFee: Value): [Asset, Asset] | null {
    if (valueWithoutFee.size() === 0) {
      return null;
    }
    const assets = valueWithoutFee.assets();

    // If the remaining value contains 2 assets, we assume these assets are the main assets involving the order
    if (assets.length === 2) {
      const pair = assets as [Asset, Asset];
      return normalizePair(pair);
    }

    /**
     * If the remaining value contains 2 non ADA assets, we assume these assets are the main assets involving the order
     * Otherwise the order will be ignored
     */
    const otherAssets = assets.filter((a: Asset) => !a.equals(ADA));
    if (otherAssets.length !== 2) {
      return null;
    }
    const pair = otherAssets as [Asset, Asset];
    return normalizePair(pair);
  }
}
