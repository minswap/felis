import invariant from "@minswap/tiny-invariant";

import {
  ADA,
  type Address,
  Asset,
  BaseUtxoModel,
  Bytes,
  Credential,
  DatumSource,
  type NetworkEnvironment,
  PlutusBytes,
  PlutusConstr,
  PlutusData,
  PlutusInt,
  PlutusList,
  PlutusMaybe,
  TxIn,
  TxOut,
  UnwrapPlutusDataError,
  type Utxo,
  type Value,
} from "@repo/ledger-core";
import { type CborHex, type CSLPlutusData, Maybe, Result, sha3 } from "@repo/ledger-utils";

import { DEX_V2_DEFAULT_POOL_ADA, getDexV2Configs } from "./constants";
import { OrderV2Direction } from "./order";
import { normalizePair } from "./utils";

export type PoolV2BaseFee = {
  feeANumerator: bigint;
  feeBNumerator: bigint;
};

export type PoolV2Datum = {
  poolBatchingStakeCredential: Credential;
  assetA: Asset;
  assetB: Asset;
  totalLiquidity: bigint;
  reserveA: bigint;
  reserveB: bigint;
  baseFee: PoolV2BaseFee;
  feeSharingNumerator: Maybe<bigint>;
  allowDynamicFee: boolean;
};

export namespace PoolV2Datum {
  export function fromPlutusJson(d: PlutusData): PoolV2Datum {
    const { fields } = PlutusConstr.unwrap(d, { [0]: 10 });
    const stakeCredentialPlutusData = PlutusConstr.unwrap(fields[0], { [0]: 1 });
    const credential = Credential.fromPlutusJson(stakeCredentialPlutusData.fields[0]);

    const feeSharingNumerator: Maybe<bigint> = Maybe.map(PlutusMaybe.unwrap(fields[8]), PlutusInt.unwrapToBigInt);
    const allowDynamicFeeConstr = PlutusConstr.unwrap(fields[9], {
      [0]: 0,
      [1]: 0,
    });
    const allowDynamicFee = allowDynamicFeeConstr.constructor === 1;
    return {
      poolBatchingStakeCredential: credential,
      assetA: Asset.fromPlutusJson(fields[1]),
      assetB: Asset.fromPlutusJson(fields[2]),
      totalLiquidity: PlutusInt.unwrapToBigInt(fields[3]),
      reserveA: PlutusInt.unwrapToBigInt(fields[4]),
      reserveB: PlutusInt.unwrapToBigInt(fields[5]),
      baseFee: {
        feeANumerator: PlutusInt.unwrapToBigInt(fields[6]),
        feeBNumerator: PlutusInt.unwrapToBigInt(fields[7]),
      },
      feeSharingNumerator: feeSharingNumerator,
      allowDynamicFee: allowDynamicFee,
    };
  }

  export function toPlutusJson(pd: PoolV2Datum): PlutusData {
    return {
      constructor: 0,
      fields: [
        {
          constructor: 0,
          fields: [Credential.toPlutusJson(pd.poolBatchingStakeCredential)],
        },
        pd.assetA.toPlutusJson(),
        pd.assetB.toPlutusJson(),
        PlutusInt.wrap(pd.totalLiquidity),
        PlutusInt.wrap(pd.reserveA),
        PlutusInt.wrap(pd.reserveB),
        PlutusInt.wrap(pd.baseFee.feeANumerator),
        PlutusInt.wrap(pd.baseFee.feeBNumerator),
        PlutusMaybe.wrap(Maybe.map(pd.feeSharingNumerator, PlutusInt.wrap)),
        {
          constructor: pd.allowDynamicFee ? 1 : 0,
          fields: [],
        },
      ],
    };
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>): PoolV2Datum {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData);
  }

  export function toDataHex(data: PoolV2Datum): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }

  export function clone(datum: PoolV2Datum): PoolV2Datum {
    return {
      poolBatchingStakeCredential: datum.poolBatchingStakeCredential,
      assetA: datum.assetA.clone(),
      assetB: datum.assetB.clone(),
      totalLiquidity: datum.totalLiquidity,
      reserveA: datum.reserveA,
      reserveB: datum.reserveB,
      baseFee: {
        feeANumerator: datum.baseFee.feeANumerator,
        feeBNumerator: datum.baseFee.feeBNumerator,
      },
      feeSharingNumerator: Maybe.map(datum.feeSharingNumerator, (ps) => ps),
      allowDynamicFee: datum.allowDynamicFee,
    };
  }
}

