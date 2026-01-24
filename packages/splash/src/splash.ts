/**
 * Splash DEX contracts
 * References:
 * - Order datum: https://github.com/splashprotocol/protocol-sdk/blob/main/packages/builder/src/builders/splash/operations/spotOrder/spotOrderDatum/spotOrderDatum.ts
 * - Pool datum: https://github.com/splashprotocol/protocol-sdk/blob/main/packages/builder/src/builders/splash/operations/createCfmmPool/createCfmmPoolDatum/createCfmmPoolDatum.ts
 */

import {
  ADA,
  Address,
  AddressType,
  Asset,
  BaseUtxoModel,
  Bytes,
  CredentialType,
  DatumSourceType,
  NetworkID,
  type NetworkEnvironment,
  PlutusBytes,
  PlutusConstr,
  PlutusData,
  PlutusInt,
  PlutusList,
  PublicKeyHash,
  type Utxo,
  Value,
} from "@repo/ledger-core";
import { type CborHex, Maybe, Result } from "@repo/ledger-utils";
import invariant from "@minswap/tiny-invariant";

export namespace Splash {
  // ============================================================================
  // Constants
  // ============================================================================

  // Spot Order V3 (current version)
  export const ORDER_SCRIPT_HASH_V3 = "464eeee89f05aff787d40045af2a40a83fd96c513197d32fbc54ff02";
  // Spot Order V2
  export const ORDER_SCRIPT_HASH_V2 = "2025463437ee5d64e89814a66ce7f98cb184a66ae85a2fbbfd750106";
  // Spot Order V1
  export const ORDER_SCRIPT_HASH_V1 = "dbe7a3d8a1d82990992a38eea1a2efaa68e931e252fc92ca1383809b";

  // Fee Switch Pool script hashes
  export const POOL_SCRIPT_HASH_FEE_SWITCH_V1 = "c8b888b0977ddd2a0c85ca7a9f9c614d9b03b016f952e9a6ea10094f";
  export const POOL_SCRIPT_HASH_FEE_SWITCH_V2 = "cfee8a0c218a7a36e76bca4fb4c7fd8779fd7fd87ca602820951c92b";

  // Royalty Pool
  export const POOL_SCRIPT_HASH_ROYALTY = "a155f866867c61af94d4ad1f761c0cb6c6ec633a91c24f25a5ec674a";

  export const ORDER_DATUM_TYPE = "00";
  export const EMPTY_BEACON = "00000000000000000000000000000000000000000000000000000000";
  export const DEFAULT_BATCHER_KEY = "5cb2c968e5d1c7197a6ce7615967310a375545d9bc65063a964335b2";

  export const MIN_POOL_ADA = 3_000_000n;
  export const DEFAULT_DEPOSIT = 1_500_000n;
  export const DEFAULT_COST_PER_EX_STEP = 1_000_000n;

  // ============================================================================
  // Order Datum
  // https://github.com/splashprotocol/protocol-sdk/blob/main/packages/builder/src/builders/splash/operations/spotOrder/spotOrderDatum/spotOrderDatum.ts
  // ============================================================================

  export type OrderDatum = {
    type: Bytes;
    beacon: Bytes;
    inputAsset: Asset;
    inputAmount: bigint;
    costPerExStep: bigint;
    minMarginalOutput: bigint;
    outputAsset: Asset;
    price: {
      numerator: bigint;
      denominator: bigint;
    };
    executorFee: bigint;
    receiver: Address;
    cancelPkh: PublicKeyHash;
    permittedExecutors: Bytes[];
  };

