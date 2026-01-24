/**
 * WingRiders V2 contracts
 * References:
 * - Request datum: https://github.com/WingRiders/dex-serializer/blob/main/src/RequestDatumV2.ts
 * - Pool datum: https://github.com/WingRiders/dex-serializer/blob/main/src/LiquidityPoolDatumV2.ts
 */

import {
  ADA,
  Address,
  Asset,
  BaseUtxoModel,
  Bytes,
  type NetworkEnvironment,
  PlutusBool,
  PlutusBytes,
  PlutusConstr,
  PlutusData,
  PlutusInt,
  type Utxo,
  Value,
} from "@repo/ledger-core";
import { type CborHex, Maybe, Result } from "@repo/ledger-utils";
import { blake2b } from "blakejs";
import invariant from "@minswap/tiny-invariant";

export namespace WingridersV2 {
  export const ORDER_SCRIPT_HASH = "c134d839a64a5dfb9b155869ef3f34280751a622f69958baa8ffd29c";
  export const POOL_SCRIPT_HASH = "af97793b8702f381976cec83e303e9ce17781458c73c4bb16fe02b83";
  export const LP_POLICY_ID = "6fdc63a1d71dc2c65502b79baae7fb543185702b12c3c5fb639ed737";
  export const FACTORY_POLICY_ID = "6fdc63a1d71dc2c65502b79baae7fb543185702b12c3c5fb639ed737";
  export const FACTORY_ASSET_NAME = "46"; // "F" in hex
  export const VALIDITY_ASSET_NAME = "4c"; // "L" in hex

  export const MIN_POOL_ADA = 3_000_000n;
  export const MAX_LP_TOKENS = 9_223_372_036_854_775_807n;
  export const DEFAULT_A_SCALE = 1n;
  export const DEFAULT_B_SCALE = 1n;

  // ============================================================================
  // Swap Direction
  // ============================================================================

  export enum SwapDirection {
    A_TO_B = 0,
    B_TO_A = 1,
  }

  // ============================================================================
  // Order Datum Types
  // https://github.com/WingRiders/dex-serializer/blob/main/src/RequestDatumV2.ts
  // ============================================================================

  export enum OrderType {
    Swap = 0,
    Deposit = 1,
    Withdraw = 2,
    ExtractTreasury = 3,
    AddStakingReward = 4,
    ExtractProjectTreasury = 5,
    ExtractReserveTreasury = 6,
  }

  export enum DatumType {
    No = 0,
    Hash = 1,
    Inline = 2,
  }

  export type OrderDatum = {
    oil: bigint;
    beneficiary: Address;
    ownerAddress: Address;
    compensationDatum: PlutusData;
    datumType: DatumType;
    deadline: bigint;
    assetA: Asset;
    assetB: Asset;
    aScale: bigint;
    bScale: bigint;
  } & (
    | {
        type: OrderType.Swap;
        direction: SwapDirection;
        minWanted: bigint;
      }
    | {
        type: OrderType.Deposit;
        minWanted: bigint;
      }
    | {
        type: OrderType.Withdraw;
        minWantedA: bigint;
        minWantedB: bigint;
      }
    | {
        type: OrderType.ExtractTreasury | OrderType.AddStakingReward | OrderType.ExtractProjectTreasury | OrderType.ExtractReserveTreasury;
      }
  );