export enum PoolV2RedeemerType {
  BATCHING = 0,
  UPDATE_POOL_PARAMETERS = 1,
  WITHDRAW_FEE_SHARING = 2,
}

export enum UpdatePoolParametersAction {
  UPDATE_POOL_FEE = 0,
  UPDATE_DYNAMIC_FEE = 1,
  UPDATE_POOL_STAKE_CREDENTIAL = 2,
}

export type PoolV2Redeemer =
  | {
      type: PoolV2RedeemerType.BATCHING;
    }
  | {
      type: PoolV2RedeemerType.UPDATE_POOL_PARAMETERS;
      action: UpdatePoolParametersAction;
    }
  | {
      type: PoolV2RedeemerType.WITHDRAW_FEE_SHARING;
    };

export namespace PoolV2Redeemer {
  export function fromPlutusJson(d: PlutusData): PoolV2Redeemer {
    const { constructor: constr, fields } = PlutusConstr.unwrap(d, {
      [0]: 0,
      [1]: 1,
      [2]: 0,
    });
    switch (constr) {
      case PoolV2RedeemerType.BATCHING:
        return {
          type: constr,
        };
      case PoolV2RedeemerType.UPDATE_POOL_PARAMETERS: {
        const actionPlutusData = PlutusConstr.unwrap(fields[0], {
          [0]: 0,
          [1]: 0,
          [2]: 0,
        });
        return {
          type: constr,
          action: actionPlutusData.constructor,
        };
      }
      case PoolV2RedeemerType.WITHDRAW_FEE_SHARING:
        return {
          type: constr,
        };
      default: {
        throw new UnwrapPlutusDataError(`PoolV2Redeemer.fromPlutusJson: unexpected constr ${d}`);
      }
    }
  }

  export function toPlutusJson(pr: PoolV2Redeemer): PlutusData {
    switch (pr.type) {
      case PoolV2RedeemerType.BATCHING: {
        return {
          constructor: pr.type,
          fields: [],
        };
      }
      case PoolV2RedeemerType.UPDATE_POOL_PARAMETERS: {
        let actionPlutusData: PlutusData;
        switch (pr.action) {
          case UpdatePoolParametersAction.UPDATE_POOL_FEE: {
            actionPlutusData = {
              constructor: pr.action,
              fields: [],
            };
            break;
          }
          case UpdatePoolParametersAction.UPDATE_DYNAMIC_FEE: {
            actionPlutusData = {
              constructor: pr.action,
              fields: [],
            };
            break;
          }
          case UpdatePoolParametersAction.UPDATE_POOL_STAKE_CREDENTIAL: {
            actionPlutusData = {
              constructor: pr.action,
              fields: [],
            };
            break;
          }
        }
        return {
          constructor: pr.type,
          fields: [actionPlutusData],
        };
      }
      case PoolV2RedeemerType.WITHDRAW_FEE_SHARING: {
        return {
          constructor: pr.type,
          fields: [],
        };
      }
    }
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>): PoolV2Redeemer {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData);
  }

  export function toDataHex(data: PoolV2Redeemer): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }
}

export type PoolBatchingV2Redeemer = {
  batcherIndex: number;
  ordersFee: bigint[];
  inputIndexes: number[];
  poolInputIndexes: Maybe<number[]>;
  volFees: Maybe<[bigint, bigint]>[];
};