  export namespace OrderDatum {
    export function fromPlutusJson(data: PlutusData, networkEnv: NetworkEnvironment): OrderDatum {
      const { fields } = PlutusConstr.unwrap(data, { [0]: 12 });

      const inputAssetConstr = PlutusConstr.unwrap(fields[2], { [0]: 2 });
      const outputAssetConstr = PlutusConstr.unwrap(fields[6], { [0]: 2 });
      const priceConstr = PlutusConstr.unwrap(fields[7], { [0]: 2 });

      const permittedExecutorsList = PlutusList.unwrap(fields[11]);

      return {
        type: Bytes.fromHex(PlutusBytes.unwrap(fields[0])),
        beacon: Bytes.fromHex(PlutusBytes.unwrap(fields[1])),
        inputAsset: new Asset(
          Bytes.fromHex(PlutusBytes.unwrap(inputAssetConstr.fields[0])),
          Bytes.fromHex(PlutusBytes.unwrap(inputAssetConstr.fields[1])),
        ),
        inputAmount: PlutusInt.unwrapToBigInt(fields[3]),
        costPerExStep: PlutusInt.unwrapToBigInt(fields[4]),
        minMarginalOutput: PlutusInt.unwrapToBigInt(fields[5]),
        outputAsset: new Asset(
          Bytes.fromHex(PlutusBytes.unwrap(outputAssetConstr.fields[0])),
          Bytes.fromHex(PlutusBytes.unwrap(outputAssetConstr.fields[1])),
        ),
        price: {
          numerator: PlutusInt.unwrapToBigInt(priceConstr.fields[0]),
          denominator: PlutusInt.unwrapToBigInt(priceConstr.fields[1]),
        },
        executorFee: PlutusInt.unwrapToBigInt(fields[8]),
        receiver: Address.fromPlutusJson(fields[9], networkEnv),
        cancelPkh: PublicKeyHash.fromPlutusJson(fields[10]),
        permittedExecutors: permittedExecutorsList.map((e: PlutusData) => Bytes.fromHex(PlutusBytes.unwrap(e))),
      };
    }

    export function toPlutusJson(data: OrderDatum): PlutusData {
      return {
        constructor: 0,
        fields: [
          PlutusBytes.wrap(data.type),
          PlutusBytes.wrap(data.beacon),
          {
            constructor: 0,
            fields: [PlutusBytes.wrap(data.inputAsset.currencySymbol), PlutusBytes.wrap(data.inputAsset.tokenName)],
          },
          PlutusInt.wrap(data.inputAmount),
          PlutusInt.wrap(data.costPerExStep),
          PlutusInt.wrap(data.minMarginalOutput),
          {
            constructor: 0,
            fields: [PlutusBytes.wrap(data.outputAsset.currencySymbol), PlutusBytes.wrap(data.outputAsset.tokenName)],
          },
          {
            constructor: 0,
            fields: [PlutusInt.wrap(data.price.numerator), PlutusInt.wrap(data.price.denominator)],
          },
          PlutusInt.wrap(data.executorFee),
          data.receiver.toPlutusJson(),
          data.cancelPkh.toPlutusJson(),
          { list: data.permittedExecutors.map((e) => PlutusBytes.wrap(e)) },
        ],
      };
    }

    export function toDataHex(data: OrderDatum): string {
      const plutusJson = toPlutusJson(data);
      return PlutusData.toDataHex(plutusJson);
    }

    export function fromDataHex(data: string, networkEnv: NetworkEnvironment): OrderDatum {
      const plutusJson = PlutusData.fromDataHex(data);
      return fromPlutusJson(plutusJson, networkEnv);
    }
  }

  // ============================================================================
  // OrderInfo (derived from OrderDatum for easier consumption)
  // ============================================================================

  export type OrderInfo = {
    assetIn: Asset;
    amountIn: bigint;
    assetOut: Asset;
    minimumReceive: bigint;
    batcherFee: bigint;
    deposit: bigint;
    sender: Address;
    receiver: Address;
  };

  export function getOrderInfo(options: { value: Value; datum: OrderDatum }): Maybe<OrderInfo> {
    const { value, datum } = options;

    const assetIn = datum.inputAsset;
    const amountIn = datum.inputAmount;
    const assetOut = datum.outputAsset;
    const minimumReceive = datum.minMarginalOutput;

    // Batcher fee = executorFee + (minMarginalOutput * costPerExStep / 1_000_000)
    const executionCost = (datum.minMarginalOutput * datum.costPerExStep) / 1_000_000n;
    const batcherFee = datum.executorFee + executionCost;

    let deposit = value.get(ADA) - batcherFee;
    if (assetIn.equals(ADA)) {
      deposit -= amountIn;
    }

    return {
      sender: datum.receiver,
      receiver: datum.receiver,
      assetIn,
      amountIn,
      assetOut,
      minimumReceive,
      batcherFee,
      deposit,
    };
  }

