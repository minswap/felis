/**
 * SundaeSwap V3 contracts
 * References:
 * - Order contract: https://github.com/SundaeSwap-finance/sundae-contracts/blob/main/lib/types/order.ak
 * - Pool contract: https://github.com/SundaeSwap-finance/sundae-contracts/blob/main/lib/types/pool.ak
 * - SDK types: https://github.com/SundaeSwap-finance/sundae-sdk/blob/ff4a360b62a30ce3af9e16fd32def02ac0bd3213/packages/core/src/DatumBuilders/ContractTypes/Contract.v3.ts
 */

import {
  ADA,
  Address,
  Asset,
  BaseUtxoModel,
  Bytes,
  DatumSourceType,
  type NetworkEnvironment,
  PlutusBytes,
  PlutusConstr,
  PlutusData,
  PlutusInt,
  PlutusList,
  PlutusMaybe,
  type Utxo,
  Value,
} from "@repo/ledger-core";
import { type CborHex, Maybe, Result } from "@repo/ledger-utils";
import invariant from "@minswap/tiny-invariant";

export namespace SundaeSwapV3 {
  export const ORDER_SCRIPT_HASH = "fa6a58bbe2d0ff05534431c8e2f0ef2cbdc1602a8456e4b13c8f3077";
  export const POOL_SCRIPT_HASH = "e0302560ced2fdcbfcb2602697df970cd0d6a38f94b32703f51c312b";
  export const NFT_POLICY_ID = "e0302560ced2fdcbfcb2602697df970cd0d6a38f94b32703f51c312b";

  // ============================================================================
  // MultisigScript Types
  // https://github.com/SundaeSwap-finance/aicone/blob/main/lib/sundae/multisig.ak
  // ============================================================================

  export enum MultisigScriptType {
    Signature = 0,
    AllOf = 1,
    AnyOf = 2,
    AtLeast = 3,
    Before = 4,
    After = 5,
    Script = 6,
  }

  export type MultisigScript =
    | {
        type: MultisigScriptType.Signature;
        keyHash: Bytes;
      }
    | {
        type: MultisigScriptType.AllOf;
        scripts: MultisigScript[];
      }
    | {
        type: MultisigScriptType.AnyOf;
        scripts: MultisigScript[];
      }
    | {
        type: MultisigScriptType.AtLeast;
        required: bigint;
        scripts: MultisigScript[];
      }
    | {
        type: MultisigScriptType.Before;
        time: bigint;
      }
    | {
        type: MultisigScriptType.After;
        time: bigint;
      }
    | {
        type: MultisigScriptType.Script;
        scriptHash: Bytes;
      };

  export namespace MultisigScript {
    export function fromPlutusJson(data: PlutusData): MultisigScript {
      const { constructor: constr, fields } = PlutusConstr.unwrap(data, {
        [MultisigScriptType.Signature]: 1,
        [MultisigScriptType.AllOf]: 1,
        [MultisigScriptType.AnyOf]: 1,
        [MultisigScriptType.AtLeast]: 2,
        [MultisigScriptType.Before]: 1,
        [MultisigScriptType.After]: 1,
        [MultisigScriptType.Script]: 1,
      });

      switch (constr) {
        case MultisigScriptType.Signature: {
          return {
            type: MultisigScriptType.Signature,
            keyHash: Bytes.fromHex(PlutusBytes.unwrap(fields[0])),
          };
        }
        case MultisigScriptType.AllOf: {
          const scriptsList = PlutusList.unwrap(fields[0]);
          return {
            type: MultisigScriptType.AllOf,
            scripts: scriptsList.map((s) => fromPlutusJson(s)),
          };
        }
        case MultisigScriptType.AnyOf: {
          const scriptsList = PlutusList.unwrap(fields[0]);
          return {
            type: MultisigScriptType.AnyOf,
            scripts: scriptsList.map((s) => fromPlutusJson(s)),
          };
        }
        case MultisigScriptType.AtLeast: {
          const scriptsList = PlutusList.unwrap(fields[1]);
          return {
            type: MultisigScriptType.AtLeast,
            required: PlutusInt.unwrapToBigInt(fields[0]),
            scripts: scriptsList.map((s) => fromPlutusJson(s)),
          };
        }
        case MultisigScriptType.Before: {
          return {
            type: MultisigScriptType.Before,
            time: PlutusInt.unwrapToBigInt(fields[0]),
          };
        }
        case MultisigScriptType.After: {
          return {
            type: MultisigScriptType.After,
            time: PlutusInt.unwrapToBigInt(fields[0]),
          };
        }
        case MultisigScriptType.Script: {
          return {
            type: MultisigScriptType.Script,
            scriptHash: Bytes.fromHex(PlutusBytes.unwrap(fields[0])),
          };
        }
        default:
          throw new Error(`SundaeSwapV3: Unknown MultisigScript type: ${constr}`);
      }
    }