export namespace PoolBatchingV2Redeemer {
  export function fromPlutusJson(d: PlutusData): PoolBatchingV2Redeemer {
    const { fields } = PlutusConstr.unwrap(d, {
      [0]: 5,
    });
    const volFees: Maybe<[bigint, bigint]>[] = PlutusList.unwrap(fields[4]).map((x) =>
      Maybe.map(PlutusMaybe.unwrap(x), (m) => {
        const list = PlutusList.unwrap(m).map(PlutusInt.unwrapToBigInt);
        invariant(list.length === 2, `Pool V2 Vol Fee must be 2 elements, actual: ${list}`);
        const [numerator, denominator] = list;
        return [numerator, denominator];
      }),
    );
    return {
      batcherIndex: PlutusInt.unwrapToNumber(fields[0]),
      ordersFee: PlutusList.unwrap(fields[1]).map(PlutusInt.unwrapToBigInt),
      inputIndexes: Bytes.fromHex(PlutusBytes.unwrap(fields[2])).toNumberArray(),
      poolInputIndexes: Maybe.map(PlutusMaybe.unwrap(fields[3]), (i) =>
        Bytes.fromHex(PlutusBytes.unwrap(i)).toNumberArray(),
      ),
      volFees: volFees,
    };
  }

  export function toPlutusJson(pr: PoolBatchingV2Redeemer): PlutusData {
    return {
      constructor: 0,
      fields: [
        PlutusInt.wrap(pr.batcherIndex),
        {
          list: pr.ordersFee.map(PlutusInt.wrap),
        },
        PlutusBytes.wrap(Bytes.fromNumberArr(pr.inputIndexes)),
        PlutusMaybe.wrap(Maybe.map(pr.poolInputIndexes, (x) => PlutusBytes.wrap(Bytes.fromNumberArr(x)))),
        {
          list: pr.volFees.map((fee) =>
            PlutusMaybe.wrap(
              Maybe.map(fee, (x) => ({
                list: [PlutusInt.wrap(x[0]), PlutusInt.wrap(x[1])],
              })),
            ),
          ),
        },
      ],
    };
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>): PoolBatchingV2Redeemer {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData);
  }

  export function toDataHex(data: PoolBatchingV2Redeemer): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }
}

export type PoolStateOptions = {
  datumReserves: [bigint, bigint];
  valueReserves: [bigint, bigint];
  totalLiquidity?: bigint;
};

export type PoolV2Constructor = {
  txIn: TxIn;
  value: Value;
  datum: PoolV2Datum;
  address: Address;
  networkEnv: NetworkEnvironment;
};

export class PoolV2 extends BaseUtxoModel {
  readonly datum: PoolV2Datum;
  readonly lpPolicyId: Bytes;
  readonly poolAuthenAsset: Asset;
  readonly networkEnv: NetworkEnvironment;

  constructor({ txIn, value, datum, address, networkEnv }: PoolV2Constructor) {
    const rawDatum = PoolV2Datum.toDataHex(datum);
    super(txIn, address, value, rawDatum);
    this.datum = datum;
    this.networkEnv = networkEnv;

    const cfg = getDexV2Configs(networkEnv);
    this.lpPolicyId = cfg.lpPolicyId;
    this.poolAuthenAsset = cfg.poolAuthenAsset;
  }

  get assetA(): Asset {
    return this.datum.assetA;
  }

  get assetB(): Asset {
    return this.datum.assetB;
  }

  get valueReserveA(): bigint {
    if (this.assetA.equals(ADA)) {
      return this.value.get(this.assetA) - DEX_V2_DEFAULT_POOL_ADA;
    }
    return this.value.get(this.assetA);
  }

  get valueReserveB(): bigint {
    return this.value.get(this.assetB);
  }

  get datumReserveA(): bigint {
    return this.datum.reserveA;
  }

  get datumReserveB(): bigint {
    return this.datum.reserveB;
  }