  // ============================================================================
  // Credential Types (for DAO field)
  // ============================================================================

  export enum CredentialTypeEnum {
    PubKeyHash = 0,
    ScriptHash = 1,
  }

  export type Credential =
    | { type: CredentialTypeEnum.PubKeyHash; hash: Bytes }
    | { type: CredentialTypeEnum.ScriptHash; hash: Bytes };

  export namespace Credential {
    export function fromPlutusJson(data: PlutusData): Credential {
      const { constructor: constr, fields } = PlutusConstr.unwrap(data, {
        [CredentialTypeEnum.PubKeyHash]: 1,
        [CredentialTypeEnum.ScriptHash]: 1,
      });

      switch (constr) {
        case CredentialTypeEnum.PubKeyHash:
          return { type: CredentialTypeEnum.PubKeyHash, hash: Bytes.fromHex(PlutusBytes.unwrap(fields[0])) };
        case CredentialTypeEnum.ScriptHash:
          return { type: CredentialTypeEnum.ScriptHash, hash: Bytes.fromHex(PlutusBytes.unwrap(fields[0])) };
        default:
          throw new Error(`Splash: Unknown credential type: ${constr}`);
      }
    }

    export function toPlutusJson(data: Credential): PlutusData {
      return {
        constructor: data.type,
        fields: [PlutusBytes.wrap(data.hash)],
      };
    }
  }

  // ============================================================================
  // PoolDatum (CFMM Fee Switch / Royalty Pool)
  // https://github.com/splashprotocol/protocol-sdk/blob/main/packages/builder/src/builders/splash/operations/createCfmmPool/createCfmmPoolDatum/createCfmmPoolDatum.ts
  // ============================================================================

  export type PoolDatum = {
    nft: Asset;
    assetX: Asset;
    assetY: Asset;
    lpAsset: Asset;
    poolFee: bigint; // Fee numerator (denominator is 1000)
    treasuryFee: bigint;
    treasuryX: bigint;
    treasuryY: bigint;
    dao: Credential[];
    lqBound: bigint;
    treasury: Bytes;
  };

  export namespace PoolDatum {
    export function fromPlutusJson(data: PlutusData): PoolDatum {
      const { fields } = PlutusConstr.unwrap(data, { [0]: 11 });

      const nftConstr = PlutusConstr.unwrap(fields[0], { [0]: 2 });
      const assetXConstr = PlutusConstr.unwrap(fields[1], { [0]: 2 });
      const assetYConstr = PlutusConstr.unwrap(fields[2], { [0]: 2 });
      const lpAssetConstr = PlutusConstr.unwrap(fields[3], { [0]: 2 });
      const daoList = PlutusList.unwrap(fields[8]);

      return {
        nft: new Asset(
          Bytes.fromHex(PlutusBytes.unwrap(nftConstr.fields[0])),
          Bytes.fromHex(PlutusBytes.unwrap(nftConstr.fields[1])),
        ),
        assetX: new Asset(
          Bytes.fromHex(PlutusBytes.unwrap(assetXConstr.fields[0])),
          Bytes.fromHex(PlutusBytes.unwrap(assetXConstr.fields[1])),
        ),
        assetY: new Asset(
          Bytes.fromHex(PlutusBytes.unwrap(assetYConstr.fields[0])),
          Bytes.fromHex(PlutusBytes.unwrap(assetYConstr.fields[1])),
        ),
        lpAsset: new Asset(
          Bytes.fromHex(PlutusBytes.unwrap(lpAssetConstr.fields[0])),
          Bytes.fromHex(PlutusBytes.unwrap(lpAssetConstr.fields[1])),
        ),
        poolFee: PlutusInt.unwrapToBigInt(fields[4]),
        treasuryFee: PlutusInt.unwrapToBigInt(fields[5]),
        treasuryX: PlutusInt.unwrapToBigInt(fields[6]),
        treasuryY: PlutusInt.unwrapToBigInt(fields[7]),
        dao: daoList.map(Credential.fromPlutusJson),
        lqBound: PlutusInt.unwrapToBigInt(fields[9]),
        treasury: Bytes.fromHex(PlutusBytes.unwrap(fields[10])),
      };
    }