    export function toPlutusJson(data: MultisigScript): PlutusData {
      switch (data.type) {
        case MultisigScriptType.Signature: {
          return {
            constructor: MultisigScriptType.Signature,
            fields: [PlutusBytes.wrap(data.keyHash)],
          };
        }
        case MultisigScriptType.AllOf: {
          return {
            constructor: MultisigScriptType.AllOf,
            fields: [{ list: data.scripts.map((s) => toPlutusJson(s)) }],
          };
        }
        case MultisigScriptType.AnyOf: {
          return {
            constructor: MultisigScriptType.AnyOf,
            fields: [{ list: data.scripts.map((s) => toPlutusJson(s)) }],
          };
        }
        case MultisigScriptType.AtLeast: {
          return {
            constructor: MultisigScriptType.AtLeast,
            fields: [PlutusInt.wrap(data.required), { list: data.scripts.map((s) => toPlutusJson(s)) }],
          };
        }
        case MultisigScriptType.Before: {
          return {
            constructor: MultisigScriptType.Before,
            fields: [PlutusInt.wrap(data.time)],
          };
        }
        case MultisigScriptType.After: {
          return {
            constructor: MultisigScriptType.After,
            fields: [PlutusInt.wrap(data.time)],
          };
        }
        case MultisigScriptType.Script: {
          return {
            constructor: MultisigScriptType.Script,
            fields: [PlutusBytes.wrap(data.scriptHash)],
          };
        }
      }
    }

    export function fromAddress(address: Address): MultisigScript {
      const pubKeyHash = address.toPubKeyHash();
      invariant(pubKeyHash, "SundaeSwapV3: address must be a pubkey address");
      const stakeAddress = address.toStakeAddress();
      const rewardKeyHash = stakeAddress?.toPubKeyHash();
      return {
        type: MultisigScriptType.Signature,
        keyHash: rewardKeyHash ? rewardKeyHash.keyHash : pubKeyHash.keyHash,
      };
    }
  }

  // ============================================================================
  // Destination Types
  // ============================================================================

  export enum DestinationType {
    Fixed = 0,
    Self = 1,
  }

  export enum DatumType {
    NoDatum = 0,
    DatumHash = 1,
    InlineDatum = 2,
  }

  export type Datum =
    | { type: DatumType.NoDatum }
    | { type: DatumType.DatumHash; hash: Bytes }
    | { type: DatumType.InlineDatum; datum: Bytes };

  export type Destination =
    | {
        type: DestinationType.Fixed;
        address: Address;
        datum: Datum;
      }
    | { type: DestinationType.Self };