  get datumReserves(): [bigint, bigint] {
    return [this.datumReserveA, this.datumReserveB];
  }

  set datumReserves(reserves: [bigint, bigint]) {
    const [reserveA, reserveB] = reserves;
    this.datum.reserveA = reserveA;
    this.datum.reserveB = reserveB;
  }

  get valueReserves(): [bigint, bigint] {
    return [this.valueReserveA, this.valueReserveB];
  }

  set valueReserves(reserves: [bigint, bigint]) {
    const [reserveA, reserveB] = reserves;
    if (this.assetA.equals(ADA)) {
      this.value.set(this.assetA, reserveA + DEX_V2_DEFAULT_POOL_ADA).set(this.assetB, reserveB);
    } else {
      this.value.set(this.assetA, reserveA).set(this.assetB, reserveB);
    }
  }

  get authenAsset(): Asset {
    const authenAssetAmount = this.value.get(this.poolAuthenAsset);
    invariant(authenAssetAmount === 1n, `Pool V2 must have exactly 1 Authen token`);
    return this.poolAuthenAsset;
  }

  get lpAsset(): Asset {
    return new Asset(this.lpPolicyId, PoolV2.computeLPAssetName(this.datum.assetA, this.datum.assetB));
  }

  get liquidityShare(): [bigint, bigint] {
    return [this.valueReserveA - this.datumReserveA, this.valueReserveB - this.datumReserveB];
  }

  get totalLiquidity(): bigint {
    return this.datum.totalLiquidity;
  }

  get remainingLiquiditySupply(): bigint {
    return this.value.get(this.lpAsset);
  }

  get baseFee(): PoolV2BaseFee {
    return this.datum.baseFee;
  }

  get feeSharingNumerator(): Maybe<bigint> {
    if (Maybe.isJust(this.datum.feeSharingNumerator)) {
      return this.datum.feeSharingNumerator;
    }
    return undefined;
  }

  get pair(): [Asset, Asset] {
    return [this.assetA, this.assetB];
  }

  involvesAsset(asset: Asset): boolean {
    return asset.equals(this.assetA) || asset.equals(this.assetB);
  }

  datumReserveOf(asset: Asset): bigint {
    invariant(this.involvesAsset(asset), `unexpected asset, actual: ${asset.toString()}`);
    if (this.assetA.equals(asset)) {
      return this.datumReserveA;
    } else {
      return this.datumReserveB;
    }
  }

  getPoolInfo(): {
    datumReserves: [bigint, bigint];
    valueReserves: [bigint, bigint];
    totalLiquidity: bigint;
    tradingFee: PoolV2BaseFee;
    feeSharingNumerator: Maybe<bigint>;
  } {
    return {
      datumReserves: this.datumReserves,
      valueReserves: this.valueReserves,
      totalLiquidity: this.totalLiquidity,
      tradingFee: this.baseFee,
      feeSharingNumerator: this.feeSharingNumerator,
    };
  }

  getAssetIn(direction: OrderV2Direction): Asset {
    return direction === OrderV2Direction.A_TO_B ? this.assetA : this.assetB;
  }

  getAssetOut(direction: OrderV2Direction): Asset {
    return direction === OrderV2Direction.A_TO_B ? this.assetB : this.assetA;
  }

  getDirectionByAssetIn(assetIn: Asset): Result<OrderV2Direction, Error> {
    if (!assetIn.equals(this.assetA) && !assetIn.equals(this.assetB)) {
      return Result.err(new Error(`Asset ${assetIn.toString()} is not belonged to Pool`));
    }
    return assetIn.equals(this.assetA) ? Result.ok(OrderV2Direction.A_TO_B) : Result.ok(OrderV2Direction.B_TO_A);
  }

