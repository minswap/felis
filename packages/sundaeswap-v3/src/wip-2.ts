// import invariant from "@minswap/tiny-invariant";
// import { type Address, type Asset, Bytes, PublicKeyHash } from "../ledger";
// import type { TxBuilderV2 } from "../tx-builder";
// import { Maybe, PlutusBytes, PlutusData, PlutusInt, PlutusMaybe } from "../utils";
// import type { AggregatorBuildTx } from "./build-tx";
// import { AggregatorSource } from "./constants";
// import { AggregatorWarehouse } from "./warehouse";

// export namespace SundaeSwapV3 {
//   // https://github.com/SundaeSwap-finance/aicone/blob/main/lib/sundae/multisig.ak
//   // for now, we only support pubkey address
//   export type MultisigScript =
//     | {
//         type: MultiSigScriptType.Signature;
//         keyHash: Bytes;
//       }
//     | {
//         type: MultiSigScriptType.AllOf;
//         scripts: MultisigScript[];
//       }
//     | {
//         type: MultiSigScriptType.AnyOf;
//         scripts: MultisigScript[];
//       }
//     | {
//         type: MultiSigScriptType.AtLeast;
//         required: bigint;
//         scripts: MultisigScript[];
//       }
//     | {
//         type: MultiSigScriptType.Before;
//         time: bigint;
//       }
//     | {
//         type: MultiSigScriptType.After;
//         time: bigint;
//       }
//     | {
//         type: MultiSigScriptType.Script;
//         scriptHash: Bytes;
//       };

//   export enum MultiSigScriptType {
//     Signature = 0,
//     AllOf = 1,
//     AnyOf = 2,
//     AtLeast = 3,
//     Before = 4,
//     After = 5,
//     Script = 6,
//   }

//   export type Destination =
//     | {
//         type: DestinationType.Fixed;
//         address: Address;
//         datum: Datum;
//       }
//     | { type: DestinationType.Self };

//   export enum DestinationType {
//     Fixed = 0,
//     Self = 1,
//   }

//   /**
//    * For now, we only support NoDatum
//    * /// An output `Datum`.
//     pub type Datum {
//       NoDatum
//       /// A datum referenced by its hash digest.
//       DatumHash(Hash<Blake2b_256, Data>)
//       /// A datum completely inlined in the output.
//       InlineDatum(Data)
//     }
//    */
//   export type Datum =
//     | { type: DatumType.NoDatum }
//     | {
//         type: DatumType.DatumHash;
//         hash: Bytes;
//       }
//     | {
//         type: DatumType.InlineDatum;
//         datum: Bytes; // PlutusDataHex
//       };

//   export enum DatumType {
//     NoDatum = 0,
//     DatumHash = 1,
//     InlineDatum = 2,
//   }

//   export type SingletonValue = {
//     asset: Asset;
//     amount: bigint;
//   };

//   // For now, we only support Swap Order
//   export type OrderDetailsDatum = {
//     type: OrderDetailsDatumType.Swap;
//     offer: SingletonValue;
//     min_receive: SingletonValue;
//   };

//   export enum OrderDetailsDatumType {
//     Strategy = 0,
//     Swap = 1,
//     Deposit = 2,
//     Withdrawal = 3,
//     Donation = 4,
//     Record = 5,
//   }

//   // https://github.com/SundaeSwap-finance/sundae-contracts/blob/main/lib/types/order.ak#L9
//   export type OrderDatum = {
//     poolIdent: Maybe<Bytes>;
//     owner: Address;
//     maxProtocolFee: bigint;
//     destination: Destination;
//     details: OrderDetailsDatum;
//     extension: Bytes; // source: Data => we treat it as PlutusDataHex
//   };

//   export namespace MultiSigScript {
//     /**
//      * Only Support PubKey Address
//      * https://github.com/SundaeSwap-finance/sundae-sdk/blob/60133500767fff214c494edb669b7f5ceb41a613/packages/core/src/DatumBuilders/DatumBuilder.V3.class.ts#L392 (fn buildOwnerDatum)
//      */
//     export function fromAddress(address: Address): MultisigScript {
//       const pubKeyHash = address.toPubKeyHash();
//       invariant(pubKeyHash, "address must be a pubkey address");
//       const rewardKeyHash = address.toStakeAddress()?.toPubKeyHash();
//       return {
//         type: MultiSigScriptType.Signature,
//         keyHash: rewardKeyHash ? rewardKeyHash.keyHash : pubKeyHash.keyHash,
//       };
//     }

//     export function toPlutusJson(data: MultisigScript): PlutusData {
//       invariant(data.type === MultiSigScriptType.Signature, "only support pubkey address");
//       return {
//         constructor: data.type,
//         fields: [data.keyHash.toPlutusJson()],
//       };
//     }
//   }