  export namespace Datum {
    export function fromPlutusJson(data: PlutusData): Datum {
      const { constructor: constr, fields } = PlutusConstr.unwrap(data, {
        [DatumType.NoDatum]: 0,
        [DatumType.DatumHash]: 1,
        [DatumType.InlineDatum]: 1,
      });

      switch (constr) {
        case DatumType.NoDatum:
          return { type: DatumType.NoDatum };
        case DatumType.DatumHash:
          return { type: DatumType.DatumHash, hash: Bytes.fromHex(PlutusBytes.unwrap(fields[0])) };
        case DatumType.InlineDatum:
          return { type: DatumType.InlineDatum, datum: Bytes.fromHex(PlutusData.toDataHex(fields[0])) };
        default:
          throw new Error(`SundaeSwapV3: Unknown Datum type: ${constr}`);
      }
    }

    export function toPlutusJson(data: Datum): PlutusData {
      switch (data.type) {
        case DatumType.NoDatum:
          return { constructor: DatumType.NoDatum, fields: [] };
        case DatumType.DatumHash:
          return { constructor: DatumType.DatumHash, fields: [PlutusBytes.wrap(data.hash)] };
        case DatumType.InlineDatum:
          return { constructor: DatumType.InlineDatum, fields: [PlutusData.fromDataHex(data.datum.hex)] };
      }
    }
  }

  export namespace Destination {
    export function fromPlutusJson(data: PlutusData, networkEnv: NetworkEnvironment): Destination {
      const { constructor: constr, fields } = PlutusConstr.unwrap(data, {
        [DestinationType.Fixed]: 2,
        [DestinationType.Self]: 0,
      });

      switch (constr) {
        case DestinationType.Fixed:
          return {
            type: DestinationType.Fixed,
            address: Address.fromPlutusJson(fields[0], networkEnv),
            datum: Datum.fromPlutusJson(fields[1]),
          };
        case DestinationType.Self:
          return { type: DestinationType.Self };
        default:
          throw new Error(`SundaeSwapV3: Unknown Destination type: ${constr}`);
      }
    }

    export function toPlutusJson(data: Destination): PlutusData {
      switch (data.type) {
        case DestinationType.Fixed:
          return {
            constructor: DestinationType.Fixed,
            fields: [data.address.toPlutusJson(), Datum.toPlutusJson(data.datum)],
          };
        case DestinationType.Self:
          return { constructor: DestinationType.Self, fields: [] };
      }
    }
  }

  // ============================================================================
  // SingletonValue - represents (policy_id, asset_name, amount)
  // ============================================================================

  export type SingletonValue = {
    asset: Asset;
    amount: bigint;
  };

  export namespace SingletonValue {
    export function fromPlutusJson(data: PlutusData): SingletonValue {
      const list = PlutusList.unwrap(data);
      invariant(list.length === 3, "SundaeSwapV3: SingletonValue must have 3 elements");
      return {
        asset: new Asset(Bytes.fromHex(PlutusBytes.unwrap(list[0])), Bytes.fromHex(PlutusBytes.unwrap(list[1]))),
        amount: PlutusInt.unwrapToBigInt(list[2]),
      };
    }

    export function toPlutusJson(data: SingletonValue): PlutusData {
      return {
        list: [PlutusBytes.wrap(data.asset.currencySymbol), PlutusBytes.wrap(data.asset.tokenName), PlutusInt.wrap(data.amount)],
      };
    }
  }

  // ============================================================================
  // Order Details Types
  // ============================================================================

  export enum OrderDetailsType {
    Strategy = 0,
    Swap = 1,
    Deposit = 2,
    Withdrawal = 3,
    Donation = 4,
    Record = 5,
  }

  export type OrderDetails =
    | {
        type: OrderDetailsType.Swap;
        offer: SingletonValue;
        minReceive: SingletonValue;
      }
    | {
        type: OrderDetailsType.Deposit;
        assets: [SingletonValue, SingletonValue];
      }
    | {
        type: OrderDetailsType.Withdrawal;
        lpAsset: SingletonValue;
      };