  getDirectionByAssetOut(assetOut: Asset): Result<OrderV2Direction, Error> {
    if (!assetOut.equals(this.assetA) && !assetOut.equals(this.assetB)) {
      return Result.err(new Error(`Asset ${assetOut.toString()} is not belonged to Pool`));
    }
    return assetOut.equals(this.assetA) ? Result.ok(OrderV2Direction.B_TO_A) : Result.ok(OrderV2Direction.A_TO_B);
  }

  getEarnFeeSharing(): {
    earnedA: bigint;
    earnedB: bigint;
  } {
    return {
      earnedA: this.valueReserveA - this.datumReserveA,
      earnedB: this.valueReserveB - this.datumReserveB,
    };
  }

  cloneNewPoolState({ datumReserves, valueReserves, totalLiquidity }: PoolStateOptions): PoolV2 {
    const clonePool = this.clone();
    clonePool.datumReserves = datumReserves;
    clonePool.valueReserves = valueReserves;
    const oldTotalLiquidity = clonePool.totalLiquidity;
    if (totalLiquidity !== undefined) {
      clonePool.datum.totalLiquidity = totalLiquidity;
    }
    const deltaTotalLiquidity = clonePool.totalLiquidity - oldTotalLiquidity;
    const remainingLiquiditySupply = clonePool.remainingLiquiditySupply;
    const newRemainingLiquiditySupply = remainingLiquiditySupply - deltaTotalLiquidity;
    clonePool.value.set(clonePool.lpAsset, newRemainingLiquiditySupply);
    return clonePool;
  }

  clone(): PoolV2 {
    return new PoolV2({
      txIn: TxIn.clone(this.txIn),
      value: this.value.clone(),
      datum: PoolV2Datum.clone(this.datum),
      address: this.address,
      networkEnv: this.networkEnv,
    });
  }

  toXJSON(): { $dexV2Pool: PoolV2Constructor } {
    return {
      $dexV2Pool: {
        txIn: this.txIn,
        value: this.value,
        datum: this.datum,
        address: this.address,
        networkEnv: this.networkEnv,
      },
    };
  }

  static computeLPAssetName(assetA: Asset, assetB: Asset): Bytes {
    const [normalizedAssetA, normalizedAssetB] = normalizePair([assetA, assetB]);
    return Bytes.fromHex(sha3(normalizedAssetA.toSHA3() + normalizedAssetB.toSHA3()));
  }

  static computeLpAsset(assetA: Asset, assetB: Asset, networkEnv: NetworkEnvironment): Asset {
    const cfg = getDexV2Configs(networkEnv);
    return new Asset(cfg.lpPolicyId, PoolV2.computeLPAssetName(assetA, assetB));
  }

  static fromUtxo(utxo: Utxo, networkEnv: NetworkEnvironment): Result<PoolV2, Error> {
    try {
      const { input, output } = utxo;
      const { value } = output;
      invariant(output.includeInlineDatums(), `pool have to include inline datum`);
      const rawDatum = Result.unwrap(output.getInlineDatum());
      const datum = PoolV2Datum.fromDataHex(rawDatum.hex);
      const { assetA, assetB }: PoolV2Datum = datum;
      invariant(value.has(assetA), `pool value doesn't have asset ${assetA.toString()}`);
      invariant(value.has(assetB), `pool value doesn't have asset ${assetB.toString()}`);
      const pool = new PoolV2({
        txIn: input,
        value: value,
        datum: datum,
        address: utxo.output.address,
        networkEnv,
      });
      // safety check
      pool.authenAsset;
      return Result.ok(pool);
    } catch (err) {
      let errorStr = "PoolV2.fromUtxo error: ";
      if (err instanceof Error) {
        errorStr += err.message;
      } else {
        errorStr += "Unexpected error";
      }
      return Result.err(new Error(errorStr));
    }
  }

  get utxo(): Utxo {
    return {
      input: this.txIn,
      output: TxOut.newScriptOut({
        address: this.address,
        value: this.value,
        datumSource: DatumSource.newInlineDatum(Bytes.fromHex(PoolV2Datum.toDataHex(this.datum))),
      }),
    };
  }
}