//   export namespace Destination {
//     export function toPlutusJson(data: Destination): PlutusData {
//       switch (data.type) {
//         case DestinationType.Fixed: {
//           invariant(data.datum.type === DatumType.NoDatum, "only support NoDatum");
//           return {
//             constructor: data.type,
//             fields: [
//               data.address.toPlutusJson(),
//               {
//                 constructor: DatumType.NoDatum,
//                 fields: [],
//               },
//             ],
//           };
//         }
//         case DestinationType.Self: {
//           return {
//             constructor: data.type,
//             fields: [],
//           };
//         }
//       }
//     }
//   }

//   export namespace SingletonValue {
//     export function toPlutusJson(data: SingletonValue): PlutusData {
//       return {
//         list: [
//           data.asset.currencySymbol.toPlutusJson(),
//           data.asset.tokenName.toPlutusJson(),
//           PlutusInt.wrap(data.amount),
//         ],
//       };
//     }
//   }

//   export namespace OrderDetails {
//     export function toPlutusJson(data: OrderDetailsDatum): PlutusData {
//       invariant(data.type === OrderDetailsDatumType.Swap, "only support Swap OrderDetailsDatum");
//       return {
//         constructor: OrderDetailsDatumType.Swap,
//         fields: [SingletonValue.toPlutusJson(data.offer), SingletonValue.toPlutusJson(data.min_receive)],
//       };
//     }
//   }

//   export namespace OrderDatum {
//     export function fromOrderOptions(
//       sender: Address,
//       options: AggregatorBuildTx.SundaeSwapV3ExactInOrderOption,
//     ): OrderDatum {
//       return {
//         poolIdent: Bytes.fromHex(options.poolIdent),
//         owner: sender,
//         maxProtocolFee: options.dexFee,
//         destination: {
//           type: DestinationType.Fixed,
//           address: sender,
//           datum: { type: DatumType.NoDatum },
//         },
//         details: {
//           type: OrderDetailsDatumType.Swap,
//           offer: {
//             asset: options.assetIn,
//             amount: options.amountIn,
//           },
//           min_receive: {
//             asset: options.assetOut,
//             amount: options.minimumReceived,
//           },
//         },
//         extension: Bytes.fromHex("d87980"),
//       };
//     }

//     export function toPlutusJson(data: OrderDatum): PlutusData {
//       const multiSigScript = MultiSigScript.fromAddress(data.owner);
//       return {
//         constructor: 0,
//         fields: [
//           PlutusMaybe.wrap(Maybe.map(data.poolIdent, PlutusBytes.wrap)),
//           MultiSigScript.toPlutusJson(multiSigScript),
//           PlutusInt.wrap(data.maxProtocolFee),
//           Destination.toPlutusJson(data.destination),
//           OrderDetails.toPlutusJson(data.details),
//           PlutusBytes.wrap(data.extension),
//         ],
//       };
//     }

//     export function toDataHex(data: OrderDatum): string {
//       const plutusJson = toPlutusJson(data);
//       return PlutusData.toDataHex(plutusJson);
//     }
//   }

//   // MARK: Cancel Order
//   // https://github.com/SundaeSwap-finance/sundae-contracts/blob/f135ec17cba0f42a16cc4ed94c1b3a1cfaf38032/lib/types/order.ak#L85
//   export enum OrderRedeemerType {
//     Scoop = 0, // Execute the order
//     Cancel = 1, // Or cancel/update it
//   }

//   /**
//    * Ref: https://github.com/SundaeSwap-finance/sundae-contracts/blob/main/validators/order.ak#L37
//    */
//   export function cancelOrder(options: AggregatorBuildTx.CancelOrderBuildTxOptions): TxBuilderV2 {
//     const { networkEnv, source, owner, orderUtxo, txb } = options;
//     invariant(source === AggregatorSource.SundaeSwapV3, "Invalid source");
//     const cancelRedeemer = {
//       constructor: OrderRedeemerType.Cancel,
//       fields: [],
//     };
//     const multisig = MultiSigScript.fromAddress(owner);
//     invariant(multisig.type === MultiSigScriptType.Signature, "only support pubkey address");
//     const keyHash = new PublicKeyHash(multisig.keyHash);
//     const warehouse = AggregatorWarehouse.getInstance(networkEnv);
//     const referenceUtxo = warehouse.getOrderReference(source);

//     const txBuilder = txb
//       .readFrom(referenceUtxo)
//       .collectFromPlutusContract([orderUtxo], cancelRedeemer)
//       .addSignerKey(keyHash);

//     return txBuilder;
//   }
// }