  export namespace OrderDetails {
    export function fromPlutusJson(data: PlutusData): OrderDetails {
      const { constructor: constr, fields } = PlutusConstr.unwrap(data, {
        [OrderDetailsType.Swap]: 2,
        [OrderDetailsType.Deposit]: 1,
        [OrderDetailsType.Withdrawal]: 1,
      });

      switch (constr) {
        case OrderDetailsType.Swap: {
          return {
            type: OrderDetailsType.Swap,
            offer: SingletonValue.fromPlutusJson(fields[0]),
            minReceive: SingletonValue.fromPlutusJson(fields[1]),
          };
        }
        case OrderDetailsType.Deposit: {
          const assetsList = PlutusList.unwrap(fields[0]);
          invariant(assetsList.length === 2, "SundaeSwapV3: Deposit must have 2 assets");
          return {
            type: OrderDetailsType.Deposit,
            assets: [SingletonValue.fromPlutusJson(assetsList[0]), SingletonValue.fromPlutusJson(assetsList[1])],
          };
        }
        case OrderDetailsType.Withdrawal: {
          return {
            type: OrderDetailsType.Withdrawal,
            lpAsset: SingletonValue.fromPlutusJson(fields[0]),
          };
        }
        default:
          throw new Error(`SundaeSwapV3: Unsupported OrderDetails type: ${constr}`);
      }
    }

    export function toPlutusJson(data: OrderDetails): PlutusData {
      switch (data.type) {
        case OrderDetailsType.Swap: {
          return {
            constructor: OrderDetailsType.Swap,
            fields: [SingletonValue.toPlutusJson(data.offer), SingletonValue.toPlutusJson(data.minReceive)],
          };
        }
        case OrderDetailsType.Deposit: {
          return {
            constructor: OrderDetailsType.Deposit,
            fields: [{ list: [SingletonValue.toPlutusJson(data.assets[0]), SingletonValue.toPlutusJson(data.assets[1])] }],
          };
        }
        case OrderDetailsType.Withdrawal: {
          return {
            constructor: OrderDetailsType.Withdrawal,
            fields: [SingletonValue.toPlutusJson(data.lpAsset)],
          };
        }
      }
    }
  }

  // ============================================================================
  // OrderDatum
  // https://github.com/SundaeSwap-finance/sundae-contracts/blob/main/lib/types/order.ak#L9
  // ============================================================================

  export type OrderDatum = {
    poolIdent: Maybe<Bytes>;
    owner: MultisigScript;
    maxProtocolFee: bigint;
    destination: Destination;
    details: OrderDetails;
    extension: Bytes; // PlutusData hex
  };

  export namespace OrderDatum {
    export function fromPlutusJson(data: PlutusData, networkEnv: NetworkEnvironment): OrderDatum {
      const { fields } = PlutusConstr.unwrap(data, { [0]: 6 });

      const poolIdentMaybe = PlutusMaybe.unwrap(fields[0]);
      const poolIdent = Maybe.map(poolIdentMaybe, (d) => Bytes.fromHex(PlutusBytes.unwrap(d)));

      return {
        poolIdent,
        owner: MultisigScript.fromPlutusJson(fields[1]),
        maxProtocolFee: PlutusInt.unwrapToBigInt(fields[2]),
        destination: Destination.fromPlutusJson(fields[3], networkEnv),
        details: OrderDetails.fromPlutusJson(fields[4]),
        extension: Bytes.fromHex(PlutusData.toDataHex(fields[5])),
      };
    }

