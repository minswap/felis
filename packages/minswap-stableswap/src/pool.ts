import invariant from "@minswap/tiny-invariant";
import {
  type Asset,
  BaseUtxoModel,
  Bytes,
  type NetworkEnvironment,
  PlutusBytes,
  PlutusConstr,
  PlutusData,
  PlutusInt,
  PlutusList,
  TxIn,
  UnwrapPlutusDataError,
  type Utxo,
  type Value,
} from "@minswap/felis-ledger-core";
import { type CborHex, type CSLPlutusData, Result } from "@minswap/felis-ledger-utils";
import JSONBig from "json-bigint";
import { zipWith } from "remeda";
import { type StableswapPoolConfig, getStableswapPoolConfigs } from "./configs";
import type { StableswapPoolCalculationError } from "./error";
import {
  StableswapCalculation,
  type StableswapDepositResult,
  type StableswapExchangeResult,
  type StableswapWithdrawImbalanceResult,
  type StableswapWithdrawOneCoinResult,
  type StableswapWithdrawResult,
} from "./utils";

export type StableswapAssetInfo = {
  asset: Asset;
  balance: bigint;
  multiple: bigint;
};

export namespace StableswapAssetInfo {
  export function extractToArray(infos: StableswapAssetInfo[]): {
    assets: Asset[];
    balances: bigint[];
    multiples: bigint[];
  } {
    const assets: Asset[] = [];
    const balances: bigint[] = [];
    const multiples: bigint[] = [];
    for (const info of infos) {
      assets.push(info.asset);
      balances.push(info.balance);
      multiples.push(info.multiple);
    }
    return {
      assets,
      balances,
      multiples,
    };
  }

  export function clone(info: StableswapAssetInfo): StableswapAssetInfo {
    return {
      asset: info.asset.clone(),
      balance: info.balance,
      multiple: info.multiple,
    };
  }

  export function normalize(infos: StableswapAssetInfo[]): StableswapAssetInfo[] {
    const cloneInfos = infos.map(StableswapAssetInfo.clone);
    cloneInfos.sort((a, b) => a.asset.compare(b.asset));
    return cloneInfos;
  }

  export function zipArray(assets: Asset[], balances: bigint[], multiples: bigint[]): StableswapAssetInfo[] {
    invariant(
      assets.length === balances.length && balances.length === multiples.length,
      "assets, balances and multiples must be the same length",
    );
    const assetInfos: StableswapAssetInfo[] = [];
    for (let i = 0; i < assets.length; i++) {
      assetInfos.push({
        asset: assets[i],
        balance: balances[i],
        multiple: multiples[i],
      });
    }
    return assetInfos;
  }
}

export type StableswapPoolDatum = {
  balances: bigint[];
  totalLiquidity: bigint;
  amplificationCoefficient: bigint;
  orderHash: Bytes;
};

export namespace StableswapPoolDatum {
  export function fromPlutusJson(d: PlutusData): StableswapPoolDatum {
    const { fields } = PlutusConstr.unwrap(d, { [0]: 4 });
    return {
      balances: PlutusList.unwrap(fields[0]).map(PlutusInt.unwrapToBigInt),
      totalLiquidity: PlutusInt.unwrapToBigInt(fields[1]),
      amplificationCoefficient: PlutusInt.unwrapToBigInt(fields[2]),
      orderHash: Bytes.fromHex(PlutusBytes.unwrap(fields[3])),
    };
  }

  export function toPlutusJson(pd: StableswapPoolDatum): PlutusData {
    return {
      constructor: 0,
      fields: [
        {
          list: pd.balances.map(PlutusInt.wrap),
        },
        PlutusInt.wrap(pd.totalLiquidity),
        PlutusInt.wrap(pd.amplificationCoefficient),
        PlutusBytes.wrap(pd.orderHash),
      ],
    };
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>): StableswapPoolDatum {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData);
  }

  export function toDataHex(data: StableswapPoolDatum): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }

  export function clone(datum: StableswapPoolDatum): StableswapPoolDatum {
    const cloneBalances: bigint[] = [];
    for (const balance of datum.balances) {
      cloneBalances.push(balance);
    }
    return {
      balances: cloneBalances,
      totalLiquidity: datum.totalLiquidity,
      amplificationCoefficient: datum.amplificationCoefficient,
      orderHash: datum.orderHash.clone(),
    };
  }
}

export enum StableswapPoolRedeemerType {
  APPLY_POOL = 0,
  WITHDRAW_ADMIN_FEE = 1,
  UPDATE_AMP_OR_STAKE_CREDENTIAL = 2,
}

