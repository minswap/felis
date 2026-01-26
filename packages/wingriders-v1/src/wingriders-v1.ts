/**
 * WingRiders V1 contracts
 * References:
 * - Request datum: https://github.com/WingRiders/dex-serializer/blob/main/src/RequestDatumV1.ts
 * - Pool datum: https://github.com/WingRiders/dex-serializer/blob/main/src/LiquidityPoolDatumV1.ts
 */

import {
  ADA,
  Address,
  Asset,
  BaseUtxoModel,
  Bytes,
  type NetworkEnvironment,
  PlutusBytes,
  PlutusConstr,
  PlutusData,
  PlutusInt,
  type Utxo,
  Value,
} from "@minswap/felis-ledger-core";
import { type CborHex, Maybe, Result, sha3 } from "@minswap/felis-ledger-utils";
import invariant from "@minswap/tiny-invariant";
import { normalizePair } from "./utils";

export namespace WingridersV1 {
  export const ORDER_SCRIPT_HASH = "86ae9eebd8b97944a45201e4aec1330a72291af2d071644bba015959";
  export const POOL_SCRIPT_HASH = "e6c90a5923713af5786963dee0fdffd830ca7e0c86a041d9e5833e91";
  export const LP_POLICY_ID = "026a18d04a0c642759bb3d83b12e3344894e5c1c7b2aeb1a2113a570";
  export const FACTORY_POLICY_ID = "026a18d04a0c642759bb3d83b12e3344894e5c1c7b2aeb1a2113a570";
  export const FACTORY_ASSET_NAME = "46"; // "F" in hex
  export const VALIDITY_ASSET_NAME = "4c"; // "L" in hex

  export const MIN_POOL_ADA = 3_000_000n;
  export const MAX_LP_TOKENS = 9_223_372_036_854_775_807n;

  // ============================================================================
  // Swap Direction
  // ============================================================================

  export enum SwapDirection {
    A_TO_B = 0,
    B_TO_A = 1,
  }

  // ============================================================================
  // Order Datum Types
  // https://github.com/WingRiders/dex-serializer/blob/main/src/RequestDatumV1.ts
  // ============================================================================

  export enum OrderType {
    Swap = 0,
    Deposit = 1,
    Withdraw = 2,
  }

  export type OrderDatum = {
    beneficiary: Address;
    owner: Bytes; // Stake credential pubkey hash
    deadline: bigint;
    assetA: Asset;
    assetB: Asset;
  } & (
    | {
        type: OrderType.Swap;
        direction: SwapDirection;
        minWanted: bigint;
      }
    | {
        type: OrderType.Deposit;
        minLpWanted: bigint;
      }
    | {
        type: OrderType.Withdraw;
        minWantedA: bigint;
        minWantedB: bigint;
      }
  );

  export namespace OrderDatum {
    export function fromPlutusJson(data: PlutusData, networkEnv: NetworkEnvironment): OrderDatum {
      const dataConstr = PlutusConstr.unwrap(data, { [0]: 2 });
      const metadataConstr = PlutusConstr.unwrap(dataConstr.fields[0], { [0]: 4 });
      const assetsConstr = PlutusConstr.unwrap(metadataConstr.fields[3], { [0]: 2 });
      const actionConstr = PlutusConstr.unwrap(dataConstr.fields[1], {
        [OrderType.Swap]: 2,
        [OrderType.Deposit]: 1,
        [OrderType.Withdraw]: 2,
      });

      const commonData = {
        beneficiary: Address.fromPlutusJson(metadataConstr.fields[0], networkEnv),
        owner: Bytes.fromHex(PlutusBytes.unwrap(metadataConstr.fields[1])),
        deadline: PlutusInt.unwrapToBigInt(metadataConstr.fields[2]),
        assetA: Asset.fromPlutusJson(assetsConstr.fields[0]),
        assetB: Asset.fromPlutusJson(assetsConstr.fields[1]),
      };

      switch (actionConstr.constructor) {
        case OrderType.Swap: {
          // Direction is a constructor: 0 = A_TO_B (False), 1 = B_TO_A (True)
          const directionConstr = PlutusConstr.unwrap(actionConstr.fields[0], { [0]: 0, [1]: 0 });
          return {
            ...commonData,
            type: OrderType.Swap,
            direction: directionConstr.constructor === 0 ? SwapDirection.A_TO_B : SwapDirection.B_TO_A,
            minWanted: PlutusInt.unwrapToBigInt(actionConstr.fields[1]),
          };
        }
        case OrderType.Deposit: {
          return {
            ...commonData,
            type: OrderType.Deposit,
            minLpWanted: PlutusInt.unwrapToBigInt(actionConstr.fields[0]),
          };
        }
        case OrderType.Withdraw: {
          return {
            ...commonData,
            type: OrderType.Withdraw,
            minWantedA: PlutusInt.unwrapToBigInt(actionConstr.fields[0]),
            minWantedB: PlutusInt.unwrapToBigInt(actionConstr.fields[1]),
          };
        }
        default:
          throw new Error(`WingridersV1: Unsupported order type: ${actionConstr.constructor}`);
      }
    }