    export function toPlutusJson(data: OrderDatum): PlutusData {
      return {
        constructor: 0,
        fields: [
          PlutusMaybe.wrap(Maybe.map(data.poolIdent, PlutusBytes.wrap)),
          MultisigScript.toPlutusJson(data.owner),
          PlutusInt.wrap(data.maxProtocolFee),
          Destination.toPlutusJson(data.destination),
          OrderDetails.toPlutusJson(data.details),
          PlutusData.fromDataHex(data.extension.hex),
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
    maxProtocolFee: bigint;
    deposit: bigint;
    sender: Address;
    receiver: Address;
  };

  export function getOrderInfo(options: { value: Value; datum: OrderDatum; networkEnv: NetworkEnvironment }): Maybe<OrderInfo> {
    const { value, datum } = options;

    if (datum.details.type !== OrderDetailsType.Swap) {
      return null;
    }

    const assetIn = datum.details.offer.asset;
    const amountIn = datum.details.offer.amount;
    const assetOut = datum.details.minReceive.asset;
    const minimumReceive = datum.details.minReceive.amount;
    const maxProtocolFee = datum.maxProtocolFee;

    let deposit = value.get(ADA) - maxProtocolFee;
    if (assetIn.equals(ADA)) {
      deposit -= amountIn;
    }

    let sender: Address;
    let receiver: Address;
    if (datum.destination.type === DestinationType.Fixed) {
      sender = datum.destination.address;
      receiver = datum.destination.address;
    } else {
      return null;
    }

    return {
      sender,
      receiver,
      assetIn,
      amountIn,
      assetOut,
      minimumReceive,
      maxProtocolFee,
      deposit,
    };
  }

  // ============================================================================
  // PoolDatum
  // https://github.com/SundaeSwap-finance/sundae-contracts/blob/main/lib/types/pool.ak#L6
  // ============================================================================

  export type PoolDatum = {
    ident: Bytes;
    assetA: Asset;
    assetB: Asset;
    circulatingLp: bigint;
    bidFeePer10Thousand: bigint;
    askFeePer10Thousand: bigint;
    feeManager: Maybe<MultisigScript>;
    marketOpen: bigint;
    protocolFees: bigint;
  };

  export namespace PoolDatum {
    export function fromPlutusJson(data: PlutusData): PoolDatum {
      const { fields } = PlutusConstr.unwrap(data, { [0]: 8 });

      const assetsList = PlutusList.unwrap(fields[1]);
      invariant(assetsList.length === 2, "SundaeSwapV3: Pool assets must have 2 elements");

      const assetAList = PlutusList.unwrap(assetsList[0]);
      const assetBList = PlutusList.unwrap(assetsList[1]);
      const assetA = new Asset(Bytes.fromHex(PlutusBytes.unwrap(assetAList[0])), Bytes.fromHex(PlutusBytes.unwrap(assetAList[1])));
      const assetB = new Asset(Bytes.fromHex(PlutusBytes.unwrap(assetBList[0])), Bytes.fromHex(PlutusBytes.unwrap(assetBList[1])));

      const feeManagerMaybe = PlutusMaybe.unwrap(fields[5]);
      const feeManager = Maybe.map(feeManagerMaybe, MultisigScript.fromPlutusJson);

      return {
        ident: Bytes.fromHex(PlutusBytes.unwrap(fields[0])),
        assetA,
        assetB,
        circulatingLp: PlutusInt.unwrapToBigInt(fields[2]),
        bidFeePer10Thousand: PlutusInt.unwrapToBigInt(fields[3]),
        askFeePer10Thousand: PlutusInt.unwrapToBigInt(fields[4]),
        feeManager,
        marketOpen: PlutusInt.unwrapToBigInt(fields[6]),
        protocolFees: PlutusInt.unwrapToBigInt(fields[7]),
      };
    }

    export function toPlutusJson(datum: PoolDatum): PlutusData {
      return {
        constructor: 0,
        fields: [
          PlutusBytes.wrap(datum.ident),
          {
            list: [
              { list: [PlutusBytes.wrap(datum.assetA.currencySymbol), PlutusBytes.wrap(datum.assetA.tokenName)] },
              { list: [PlutusBytes.wrap(datum.assetB.currencySymbol), PlutusBytes.wrap(datum.assetB.tokenName)] },
            ],
          },
          PlutusInt.wrap(datum.circulatingLp),
          PlutusInt.wrap(datum.bidFeePer10Thousand),
          PlutusInt.wrap(datum.askFeePer10Thousand),
          PlutusMaybe.wrap(Maybe.map(datum.feeManager, MultisigScript.toPlutusJson)),
          PlutusInt.wrap(datum.marketOpen),
          PlutusInt.wrap(datum.protocolFees),
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
        ident: datum.ident.clone(),
        assetA: datum.assetA,
        assetB: datum.assetB,
        circulatingLp: datum.circulatingLp,
        bidFeePer10Thousand: datum.bidFeePer10Thousand,
        askFeePer10Thousand: datum.askFeePer10Thousand,
        feeManager: datum.feeManager,
        marketOpen: datum.marketOpen,
        protocolFees: datum.protocolFees,
      };
    }
  }

  // ============================================================================
  // Pool Class
  // ============================================================================

  export const FEE_DENOMINATOR = 10_000n;

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

    get ident(): Bytes {
      return this.datum.ident;
    }

    get assetA(): Asset {
      return this.datum.assetA;
    }

    get assetB(): Asset {
      return this.datum.assetB;
    }

    /**
     * Reserve A, subtracting protocol fees if asset A is ADA
     */
    get reserveA(): bigint {
      const rawReserve = this.value.get(this.assetA);
      if (this.assetA.equals(ADA)) {
        return rawReserve - this.datum.protocolFees;
      }
      return rawReserve;
    }

    /**
     * Reserve B, subtracting protocol fees if asset B is ADA
     */
    get reserveB(): bigint {
      const rawReserve = this.value.get(this.assetB);
      if (this.assetB.equals(ADA)) {
        return rawReserve - this.datum.protocolFees;
      }
      return rawReserve;
    }

    get liquidity(): bigint {
      return this.datum.circulatingLp;
    }

    get pair(): [Asset, Asset] {
      return [this.assetA, this.assetB];
    }

    /**
     * CIP-68 (222) NFT token - pool factory token
     */
    get factoryAsset(): Asset {
      return new Asset(Bytes.fromHex(NFT_POLICY_ID), Bytes.fromHex(`000de140`).concat(this.datum.ident));
    }

    /**
     * CIP-68 (333) token - LP token
     */
    get lpAsset(): Asset {
      return new Asset(Bytes.fromHex(NFT_POLICY_ID), Bytes.fromHex(`0014df10`).concat(this.datum.ident));
    }

    /**
     * Fee for A -> B swaps (bid)
     */
    get bidFeeNumerator(): bigint {
      return this.datum.bidFeePer10Thousand;
    }

    /**
     * Fee for B -> A swaps (ask)
     */
    get askFeeNumerator(): bigint {
      return this.datum.askFeePer10Thousand;
    }

    static getLpAssetByIdent(ident: Bytes): Asset {
      return new Asset(Bytes.fromHex(NFT_POLICY_ID), Bytes.fromHex(`0014df10`).concat(ident));
    }

    static fromUtxo(utxo: Utxo, rawDatum: CborHex<PoolDatum>, networkEnv: NetworkEnvironment): Result<Pool, Error> {
      try {
        const { output } = utxo;
        const { value } = output;
        invariant(output.address.toScriptHash()?.hex === POOL_SCRIPT_HASH, `SundaeSwapV3 Pool must have correct script hash`);
        invariant(output.datumSource && output.datumSource.type === DatumSourceType.INLINE_DATUM, `SundaeSwapV3 Pool must have inline datum`);

        const datum = PoolDatum.fromCborHex(rawDatum);
        const factoryAsset = new Asset(Bytes.fromHex(NFT_POLICY_ID), Bytes.fromHex(`000de140`).concat(datum.ident));
        invariant(value.has(factoryAsset), `SundaeSwapV3 Pool must have factory NFT: ${factoryAsset.toString()}`);

        const pool = new Pool({
          utxo,
          rawDatum,
          networkEnv,
        });
        return Result.ok(pool);
      } catch (err) {
        let errorStr = "SundaeSwapV3.Pool.fromUtxo error: ";
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
    Scoop = 0,
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
}