export type StableswapPoolRedeemer =
  | {
      type: StableswapPoolRedeemerType.APPLY_POOL;
      inputIndexes: bigint[];
      licenseIndex: bigint;
    }
  | {
      type: StableswapPoolRedeemerType.WITHDRAW_ADMIN_FEE;
      adminIndex: bigint;
      feeToIndex: bigint;
    }
  | {
      type: StableswapPoolRedeemerType.UPDATE_AMP_OR_STAKE_CREDENTIAL;
      adminIndex: bigint;
    };

export namespace StableswapPoolRedeemer {
  export function fromPlutusJson(d: PlutusData): StableswapPoolRedeemer {
    // biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
    const { constructor, fields } = PlutusConstr.unwrap(d, {
      [0]: 2,
      [1]: 2,
      [2]: 1,
    });
    switch (constructor) {
      case StableswapPoolRedeemerType.APPLY_POOL:
        return {
          type: constructor,
          inputIndexes: PlutusList.unwrap(fields[0]).map(PlutusInt.unwrapToBigInt),
          licenseIndex: PlutusInt.unwrapToBigInt(fields[1]),
        };
      case StableswapPoolRedeemerType.WITHDRAW_ADMIN_FEE:
        return {
          type: constructor,
          adminIndex: PlutusInt.unwrapToBigInt(fields[0]),
          feeToIndex: PlutusInt.unwrapToBigInt(fields[1]),
        };
      case StableswapPoolRedeemerType.UPDATE_AMP_OR_STAKE_CREDENTIAL:
        return {
          type: constructor,
          adminIndex: PlutusInt.unwrapToBigInt(fields[0]),
        };
      default: {
        throw new UnwrapPlutusDataError(`StableswapPoolRedeemer.fromPlutusJson: unexpected constr ${d}`);
      }
    }
  }

  export function toPlutusJson(pr: StableswapPoolRedeemer): PlutusData {
    switch (pr.type) {
      case StableswapPoolRedeemerType.APPLY_POOL: {
        return {
          constructor: pr.type,
          fields: [
            {
              list: pr.inputIndexes.map(PlutusInt.wrap),
            },
            PlutusInt.wrap(pr.licenseIndex),
          ],
        };
      }
      case StableswapPoolRedeemerType.WITHDRAW_ADMIN_FEE: {
        return {
          constructor: pr.type,
          fields: [PlutusInt.wrap(pr.adminIndex), PlutusInt.wrap(pr.feeToIndex)],
        };
      }
      case StableswapPoolRedeemerType.UPDATE_AMP_OR_STAKE_CREDENTIAL: {
        return {
          constructor: pr.type,
          fields: [PlutusInt.wrap(pr.adminIndex)],
        };
      }
    }
  }

  export function fromDataHex(data: CborHex<CSLPlutusData>): StableswapPoolRedeemer {
    const plutusData = PlutusData.fromDataHex(data);
    return fromPlutusJson(plutusData);
  }

  export function toDataHex(data: StableswapPoolRedeemer): CborHex<CSLPlutusData> {
    const plutusJson = toPlutusJson(data);
    return PlutusData.toDataHex(plutusJson);
  }
}

export type StableswapPoolState = {
  datumBalances: bigint[];
  valueBalances: bigint[];
  totalLiquidity?: bigint;
};

export type StableswapPoolConstructor = {
  txIn: TxIn;
  value: Value;
  datum: StableswapPoolDatum;
  networkEnvironment: NetworkEnvironment;
};

export class StableswapPool extends BaseUtxoModel {
  readonly datum: StableswapPoolDatum;
  readonly poolIdentifier: string;
  readonly poolAssets: Asset[];
  readonly assetInfos: StableswapAssetInfo[];
  readonly lpAsset: Asset;
  readonly nftAsset: Asset;
  readonly fee: bigint;
  readonly adminFee: bigint;
  readonly feeDenominator: bigint;
  readonly earnedAdminFeeAmounts: bigint[];
  readonly networkEnvironment: NetworkEnvironment;

  constructor({ txIn, value, datum, networkEnvironment }: StableswapPoolConstructor) {
    const rawDatum = StableswapPoolDatum.toDataHex(datum);
    const poolConfig = StableswapPool.getStableswapPoolConfig(value, networkEnvironment);
    if (!poolConfig) {
      throw new Error(`fail to construct pool, not found pool config:
      value: ${JSONBig.stringify(value)}
      datum: ${JSONBig.stringify(datum)}
    `);
    }
    const [identifier, config] = poolConfig;
    super(txIn, config.poolAddress, value, rawDatum);
    this.datum = datum;
    this.networkEnvironment = networkEnvironment;
    this.poolIdentifier = identifier;
    this.lpAsset = config.lpAsset;
    this.nftAsset = config.nftAsset;
    this.fee = config.fee;
    this.adminFee = config.adminFee;
    this.feeDenominator = config.feeDenominator;
    this.poolAssets = config.assets;
    this.assetInfos = StableswapAssetInfo.zipArray(config.assets, this.datum.balances, config.multiples);
    this.earnedAdminFeeAmounts = this.calculateEarnedAdminFeeAmounts();
    if (!this.validatePoolValue()) {
      throw new Error(`fail to construct pool, pool value is not valid:
      value: ${JSONBig.stringify(value)}
      datum: ${JSONBig.stringify(datum)}
    `);
    }
  }