  export namespace OrderDatum {
    export function fromPlutusJson(data: PlutusData, networkEnv: NetworkEnvironment): OrderDatum {
      const dataConstr = PlutusConstr.unwrap(data, { [0]: 13 });
      const datumTypeConstr = PlutusConstr.unwrap(dataConstr.fields[4], { [0]: 0, [1]: 0, [2]: 0 });

      let datumType: DatumType;
      switch (datumTypeConstr.constructor) {
        case 0:
          datumType = DatumType.No;
          break;
        case 1:
          datumType = DatumType.Hash;
          break;
        case 2:
          datumType = DatumType.Inline;
          break;
        default:
          throw new Error("WingridersV2: Unexpected order datum type.");
      }

      const commonData = {
        oil: PlutusInt.unwrapToBigInt(dataConstr.fields[0]),
        beneficiary: Address.fromPlutusJson(dataConstr.fields[1], networkEnv),
        ownerAddress: Address.fromPlutusJson(dataConstr.fields[2], networkEnv),
        compensationDatum: dataConstr.fields[3],
        datumType: datumType,
        deadline: PlutusInt.unwrapToBigInt(dataConstr.fields[5]),
        assetA: new Asset(
          Bytes.fromHex(PlutusBytes.unwrap(dataConstr.fields[6])),
          Bytes.fromHex(PlutusBytes.unwrap(dataConstr.fields[7])),
        ),
        assetB: new Asset(
          Bytes.fromHex(PlutusBytes.unwrap(dataConstr.fields[8])),
          Bytes.fromHex(PlutusBytes.unwrap(dataConstr.fields[9])),
        ),
        aScale: PlutusInt.unwrapToBigInt(dataConstr.fields[11]),
        bScale: PlutusInt.unwrapToBigInt(dataConstr.fields[12]),
      };

      const actionConstr = PlutusConstr.unwrap(dataConstr.fields[10], {
        [OrderType.Swap]: 2,
        [OrderType.Deposit]: 1,
        [OrderType.Withdraw]: 2,
        [OrderType.ExtractTreasury]: 0,
        [OrderType.AddStakingReward]: 0,
        [OrderType.ExtractProjectTreasury]: 0,
        [OrderType.ExtractReserveTreasury]: 0,
      });

      switch (actionConstr.constructor) {
        case OrderType.Swap: {
          // Direction is a Bool in V2: False = A_TO_B, True = B_TO_A
          const direction: boolean = PlutusBool.unwrap(actionConstr.fields[0]);
          return {
            ...commonData,
            type: OrderType.Swap,
            direction: !direction ? SwapDirection.A_TO_B : SwapDirection.B_TO_A,
            minWanted: PlutusInt.unwrapToBigInt(actionConstr.fields[1]),
          };
        }
        case OrderType.Deposit: {
          return {
            ...commonData,
            type: OrderType.Deposit,
            minWanted: PlutusInt.unwrapToBigInt(actionConstr.fields[0]),
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
        case OrderType.ExtractTreasury:
        case OrderType.AddStakingReward:
        case OrderType.ExtractProjectTreasury:
        case OrderType.ExtractReserveTreasury: {
          return {
            ...commonData,
            type: actionConstr.constructor as
              | OrderType.ExtractTreasury
              | OrderType.AddStakingReward
              | OrderType.ExtractProjectTreasury
              | OrderType.ExtractReserveTreasury,
          };
        }
        default:
          throw new Error("WingridersV2: Unexpected order datum.");
      }
    }

    export function toPlutusJson(data: OrderDatum): PlutusData {
      let actionPlutusData: PlutusData;
      switch (data.type) {
        case OrderType.Swap: {
          actionPlutusData = {
            constructor: OrderType.Swap,
            fields: [PlutusBool.wrap(data.direction === SwapDirection.B_TO_A), PlutusInt.wrap(data.minWanted)],
          };
          break;
        }
        case OrderType.Deposit: {
          actionPlutusData = {
            constructor: OrderType.Deposit,
            fields: [PlutusInt.wrap(data.minWanted)],
          };
          break;
        }
        case OrderType.Withdraw: {
          actionPlutusData = {
            constructor: OrderType.Withdraw,
            fields: [PlutusInt.wrap(data.minWantedA), PlutusInt.wrap(data.minWantedB)],
          };
          break;
        }
        default: {
          actionPlutusData = {
            constructor: data.type,
            fields: [],
          };
        }
      }

      return {
        constructor: 0,
        fields: [
          PlutusInt.wrap(data.oil),
          data.beneficiary.toPlutusJson(),
          data.ownerAddress.toPlutusJson(),
          data.compensationDatum,
          { constructor: data.datumType, fields: [] },
          PlutusInt.wrap(data.deadline),
          PlutusBytes.wrap(data.assetA.currencySymbol),
          PlutusBytes.wrap(data.assetA.tokenName),
          PlutusBytes.wrap(data.assetB.currencySymbol),
          PlutusBytes.wrap(data.assetB.tokenName),
          actionPlutusData,
          PlutusInt.wrap(data.aScale),
          PlutusInt.wrap(data.bScale),
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

    const [assetIn, assetOut] =
      datum.direction === SwapDirection.A_TO_B ? [datum.assetA, datum.assetB] : [datum.assetB, datum.assetA];

    const batcherFee = DEFAULT_BATCHER_FEE;
    const deposit = datum.oil;
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
  // https://github.com/WingRiders/dex-serializer/blob/main/src/LiquidityPoolDatumV2.ts
  // ============================================================================

  export type PoolDatum = {
    reqValidatorHash: Bytes;
    assetA: Asset;
    assetB: Asset;
    swapFeeInBasis: bigint;
    protocolFeeInBasis: bigint;
    projectFeeInBasis: bigint;
    reserveFeeInBasis: bigint;
    feeBasis: bigint;
    agentFeeAda: bigint;
    lastInteraction: bigint;
    treasuryA: bigint;
    treasuryB: bigint;
    projectTreasuryA: bigint;
    projectTreasuryB: bigint;
    reserveTreasuryA: bigint;
    reserveTreasuryB: bigint;
  };

  export namespace PoolDatum {
    export function fromPlutusJson(data: PlutusData): PoolDatum {
      const { fields } = PlutusConstr.unwrap(data, { [0]: 18 });
      const assetA = new Asset(Bytes.fromHex(PlutusBytes.unwrap(fields[1])), Bytes.fromHex(PlutusBytes.unwrap(fields[2])));
      const assetB = new Asset(Bytes.fromHex(PlutusBytes.unwrap(fields[3])), Bytes.fromHex(PlutusBytes.unwrap(fields[4])));

      return {
        reqValidatorHash: Bytes.fromHex(PlutusBytes.unwrap(fields[0])),
        assetA,
        assetB,
        swapFeeInBasis: PlutusInt.unwrapToBigInt(fields[5]),
        protocolFeeInBasis: PlutusInt.unwrapToBigInt(fields[6]),
        projectFeeInBasis: PlutusInt.unwrapToBigInt(fields[7]),
        reserveFeeInBasis: PlutusInt.unwrapToBigInt(fields[8]),
        feeBasis: PlutusInt.unwrapToBigInt(fields[9]),
        agentFeeAda: PlutusInt.unwrapToBigInt(fields[10]),
        lastInteraction: PlutusInt.unwrapToBigInt(fields[11]),
        treasuryA: PlutusInt.unwrapToBigInt(fields[12]),
        treasuryB: PlutusInt.unwrapToBigInt(fields[13]),
        projectTreasuryA: PlutusInt.unwrapToBigInt(fields[14]),
        projectTreasuryB: PlutusInt.unwrapToBigInt(fields[15]),
        reserveTreasuryA: PlutusInt.unwrapToBigInt(fields[16]),
        reserveTreasuryB: PlutusInt.unwrapToBigInt(fields[17]),
      };
    }

    export function toPlutusJson(datum: PoolDatum): PlutusData {
      return {
        constructor: 0,
        fields: [
          PlutusBytes.wrap(datum.reqValidatorHash),
          PlutusBytes.wrap(datum.assetA.currencySymbol),
          PlutusBytes.wrap(datum.assetA.tokenName),
          PlutusBytes.wrap(datum.assetB.currencySymbol),
          PlutusBytes.wrap(datum.assetB.tokenName),
          PlutusInt.wrap(datum.swapFeeInBasis),
          PlutusInt.wrap(datum.protocolFeeInBasis),
          PlutusInt.wrap(datum.projectFeeInBasis),
          PlutusInt.wrap(datum.reserveFeeInBasis),
          PlutusInt.wrap(datum.feeBasis),
          PlutusInt.wrap(datum.agentFeeAda),
          PlutusInt.wrap(datum.lastInteraction),
          PlutusInt.wrap(datum.treasuryA),
          PlutusInt.wrap(datum.treasuryB),
          PlutusInt.wrap(datum.projectTreasuryA),
          PlutusInt.wrap(datum.projectTreasuryB),
          PlutusInt.wrap(datum.reserveTreasuryA),
          PlutusInt.wrap(datum.reserveTreasuryB),
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
        reqValidatorHash: datum.reqValidatorHash.clone(),
        assetA: datum.assetA,
        assetB: datum.assetB,
        swapFeeInBasis: datum.swapFeeInBasis,
        protocolFeeInBasis: datum.protocolFeeInBasis,
        projectFeeInBasis: datum.projectFeeInBasis,
        reserveFeeInBasis: datum.reserveFeeInBasis,
        feeBasis: datum.feeBasis,
        agentFeeAda: datum.agentFeeAda,
        lastInteraction: datum.lastInteraction,
        treasuryA: datum.treasuryA,
        treasuryB: datum.treasuryB,
        projectTreasuryA: datum.projectTreasuryA,
        projectTreasuryB: datum.projectTreasuryB,
        reserveTreasuryA: datum.reserveTreasuryA,
        reserveTreasuryB: datum.reserveTreasuryB,
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
   * Compute LP asset using blake2b hash
   * poolTypeId: 0, aScale: 1, bScale: 1
   * tokenNameHash = blake2b(blake2b("0") + blake2b("1") + blake2b("1") + blake2b(assetA) + blake2b(assetB))
   * lpAsset = lpPolicyId + blake2b(tokenNameHash)
   */
  export function computeLpAsset(assetA: Asset, assetB: Asset): Asset {
    const tokenNameHash = new Bytes(blake2b(Bytes.fromString("0").bytes, undefined, 32))
      .concat(new Bytes(blake2b(Bytes.fromString("1").bytes, undefined, 32)))
      .concat(new Bytes(blake2b(Bytes.fromString("1").bytes, undefined, 32)))
      .concat(new Bytes(blake2b(assetA.currencySymbol.concat(assetA.tokenName).bytes, undefined, 32)))
      .concat(new Bytes(blake2b(assetB.currencySymbol.concat(assetB.tokenName).bytes, undefined, 32))).bytes;
    return new Asset(Bytes.fromHex(LP_POLICY_ID), new Bytes(blake2b(tokenNameHash, undefined, 32)));
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
     * Reserve A, subtracting all treasuries and min pool ADA if asset A is ADA
     */
    get reserveA(): bigint {
      const rawReserve =
        this.value.get(this.assetA) - this.datum.treasuryA - this.datum.projectTreasuryA - this.datum.reserveTreasuryA;
      if (this.assetA.equals(ADA)) {
        return rawReserve - MIN_POOL_ADA;
      }
      return rawReserve;
    }

    /**
     * Reserve B, subtracting all treasuries
     */
    get reserveB(): bigint {
      return this.value.get(this.assetB) - this.datum.treasuryB - this.datum.projectTreasuryB - this.datum.reserveTreasuryB;
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
     * Total trading fee in basis points
     */
    get totalFeeInBasis(): bigint {
      return (
        this.datum.swapFeeInBasis + this.datum.protocolFeeInBasis + this.datum.projectFeeInBasis + this.datum.reserveFeeInBasis
      );
    }

    static fromUtxo(utxo: Utxo, rawDatum: CborHex<PoolDatum>, networkEnv: NetworkEnvironment): Result<Pool, Error> {
      try {
        const { output } = utxo;
        const { value } = output;
        invariant(output.address.toScriptHash()?.hex === POOL_SCRIPT_HASH, `WingridersV2 Pool must have correct script hash`);
        invariant(Maybe.isJust(output.datumSource), `WingridersV2 Pool must have datum`);
        invariant(value.has(VALIDITY_ASSET), `WingridersV2 Pool must have validity token`);

        const pool = new Pool({
          utxo,
          rawDatum,
          networkEnv,
        });
        return Result.ok(pool);
      } catch (err) {
        let errorStr = "WingridersV2.Pool.fromUtxo error: ";
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
