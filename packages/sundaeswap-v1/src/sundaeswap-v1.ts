/**
 * SundaeSwap V1 is closed-source
 * They have open-source SDK:
 * https://github.com/SundaeSwap-finance/sundae-sdk/blob/ff4a360b62a30ce3af9e16fd32def02ac0bd3213/packages/core/src/DatumBuilders/ContractTypes/Contract.v1.ts#L82
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
  type Value,
} from "@minswap/felis-ledger-core";
import { type CborHex, Maybe, Result } from "@minswap/felis-ledger-utils";
import invariant from "@minswap/tiny-invariant";

export namespace SundaeSwapV1 {
  export const ORDER_ADDRESS = "addr1wxaptpmxcxawvr3pzlhgnpmzz3ql43n2tc8mn3av5kx0yzs09tqh8";
  export const POOL_SCRIPT_HASH = "4020e7fc2de75a0729c3cc3af715b34d98381e0cdbcfa99c950bc3ac";
  export const AUTHEN_POLICY_ID = "0029cb7c88c7567b63d1a512c0ed626aa169688ec980730c0473b913";

  export type OrderAddressesSchema = {
    destination: {
      address: Address;
      datum: Maybe<Bytes>;
    };
    alternate: Maybe<Bytes>;
  };

  export enum SwapDirection {
    A_TO_B = 0,
    B_TO_A = 1,
  }

  export type SwapDirectionSchema = {
    direction: SwapDirection; // origin: suppliedAssetIndex
    amount: bigint;
    minReceivable: Maybe<bigint>;
  };

  export type OrderDatum = {
    poolIdent: Bytes;
    orderAddresses: OrderAddressesSchema;
    scooperFee: bigint;
    swapDirection: SwapDirectionSchema;
  };

  export namespace OrderAddressesSchema {
    export function fromPlutusJson(data: PlutusData, networkEnv: NetworkEnvironment): OrderAddressesSchema {
      const { fields } = PlutusConstr.unwrap(data, { [0]: 2 });
      const destinationConstr = PlutusConstr.unwrap(fields[0], { [0]: 2 });
      return {
        destination: {
          address: Address.fromPlutusJson(destinationConstr.fields[0], networkEnv),
          datum: Maybe.map(PlutusMaybe.unwrap(destinationConstr.fields[1]), (d) =>
            Bytes.fromHex(PlutusBytes.unwrap(d)),
          ),
        },
        alternate: Maybe.map(PlutusMaybe.unwrap(fields[1]), (d) => Bytes.fromHex(PlutusBytes.unwrap(d))),
      };
    }

    export function toPlutusJson(data: OrderAddressesSchema): PlutusData {
      return {
        constructor: 0,
        fields: [
          {
            constructor: 0,
            fields: [
              data.destination.address.toPlutusJson(),
              PlutusMaybe.wrap(Maybe.map(data.destination.datum, PlutusBytes.wrap)),
            ],
          },
          PlutusMaybe.wrap(Maybe.map(data.alternate, PlutusBytes.wrap)),
        ],
      };
    }
  }

  export namespace SwapDirectionSchema {
    export function fromPlutusJson(data: PlutusData): SwapDirectionSchema {
      const { fields } = PlutusConstr.unwrap(data, { [0]: 3 });
      const directionConstr = PlutusConstr.unwrap(fields[0], { [0]: 0, [1]: 0 });
      return {
        direction: directionConstr.constructor as SwapDirection,
        amount: PlutusInt.unwrapToBigInt(fields[1]),
        minReceivable: Maybe.map(PlutusMaybe.unwrap(fields[2]), PlutusInt.unwrapToBigInt),
      };
    }

    export function toPlutusJson(data: SwapDirectionSchema): PlutusData {
      return {
        constructor: 0,
        fields: [
          { constructor: data.direction, fields: [] },
          PlutusInt.wrap(data.amount),
          PlutusMaybe.wrap(Maybe.map(data.minReceivable, PlutusInt.wrap)),
        ],
      };
    }
  }

  export namespace OrderDatum {
    export function toPlutusJson(data: OrderDatum): PlutusData {
      return {
        constructor: 0,
        fields: [
          PlutusBytes.wrap(data.poolIdent),
          OrderAddressesSchema.toPlutusJson(data.orderAddresses),
          PlutusInt.wrap(data.scooperFee),
          SwapDirectionSchema.toPlutusJson(data.swapDirection),
        ],
      };
    }

    export function toDataHex(data: OrderDatum): string {
      const plutusJson = toPlutusJson(data);
      return PlutusData.toDataHex(plutusJson);
    }

    export function fromPlutusJson(data: PlutusData, networkEnv: NetworkEnvironment): OrderDatum {
      const { fields } = PlutusConstr.unwrap(data, { [0]: 4 });
      return {
        poolIdent: Bytes.fromHex(PlutusBytes.unwrap(fields[0])),
        orderAddresses: OrderAddressesSchema.fromPlutusJson(fields[1], networkEnv),
        scooperFee: PlutusInt.unwrapToBigInt(fields[2]),
        swapDirection: SwapDirectionSchema.fromPlutusJson(fields[3]),
      };
    }

    export function fromDataHex(data: string, networkEnv: NetworkEnvironment): OrderDatum {
      const plutusJson = PlutusData.fromDataHex(data);
      return fromPlutusJson(plutusJson, networkEnv);
    }
  }

  export type OrderInfo = {
    assetIn: Asset;
    amountIn: bigint;
    assetOut: Asset;
    minimumReceive: bigint;
    dexFee: bigint;
    deposit: bigint;
    sender: Address;
    receiver: Address;
  };

  export function getOrderInfo(options: { value: Value; datum: OrderDatum; assetA: Asset; assetB: Asset }): OrderInfo {
    const { value, datum, assetA, assetB } = options;
    const direction = datum.swapDirection.direction;
    const [assetIn, assetOut] = direction === SwapDirection.A_TO_B ? [assetA, assetB] : [assetB, assetA];
    const dexFee = datum.scooperFee;
    const amountIn = datum.swapDirection.amount;
    let deposit = value.get(ADA) - dexFee;
    if (assetIn.equals(ADA)) {
      deposit -= amountIn;
    }
    return {
      sender: datum.orderAddresses.destination.address,
      receiver: datum.orderAddresses.destination.address,
      assetIn,
      amountIn,
      assetOut,
      minimumReceive: datum.swapDirection.minReceivable ?? 0n,
      dexFee,
      deposit,
    };
  }

  export type PoolDatum = {
    assetA: Asset;
    assetB: Asset;
    ident: Bytes;
    liquidity: bigint;
    tradingFee: [number, number];
  };

  export namespace PoolDatum {
    export function fromPlutusJson(data: PlutusData): PoolDatum {
      const dataConstr = PlutusConstr.unwrap(data, { [0]: 4 });
      const assetsConstr = PlutusConstr.unwrap(dataConstr.fields[0], { [0]: 2 });
      const tradingFeeConstr = PlutusConstr.unwrap(dataConstr.fields[3], { [0]: 2 });

      return {
        assetA: Asset.fromPlutusJson(assetsConstr.fields[0]),
        assetB: Asset.fromPlutusJson(assetsConstr.fields[1]),
        ident: Bytes.fromPlutusJson(dataConstr.fields[1]),
        liquidity: PlutusInt.unwrapToBigInt(dataConstr.fields[2]),
        tradingFee: [
          PlutusInt.unwrapToNumber(tradingFeeConstr.fields[0]),
          PlutusInt.unwrapToNumber(tradingFeeConstr.fields[1]),
        ],
      };
    }

    export function toPlutusJson(datum: PoolDatum): PlutusData {
      let assetPlutusData: PlutusData;
      if (datum.assetA && datum.assetB) {
        assetPlutusData = {
          constructor: 0,
          fields: [datum.assetA.toPlutusJson(), datum.assetB.toPlutusJson()],
        };
      } else {
        assetPlutusData = {
          constructor: 1,
          fields: [],
        };
      }
      return {
        constructor: 0,
        fields: [
          assetPlutusData,
          datum.ident.toPlutusJson(),
          PlutusInt.wrap(datum.liquidity),
          {
            constructor: 0,
            fields: [PlutusInt.wrap(datum.tradingFee[0]), PlutusInt.wrap(datum.tradingFee[1])],
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
        assetA: datum.assetA,
        assetB: datum.assetB,
        ident: datum.ident.clone(),
        liquidity: datum.liquidity,
        tradingFee: [...datum.tradingFee],
      };
    }
  }

  export type PoolConstructor = {
    utxo: Utxo;
    rawDatum: CborHex<PoolDatum>;
    networkEnv: NetworkEnvironment;
  };

  export class Pool extends BaseUtxoModel {
    readonly datum: PoolDatum;
    readonly networkEnv: NetworkEnvironment;
    readonly authenAsset: Asset;
    readonly lpAsset: Asset;

    constructor({ utxo, rawDatum, networkEnv }: PoolConstructor) {
      const { output } = utxo;
      const { address, value } = output;
      super(utxo.input, address, value, rawDatum);
      this.datum = PoolDatum.fromCborHex(rawDatum);
      this.networkEnv = networkEnv;
      this.authenAsset = new Asset(Bytes.fromHex(AUTHEN_POLICY_ID), Bytes.fromHex(`7020${this.datum.ident.hex}`));
      this.lpAsset = new Asset(Bytes.fromHex(POOL_SCRIPT_HASH), Bytes.fromHex(`6c7020${this.datum.ident.hex}`));
    }

    get assetA(): Asset {
      return this.datum.assetA;
    }

    get assetB(): Asset {
      return this.datum.assetB;
    }

    get reserveA(): bigint {
      return this.value.get(this.assetA);
    }

    get reserveB(): bigint {
      return this.value.get(this.assetB);
    }

    get liquidity(): bigint {
      return this.datum.liquidity;
    }

    get pair(): [Asset, Asset] {
      return [this.assetA, this.assetB];
    }

    static fromUtxo(utxo: Utxo, rawDatum: CborHex<PoolDatum>, networkEnv: NetworkEnvironment): Result<Pool, Error> {
      try {
        const { output } = utxo;
        const { value } = output;
        invariant(
          output.address.toScriptHash()?.hex === POOL_SCRIPT_HASH,
          `SundaeSwap V1 Pool must have correct script hash`,
        );
        invariant(
          output.datumSource && output.datumSource.type !== DatumSourceType.INLINE_DATUM,
          `SundaeSwap V1 Pool must have datum hash`,
        );
        const datum = PoolDatum.fromCborHex(rawDatum);
        const authenAsset = new Asset(Bytes.fromHex(AUTHEN_POLICY_ID), Bytes.fromHex(`7020${datum.ident.hex}`));
        invariant(value.has(authenAsset), `pool value doesn't have authen asset ${authenAsset.toString()}`);
        const pool = new Pool({
          utxo,
          rawDatum,
          networkEnv,
        });
        return Result.ok(pool);
      } catch (err) {
        let errorStr = "SundaeSwapV1.Pool.fromUtxo error: ";
        if (err instanceof Error) {
          errorStr += err.message;
        } else {
          errorStr += "Unexpected error";
        }
        return Result.err(new Error(errorStr));
      }
    }
  }

  /**
   * FactoryDatum — schema as observed in mainnet debug3.json:
   *   Constr 0 [
   *     bytes nextPoolIdent,         -- next ident to assign on next CreatePool
   *     PlutusData proposal,         -- proposal state (preserved as-is on CreatePool)
   *     bytes scooperIdent,          -- current scooper-license window ident
   *     list<bytes> scoopers,        -- pubkey hashes of authorized scoopers
   *   ]
   * `proposal` is preserved as raw PlutusData because CreatePool copies it
   * through unchanged; we don't need to decode the proposal variant here.
   */
  export type FactoryDatum = {
    nextPoolIdent: Bytes;
    proposal: PlutusData;
    scooperIdent: Bytes;
    scoopers: Bytes[];
  };

  export namespace FactoryDatum {
    export function fromPlutusJson(data: PlutusData): FactoryDatum {
      const { fields } = PlutusConstr.unwrap(data, { [0]: 4 });
      const scoopersList = PlutusList.unwrap(fields[3]);
      return {
        nextPoolIdent: Bytes.fromHex(PlutusBytes.unwrap(fields[0])),
        proposal: fields[1],
        scooperIdent: Bytes.fromHex(PlutusBytes.unwrap(fields[2])),
        scoopers: scoopersList.map((d) => Bytes.fromHex(PlutusBytes.unwrap(d))),
      };
    }

    export function toPlutusJson(d: FactoryDatum): PlutusData {
      return {
        constructor: 0,
        fields: [
          PlutusBytes.wrap(d.nextPoolIdent),
          d.proposal,
          PlutusBytes.wrap(d.scooperIdent),
          { list: d.scoopers.map((b) => PlutusBytes.wrap(b)) },
        ],
      };
    }

    export function fromCborHex(data: CborHex<FactoryDatum>): FactoryDatum {
      return fromPlutusJson(PlutusData.fromDataHex(data));
    }

    export function toCborHex(d: FactoryDatum): CborHex<FactoryDatum> {
      return PlutusData.toDataHex(toPlutusJson(d));
    }

    export function fromDataHex(data: string): FactoryDatum {
      return fromPlutusJson(PlutusData.fromDataHex(data));
    }
  }

  /**
   * Factory.spend redeemer. Only the CreatePool variant is implemented here
   * (governance/proposal flows live on different constructor indices and are
   * out of scope for the v0 CLI).
   *
   * On-chain shape (matches mainnet debug3.json):
   *   Constr 0 [
   *     Constr 0 [bytes policyA, bytes nameA],   -- assetA (sorted)
   *     Constr 0 [bytes policyB, bytes nameB],   -- assetB (sorted)
   *   ]
   */
  export namespace FactoryRedeemer {
    export function createPool({ assetA, assetB }: { assetA: Asset; assetB: Asset }): PlutusData {
      return {
        constructor: 0,
        fields: [assetA.toPlutusJson(), assetB.toPlutusJson()],
      };
    }
  }

  /**
   * Pool.mint redeemer. SundaeSwap V1's pool-mint policy takes a single
   * `bytes` argument: the ident of the pool being created. The on-chain
   * policy uses this ident to derive the expected pool NFT (`p ` + ident)
   * and LP token (`lp ` + ident) token names.
   */
  export namespace PoolMintRedeemer {
    export function createPool(ident: Bytes): PlutusData {
      return PlutusBytes.wrap(ident);
    }
  }

  /**
   * Pool.spend redeemer. The Scoop variant carries the scooper's pubkey hash
   * and the suffix of the active license token name (the validator concatenates
   * the on-chain `"scooper "` prefix to derive the full asset name); the
   * pool-spend script is the one that authenticates the scooper.
   *
   * On-chain shape (matches the mainnet scoop tx):
   *   Constr 0 [bytes scooperPkh, bytes licenseSuffix]
   *   CBOR e.g. `d8799f581c<scooperPkh>42<suffix>ff`
   *
   * Other constructor indices cover admin/governance flows that aren't
   * modelled here.
   */
  export namespace PoolRedeemer {
    export function scoop(scooperPkh: Bytes, licenseSuffix: Bytes): PlutusData {
      return {
        constructor: 0,
        fields: [PlutusBytes.wrap(scooperPkh), PlutusBytes.wrap(licenseSuffix)],
      };
    }
  }

  /**
   * Order.spend redeemer. The Scoop variant is bare (`Constr 0 []`, CBOR
   * `d87980`) — the order validator delegates scooper-license verification
   * to the pool-spend redeemer that runs in the same tx.
   */
  export namespace OrderRedeemer {
    export function scoop(): PlutusData {
      return { constructor: 0, fields: [] };
    }
  }

  /**
   * Datum sitting on the treasury-escrow output the scooper produces every scoop.
   * The scooper records *who* scooped (their pubkey hash) and *which* license
   * window (the suffix of the license token name) so the escrow can audit
   * activity. Mirrors witness datum #2 in the example mainnet scoop tx.
   */
  export type LicenseDatum = {
    scooperPkh: Bytes;
    licenseSuffix: Bytes;
  };

  export namespace LicenseDatum {
    export function toPlutusJson(d: LicenseDatum): PlutusData {
      return {
        constructor: 0,
        fields: [PlutusBytes.wrap(d.scooperPkh), PlutusBytes.wrap(d.licenseSuffix)],
      };
    }

    export function fromPlutusJson(data: PlutusData): LicenseDatum {
      const { fields } = PlutusConstr.unwrap(data, { [0]: 2 });
      return {
        scooperPkh: Bytes.fromHex(PlutusBytes.unwrap(fields[0])),
        licenseSuffix: Bytes.fromHex(PlutusBytes.unwrap(fields[1])),
      };
    }
  }

  /**
   * Increment a little-endian, base-256 byte string. Mirrors the on-chain
   * factory.spend's increment logic: the next ident is `currentIdent + 1`
   * with carry. `"00"` → `"01"`, `"ff"` → `"0001"`, `"01ff"` → `"02ff"` (LE).
   */
  export function incrementIdentLE(hex: string): string {
    const bytes = (hex.match(/../g) ?? []).map((b) => Number.parseInt(b, 16));
    let i = 0;
    let carry = 1;
    while (carry && i < bytes.length) {
      const sum = bytes[i] + carry;
      bytes[i] = sum & 0xff;
      carry = sum >> 8;
      i++;
    }
    if (carry) bytes.push(carry);
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /** Integer square root over BigInt (Newton's method). Used for initial LP supply. */
  export function isqrt(value: bigint): bigint {
    invariant(value >= 0n, "isqrt: negative input");
    if (value < 2n) return value;
    let x = value;
    let y = (x + 1n) / 2n;
    while (y < x) {
      x = y;
      y = (x + value / x) / 2n;
    }
    return x;
  }
}