  get multiples(): bigint[] {
    return this.assetInfos.map((i) => i.multiple);
  }

  get datumBalances(): bigint[] {
    return this.datum.balances;
  }

  get valueBalances(): bigint[] {
    return this.assetInfos.map((i) => this.value.get(i.asset));
  }

  get amp(): bigint {
    return this.datum.amplificationCoefficient;
  }

  get totalLiquidity(): bigint {
    return this.datum.totalLiquidity;
  }

  getPoolInfo(): {
    amp: bigint;
    fee: bigint;
    adminFee: bigint;
    feeDenominator: bigint;
    multiples: bigint[];
    datumBalances: bigint[];
    valueBalances: bigint[];
    totalLiquidity: bigint;
  } {
    return {
      amp: this.amp,
      fee: this.fee,
      adminFee: this.adminFee,
      feeDenominator: this.feeDenominator,
      multiples: this.multiples,
      datumBalances: this.datumBalances,
      valueBalances: this.valueBalances,
      totalLiquidity: this.totalLiquidity,
    };
  }

  private calculateEarnedAdminFeeAmounts(): bigint[] {
    const extractedAssetInfos = StableswapAssetInfo.extractToArray(this.assetInfos);
    const poolAssets = extractedAssetInfos.assets;
    const valueBalances = poolAssets.map((a) => this.value.get(a));
    const earnedAdminFeeAmounts = zipWith(
      valueBalances,
      extractedAssetInfos.balances,
      (valueBalance, datumBalance) => valueBalance - datumBalance,
    );
    if (earnedAdminFeeAmounts.some((amount) => amount < 0n)) {
      throw new Error(
        `calculateEarnedAdminFeeAmounts: admin fee amounts must be non-negative, actual: ${JSONBig.stringify(
          earnedAdminFeeAmounts,
        )}`,
      );
    }
    return earnedAdminFeeAmounts;
  }

  private static getStableswapPoolConfig(
    value: Value,
    networkEnvironment: NetworkEnvironment,
  ): [string, StableswapPoolConfig] | null {
    const flattenValue = value.flatten();
    const allPoolConfigs = getStableswapPoolConfigs(networkEnvironment);
    for (const [key, config] of Object.entries(allPoolConfigs)) {
      for (const [asset, amount] of flattenValue) {
        if (asset.equals(config.nftAsset) && amount === 1n) {
          return [key, config];
        }
      }
    }
    return null;
  }

  clone(): StableswapPool {
    return new StableswapPool({
      txIn: TxIn.clone(this.txIn),
      value: this.value.clone(),
      datum: StableswapPoolDatum.clone(this.datum),
      networkEnvironment: this.networkEnvironment,
    });
  }

  cloneNewPoolState({ datumBalances, valueBalances, totalLiquidity }: StableswapPoolState): StableswapPool {
    const clonePool = this.clone();
    clonePool.datum.balances = datumBalances;
    for (let i = 0; i < clonePool.assetInfos.length; i++) {
      clonePool.value.set(clonePool.assetInfos[i].asset, valueBalances[i]);
    }
    if (totalLiquidity) {
      clonePool.datum.totalLiquidity = totalLiquidity;
    }
    return clonePool;
  }

  private validatePoolValue(): boolean {
    const valueLength = this.value.size();
    let stableAssetNum = 0;
    const poolAssets = this.assetInfos.map((i) => i.asset);
    for (const asset of poolAssets) {
      if (this.value.has(asset)) {
        stableAssetNum += 1;
      }
    }
    return valueLength === stableAssetNum + 2;
  }

  static fromUtxo(
    utxo: Utxo,
    networkEnvironment: NetworkEnvironment,
    datums?: Record<string, string>,
  ): StableswapPool {
    let datum: StableswapPoolDatum | undefined = undefined;
    const { input, output } = utxo;
    const value = output.value;
    if (output.includeInlineDatums()) {
      const rawDatum = Result.unwrap(output.getInlineDatum());
      datum = StableswapPoolDatum.fromDataHex(rawDatum.hex);
    } else {
      const datumHash = Result.unwrap(utxo.output.getDatumHash());
      const rawDatum = datums?.[datumHash.hex];
      invariant(rawDatum, "tx must have full datum of pool");
      datum = StableswapPoolDatum.fromDataHex(rawDatum);
    }
    try {
      const pool = new StableswapPool({
        txIn: input,
        value: value,
        datum: datum,
        networkEnvironment: networkEnvironment,
      });
      const assetInfos = pool.assetInfos;
      for (const info of assetInfos) {
        const asset = info.asset;
        const balance = info.balance;
        invariant(
          value.get(asset) >= balance,
          `amount of asset must be greater than or equals balance, amount: ${value.get(asset)}, balance: ${balance}`,
        );
      }
      return pool;
    } catch (err) {
      throw new Error(`fail to parse pool from utxo:
        utxo: ${JSONBig.stringify(utxo)}
        datum: ${JSONBig.stringify(datum)}
        error: ${err}
      `);
    }
  }