    export function toPlutusJson(datum: PoolDatum): PlutusData {
      return {
        constructor: 0,
        fields: [
          {
            constructor: 0,
            fields: [PlutusBytes.wrap(datum.nft.currencySymbol), PlutusBytes.wrap(datum.nft.tokenName)],
          },
          {
            constructor: 0,
            fields: [PlutusBytes.wrap(datum.assetX.currencySymbol), PlutusBytes.wrap(datum.assetX.tokenName)],
          },
          {
            constructor: 0,
            fields: [PlutusBytes.wrap(datum.assetY.currencySymbol), PlutusBytes.wrap(datum.assetY.tokenName)],
          },
          {
            constructor: 0,
            fields: [PlutusBytes.wrap(datum.lpAsset.currencySymbol), PlutusBytes.wrap(datum.lpAsset.tokenName)],
          },
          PlutusInt.wrap(datum.poolFee),
          PlutusInt.wrap(datum.treasuryFee),
          PlutusInt.wrap(datum.treasuryX),
          PlutusInt.wrap(datum.treasuryY),
          { list: datum.dao.map(Credential.toPlutusJson) },
          PlutusInt.wrap(datum.lqBound),
          PlutusBytes.wrap(datum.treasury),
        ],
      };
    }

    export function fromCborHex(data: CborHex<PoolDatum>): PoolDatum {
      const plutusData = PlutusData.fromDataHex(data);
      return fromPlutusJson(plutusData);
    }

    export function toCborHex(data: PoolDatum): CborHex<PoolDatum> {
      const plutusJson = toPlutusJson(data);
      return PlutusData.toDataHex(plutusJson);
    }

    export function clone(datum: PoolDatum): PoolDatum {
      return {
        nft: datum.nft,
        assetX: datum.assetX,
        assetY: datum.assetY,
        lpAsset: datum.lpAsset,
        poolFee: datum.poolFee,
        treasuryFee: datum.treasuryFee,
        treasuryX: datum.treasuryX,
        treasuryY: datum.treasuryY,
        dao: [...datum.dao],
        lqBound: datum.lqBound,
        treasury: datum.treasury.clone(),
      };
    }
  }

  // ============================================================================
  // Pool Class
  // ============================================================================

  export const FEE_DENOMINATOR = 1000n;
  export const MAX_LP_TOKENS = 9_223_372_036_854_775_807n;

  export type PoolConstructor = {
    utxo: Utxo;
    rawDatum: CborHex<PoolDatum>;
    networkEnv: NetworkEnvironment;
  };

  export class Pool extends BaseUtxoModel {
    readonly datum: PoolDatum;
    readonly networkEnv: NetworkEnvironment;

    constructor({ utxo, rawDatum, networkEnv }: PoolConstructor) {
      const { output } = utxo;
      const { address, value } = output;
      super(utxo.input, address, value, rawDatum);
      this.datum = PoolDatum.fromCborHex(rawDatum);
      this.networkEnv = networkEnv;
    }

    get nft(): Asset {
      return this.datum.nft;
    }

    get assetA(): Asset {
      return this.datum.assetX;
    }

    get assetB(): Asset {
      return this.datum.assetY;
    }

    get lpAsset(): Asset {
      return this.datum.lpAsset;
    }

    /**
     * Reserve X, subtracting treasury and min pool ADA if asset X is ADA
     */
    get reserveA(): bigint {
      const rawReserve = this.value.get(this.assetA) - this.datum.treasuryX;
      if (this.assetA.equals(ADA)) {
        return rawReserve - MIN_POOL_ADA;
      }
      return rawReserve;
    }