    export function toPlutusJson(data: OrderDatum): PlutusData {
      let actionData: PlutusData;
      switch (data.type) {
        case OrderType.Swap: {
          actionData = {
            constructor: OrderType.Swap,
            fields: [
              { constructor: data.direction === SwapDirection.A_TO_B ? 0 : 1, fields: [] },
              PlutusInt.wrap(data.minWanted),
            ],
          };
          break;
        }
        case OrderType.Deposit: {
          actionData = {
            constructor: OrderType.Deposit,
            fields: [PlutusInt.wrap(data.minLpWanted)],
          };
          break;
        }
        case OrderType.Withdraw: {
          actionData = {
            constructor: OrderType.Withdraw,
            fields: [PlutusInt.wrap(data.minWantedA), PlutusInt.wrap(data.minWantedB)],
          };
          break;
        }
      }

      return {
        constructor: 0,
        fields: [
          {
            constructor: 0,
            fields: [
              data.beneficiary.toPlutusJson(),
              PlutusBytes.wrap(data.owner),
              PlutusInt.wrap(data.deadline),
              {
                constructor: 0,
                fields: [data.assetA.toPlutusJson(), data.assetB.toPlutusJson()],
              },
            ],
          },
          actionData,
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

  export const DEFAULT_BATCHER_FEE = 2_000_000n;
  export const DEFAULT_DEPOSIT = 2_000_000n;

  export function getOrderInfo(options: { value: Value; datum: OrderDatum }): Maybe<OrderInfo> {
    const { value, datum } = options;

    if (datum.type !== OrderType.Swap) {
      return null;
    }

    const [assetIn, assetOut] = datum.direction === SwapDirection.A_TO_B ? [datum.assetA, datum.assetB] : [datum.assetB, datum.assetA];

    const batcherFee = DEFAULT_BATCHER_FEE;
    const deposit = DEFAULT_DEPOSIT;
    let amountIn = value.get(assetIn);
    if (assetIn.equals(ADA)) {
      amountIn -= batcherFee + deposit;
    }

    return {
      sender: datum.beneficiary,
      receiver: datum.beneficiary,
      assetIn,
      amountIn,
      assetOut,
      minimumReceive: datum.minWanted,
      batcherFee,
      deposit,
    };
  }

  // ============================================================================
  // PoolDatum
  // https://github.com/WingRiders/dex-serializer/blob/main/src/LiquidityPoolDatumV1.ts
  // ============================================================================

  export type PoolDatum = {
    requestScriptHash: Bytes;
    assetA: Asset;
    assetB: Asset;
    treasuryA: bigint;
    treasuryB: bigint;
    lastInteracted: bigint;
  };

  export namespace PoolDatum {
    export function fromPlutusJson(data: PlutusData): PoolDatum {
      const dataConstr = PlutusConstr.unwrap(data, { [0]: 2 });
      const poolConstr = PlutusConstr.unwrap(dataConstr.fields[1], { [0]: 4 });
      const assetsConstr = PlutusConstr.unwrap(poolConstr.fields[0], { [0]: 2 });

      return {
        requestScriptHash: Bytes.fromHex(PlutusBytes.unwrap(dataConstr.fields[0])),
        assetA: Asset.fromPlutusJson(assetsConstr.fields[0]),
        assetB: Asset.fromPlutusJson(assetsConstr.fields[1]),
        lastInteracted: PlutusInt.unwrapToBigInt(poolConstr.fields[1]),
        treasuryA: PlutusInt.unwrapToBigInt(poolConstr.fields[2]),
        treasuryB: PlutusInt.unwrapToBigInt(poolConstr.fields[3]),
      };
    }

    export function toPlutusJson(datum: PoolDatum): PlutusData {
      return {
        constructor: 0,
        fields: [
          PlutusBytes.wrap(datum.requestScriptHash),
          {
            constructor: 0,
            fields: [
              {
                constructor: 0,
                fields: [datum.assetA.toPlutusJson(), datum.assetB.toPlutusJson()],
              },
              PlutusInt.wrap(datum.lastInteracted),
              PlutusInt.wrap(datum.treasuryA),
              PlutusInt.wrap(datum.treasuryB),
            ],
          },
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
        requestScriptHash: datum.requestScriptHash.clone(),
        assetA: datum.assetA,
        assetB: datum.assetB,
        treasuryA: datum.treasuryA,
        treasuryB: datum.treasuryB,
        lastInteracted: datum.lastInteracted,
      };
    }
  }

  // ============================================================================
  // Pool Class
  // ============================================================================

  export type PoolConstructor = {
    utxo: Utxo;
    rawDatum: CborHex<PoolDatum>;
    networkEnv: NetworkEnvironment;
  };

  /**
   * Compute LP asset using sha3(sha3(assetA) + sha3(assetB))
   */
  export function computeLpAsset(assetA: Asset, assetB: Asset): Asset {
    const [a, b] = normalizePair([assetA, assetB]);
    const lpTokenNameHash = sha3(sha3(a.toBlockFrostString()) + sha3(b.toBlockFrostString()));
    return new Asset(Bytes.fromHex(LP_POLICY_ID), Bytes.fromHex(lpTokenNameHash));
  }

  export const FACTORY_ASSET = new Asset(Bytes.fromHex(FACTORY_POLICY_ID), Bytes.fromHex(FACTORY_ASSET_NAME));
  export const VALIDITY_ASSET = new Asset(Bytes.fromHex(FACTORY_POLICY_ID), Bytes.fromHex(VALIDITY_ASSET_NAME));

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

    get assetA(): Asset {
      return this.datum.assetA;
    }

    get assetB(): Asset {
      return this.datum.assetB;
    }

    get lpAsset(): Asset {
      return computeLpAsset(this.datum.assetA, this.datum.assetB);
    }

    /**
     * Reserve A, subtracting treasury and min pool ADA if asset A is ADA
     */
    get reserveA(): bigint {
      const rawReserve = this.value.get(this.assetA) - this.datum.treasuryA;
      if (this.assetA.equals(ADA)) {
        return rawReserve - MIN_POOL_ADA;
      }
      return rawReserve;
    }

    /**
     * Reserve B, subtracting treasury
     */
    get reserveB(): bigint {
      return this.value.get(this.assetB) - this.datum.treasuryB;
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

    static fromUtxo(utxo: Utxo, rawDatum: CborHex<PoolDatum>, networkEnv: NetworkEnvironment): Result<Pool, Error> {
      try {
        const { output } = utxo;
        const { value } = output;
        invariant(output.address.toScriptHash()?.hex === POOL_SCRIPT_HASH, `WingridersV1 Pool must have correct script hash`);
        invariant(Maybe.isJust(output.datumSource), `WingridersV1 Pool must have datum`);
        invariant(value.has(VALIDITY_ASSET), `WingridersV1 Pool must have validity token`);

        const pool = new Pool({
          utxo,
          rawDatum,
          networkEnv,
        });
        return Result.ok(pool);
      } catch (err) {
        let errorStr = "WingridersV1.Pool.fromUtxo error: ";
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
  // Order Redeemer
  // ============================================================================

  export enum OrderRedeemerType {
    Apply = 0,
    Reclaim = 1,
  }

  export namespace OrderRedeemer {
    export function cancel(): PlutusData {
      return {
        constructor: OrderRedeemerType.Reclaim,
        fields: [],
      };
    }
  }
}