  calculateExchange(
    inIndex: number,
    outIndex: number,
    amountIn: bigint,
  ): Result<StableswapExchangeResult, StableswapPoolCalculationError> {
    const extractedAssetInfos = StableswapAssetInfo.extractToArray(this.assetInfos);
    return StableswapCalculation.calculateExchange({
      inIndex: inIndex,
      outIndex: outIndex,
      amountIn: amountIn,
      amp: this.datum.amplificationCoefficient,
      multiples: extractedAssetInfos.multiples,
      datumBalances: this.datum.balances,
      valueBalances: extractedAssetInfos.assets.map((a) => this.value.get(a)),
      fee: this.fee,
      adminFee: this.adminFee,
      feeDenominator: this.feeDenominator,
    });
  }

  calculateDeposit(amountIns: bigint[]): Result<StableswapDepositResult, StableswapPoolCalculationError> {
    const extractedAssetInfos = StableswapAssetInfo.extractToArray(this.assetInfos);
    return StableswapCalculation.calculateDeposit({
      amountIns: amountIns,
      totalLiquidity: this.totalLiquidity,
      amp: this.datum.amplificationCoefficient,
      multiples: extractedAssetInfos.multiples,
      datumBalances: this.datum.balances,
      valueBalances: extractedAssetInfos.assets.map((a) => this.value.get(a)),
      fee: this.fee,
      adminFee: this.adminFee,
      feeDenominator: this.feeDenominator,
    });
  }

  calculateWithdraw(withdrawalLPAmount: bigint): Result<StableswapWithdrawResult, StableswapPoolCalculationError> {
    const extractedAssetInfos = StableswapAssetInfo.extractToArray(this.assetInfos);
    return StableswapCalculation.calculateWithdraw({
      withdrawalLPAmount: withdrawalLPAmount,
      datumBalances: this.datum.balances,
      valueBalances: extractedAssetInfos.assets.map((a) => this.value.get(a)),
      multiples: extractedAssetInfos.multiples,
      totalLiquidity: this.totalLiquidity,
    });
  }

  calculateWithdrawImbalance(
    withdrawAmounts: bigint[],
  ): Result<StableswapWithdrawImbalanceResult, StableswapPoolCalculationError> {
    const extractedAssetInfos = StableswapAssetInfo.extractToArray(this.assetInfos);
    return StableswapCalculation.calculateWithdrawImbalance({
      withdrawAmounts: withdrawAmounts,
      totalLiquidity: this.totalLiquidity,
      amp: this.datum.amplificationCoefficient,
      multiples: extractedAssetInfos.multiples,
      datumBalances: this.datum.balances,
      valueBalances: extractedAssetInfos.assets.map((a) => this.value.get(a)),
      fee: this.fee,
      adminFee: this.adminFee,
      feeDenominator: this.feeDenominator,
    });
  }

  calculateWithdrawOneCoin(
    amountLpIn: bigint,
    outIndex: number,
  ): Result<StableswapWithdrawOneCoinResult, StableswapPoolCalculationError> {
    const extractedAssetInfos = StableswapAssetInfo.extractToArray(this.assetInfos);
    return StableswapCalculation.calculateWithdrawOneCoin({
      amountLpIn: amountLpIn,
      outIndex: outIndex,
      totalLiquidity: this.totalLiquidity,
      amp: this.datum.amplificationCoefficient,
      multiples: extractedAssetInfos.multiples,
      datumBalances: this.datum.balances,
      valueBalances: extractedAssetInfos.assets.map((a) => this.value.get(a)),
      fee: this.fee,
      adminFee: this.adminFee,
      feeDenominator: this.feeDenominator,
    });
  }

  /**
   * @param assetAIndex
   * @param assetBIndex
   * @returns price of asset B
   */
  calculateCurrentPrice(assetAIndex: number, assetBIndex: number): [bigint, bigint] {
    return StableswapCalculation.getPrice(this.datumBalances, this.multiples, this.amp, assetAIndex, assetBIndex);
  }

  toXJSON(): { $stableswapPool: StableswapPoolConstructor } {
    return {
      $stableswapPool: {
        txIn: this.txIn,
        value: this.value,
        datum: this.datum,
        networkEnvironment: this.networkEnvironment,
      },
    };
  }
}