    /**
     * Reserve Y, subtracting treasury
     */
    get reserveB(): bigint {
      return this.value.get(this.assetB) - this.datum.treasuryY;
    }

    /**
     * Circulating LP = MAX_LP_TOKENS - burnedShareTokens
     */
    get liquidity(): bigint {
      const burnedShareTokens = this.value.get(this.lpAsset);
      return MAX_LP_TOKENS - burnedShareTokens;
    }

    get pair(): [Asset, Asset] {
      return [this.assetA, this.assetB];
    }

    /**
     * Pool fee numerator (denominator is 1000)
     */
    get poolFeeNumerator(): bigint {
      return this.datum.poolFee;
    }

    /**
     * Treasury fee numerator
     */
    get treasuryFeeNumerator(): bigint {
      return this.datum.treasuryFee;
    }

    /**
     * Total fee = poolFee + treasuryFee
     */
    get totalFeeNumerator(): bigint {
      return this.datum.poolFee + this.datum.treasuryFee;
    }

    static getPoolScriptHashes(): string[] {
      return [POOL_SCRIPT_HASH_FEE_SWITCH_V1, POOL_SCRIPT_HASH_FEE_SWITCH_V2, POOL_SCRIPT_HASH_ROYALTY];
    }

    static fromUtxo(utxo: Utxo, rawDatum: CborHex<PoolDatum>, networkEnv: NetworkEnvironment): Result<Pool, Error> {
      try {
        const { output } = utxo;
        const { value } = output;
        const scriptHash = output.address.toScriptHash();
        invariant(
          scriptHash && Pool.getPoolScriptHashes().includes(scriptHash.hex),
          `Splash Pool must have correct script hash`,
        );
        invariant(
          output.datumSource && output.datumSource.type === DatumSourceType.INLINE_DATUM,
          `Splash Pool must have inline datum`,
        );

        const datum = PoolDatum.fromCborHex(rawDatum);
        invariant(value.has(datum.nft), `Splash Pool must have NFT: ${datum.nft.toString()}`);

        const pool = new Pool({
          utxo,
          rawDatum,
          networkEnv,
        });
        return Result.ok(pool);
      } catch (err) {
        let errorStr = "Splash.Pool.fromUtxo error: ";
        if (err instanceof Error) {
          errorStr += err.message;
        } else {
          errorStr += "Unexpected error";
        }
        return Result.err(new Error(errorStr));
      }
    }
  }

  // ============================================================================
  // Order Script Hash Helpers
  // ============================================================================

  export function getOrderScriptHashes(): string[] {
    return [ORDER_SCRIPT_HASH_V3, ORDER_SCRIPT_HASH_V2, ORDER_SCRIPT_HASH_V1];
  }

  // ============================================================================
  // Order Redeemer
  // ============================================================================

  export enum OrderRedeemerType {
    Apply = 0,
    Cancel = 1,
  }

  export namespace OrderRedeemer {
    export function cancel(): PlutusData {
      return {
        constructor: OrderRedeemerType.Cancel,
        fields: [],
      };
    }
  }

  // ============================================================================
  // Order Address Helper
  // ============================================================================

  export function getOrderAddress(owner: Address, scriptHash: string = ORDER_SCRIPT_HASH_V3): Address {
    const ownerStakeAddress = owner.toStakeAddress();
    if (ownerStakeAddress) {
      return Address.fromCardanoAddress({
        type: AddressType.BASE_ADDRESS,
        network: NetworkID.MAINNET,
        payment: {
          type: CredentialType.SCRIPT_CREDENTIAL,
          payload: Bytes.fromHex(scriptHash),
        },
        stake: ownerStakeAddress.cardanoAddress.stake,
      });
    }
    return Address.fromCardanoAddress({
      type: AddressType.ENTERPRISE_ADDRESS,
      network: NetworkID.MAINNET,
      payment: {
        type: CredentialType.SCRIPT_CREDENTIAL,
        payload: Bytes.fromHex(scriptHash),
      },
    });
  }
}
