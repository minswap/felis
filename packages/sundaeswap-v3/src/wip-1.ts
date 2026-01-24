// import * as SDK from "@minswap/sdk";
// import invariant from "@minswap/tiny-invariant";
// import JSONBig from "json-bigint";
// import { RationalBigInt } from "../../../../utils";
// import type { ParseUtxoParams, ParseUtxoResult } from "../../parse-tx";
// import { type DexAggrTx, DexAggrTxType } from "../../types";
// import {
//   type AggrSource,
//   type IBasicPool,
//   type IOrder,
//   type IPool,
//   type IPoolState,
//   OrderType,
//   type PoolFeePercentage,
//   type PoolPrice,
//   Protocol,
//   SwapDirection,
// } from "../types";

// export namespace SundaeswapAmmV3 {
//   export function getScriptHashList(): SDK.Bytes[] {
//     return [Order.scriptHash, Pool.scriptHash, SettingDatum.scriptHash];
//   }

//   export function getReferenceScriptList(): string[] {
//     return [
//       "f9121bf01434f6c263d5b1ffa35a155bed37a1aba641a209b35da7c841082d7b#0",
//       "cd25698683583baa9a24aeed89266b3f61e42ea857974dd0fbfbd84146875808#0",
//       "f5f1bdfad3eb4d67d2fc36f36f47fc2938cf6f001689184ab320735a28642cf2#0",
//     ];
//   }

//   // MARK: ORDER
//   export enum OrderDatumType {
//     Swap = 1,
//     Deposit = 2,
//     Withdraw = 3,
//   }

//   export enum DestinationDatumType {
//     None = 0,
//     Hash = 1,
//     Inline = 2,
//   }

//   type DestinationDatum = SDK.Maybe<
//     | {
//         type: DestinationDatumType.Hash;
//         value: SDK.Bytes;
//       }
//     | {
//         type: DestinationDatumType.Inline;
//         value: string; // hex string
//       }
//   >;

//   type OrderDetails =
//     | {
//         type: OrderDatumType.Swap;
//         offer: SDK.AssetAmount;
//         minimumReceive: SDK.AssetAmount;
//       }
//     | {
//         type: OrderDatumType.Deposit;
//         amountA: SDK.AssetAmount;
//         amountB: SDK.AssetAmount;
//       }
//     | {
//         type: OrderDatumType.Withdraw;
//         lpAssetAmount: SDK.AssetAmount;
//       };

//   export type OrderDatum = {
//     poolIdent: SDK.Bytes;
//     owner: SDK.Credential;
//     scooperFee: bigint;
//     destination: {
//       address: SDK.Address;
//       datum: DestinationDatum;
//     };
//     // extension: SDK.Bytes | null; // Does not use this, just ignore
//   } & OrderDetails;

//   export namespace OrderDatum {
//     export function fromPlutusData(data: SDK.PlutusData): OrderDatum {
//       const dataConstr = SDK.PlutusConstr.unwrap(data, { [0]: 6 });
//       const poolConstr = SDK.PlutusConstr.unwrap(dataConstr.fields[0], {
//         [0]: 1,
//       });
//       const destinationConstr = SDK.PlutusConstr.unwrap(dataConstr.fields[3], {
//         [0]: 2,
//       });
//       const datumConstr = SDK.PlutusConstr.unwrap(destinationConstr.fields[1], {
//         [0]: 0,
//         [1]: 1,
//         [2]: 1,
//       });
//       const orderConstr = SDK.PlutusConstr.unwrap(dataConstr.fields[4], {
//         [1]: 2,
//         [2]: 1,
//         [3]: 1,
//       });

//       let datum: DestinationDatum;
//       switch (datumConstr.constructor) {
//         case DestinationDatumType.None: {
//           datum = null;
//           break;
//         }
//         case DestinationDatumType.Hash: {
//           datum = {
//             type: DestinationDatumType.Hash,
//             value: SDK.PlutusBytes.unwrap(datumConstr.fields[0]),
//           };
//           break;
//         }
//         case DestinationDatumType.Inline: {
//           datum = {
//             type: DestinationDatumType.Inline,
//             value: SDK.PlutusData.toDataHex(datumConstr.fields[0]),
//           };
//           break;
//         }
//       }

//       let order: OrderDetails;
//       switch (orderConstr.constructor) {
//         case OrderDatumType.Swap: {
//           const offerList = SDK.PlutusList.unwrap(orderConstr.fields[0]);
//           const minimumReceiveList = SDK.PlutusList.unwrap(orderConstr.fields[1]);
//           const offeredAsset = new SDK.Asset(
//             SDK.PlutusBytes.unwrap(offerList[0]),
//             SDK.PlutusBytes.unwrap(offerList[1]),
//           );
//           const receivedAsset = new SDK.Asset(
//             SDK.PlutusBytes.unwrap(minimumReceiveList[0]),
//             SDK.PlutusBytes.unwrap(minimumReceiveList[1]),
//           );
//           order = {
//             type: OrderDatumType.Swap,
//             offer: {
//               asset: offeredAsset,
//               amount: SDK.PlutusInt.unwrapToBigInt(offerList[2]),
//             },
//             minimumReceive: {
//               asset: receivedAsset,
//               amount: SDK.PlutusInt.unwrapToBigInt(minimumReceiveList[2]),
//             },
//           };
//           break;
//         }
//         case OrderDatumType.Deposit: {
//           const assets = SDK.PlutusList.unwrap(orderConstr.fields[0]);
//           const assetAmountA = SDK.PlutusList.unwrap(assets[0]);
//           const assetAmountB = SDK.PlutusList.unwrap(assets[1]);
//           const assetA = new SDK.Asset(
//             SDK.PlutusBytes.unwrap(assetAmountA[0]),
//             SDK.PlutusBytes.unwrap(assetAmountA[1]),
//           );
//           const assetB = new SDK.Asset(
//             SDK.PlutusBytes.unwrap(assetAmountB[0]),
//             SDK.PlutusBytes.unwrap(assetAmountB[1]),
//           );
//           order = {
//             type: OrderDatumType.Deposit,
//             amountA: {
//               asset: assetA,
//               amount: SDK.PlutusInt.unwrapToBigInt(assetAmountA[2]),
//             },
//             amountB: {
//               asset: assetB,
//               amount: SDK.PlutusInt.unwrapToBigInt(assetAmountB[2]),
//             },
//           };
//           break;
//         }
//         case OrderDatumType.Withdraw: {
//           const lpAssetAmount = SDK.PlutusList.unwrap(orderConstr.fields[0]);
//           const lpAsset = new SDK.Asset(
//             SDK.PlutusBytes.unwrap(lpAssetAmount[0]),
//             SDK.PlutusBytes.unwrap(lpAssetAmount[1]),
//           );
//           order = {
//             type: OrderDatumType.Withdraw,
//             lpAssetAmount: {
//               asset: lpAsset,
//               amount: SDK.PlutusInt.unwrapToBigInt(lpAssetAmount[2]),
//             },
//           };
//           break;
//         }
//         default: {
//           throw new Error(`SundaeswapV3: Unexpected order datum constructor: ${data}`);
//         }
//       }

//       return {
//         poolIdent: SDK.Bytes.fromPlutusJson(poolConstr.fields[0]),
//         owner: SDK.Credential.fromPlutusJson(dataConstr.fields[1]),
//         scooperFee: SDK.PlutusInt.unwrapToBigInt(dataConstr.fields[2]),
//         destination: {
//           address: SDK.Address.fromPlutusJson(destinationConstr.fields[0]),
//           datum,
//         },
//         ...order,
//       };
//     }

//     export function toPlutusJson(datum: OrderDatum): SDK.PlutusData {
//       let destinationDatumConstr: SDK.PlutusData;
//       switch (datum.destination.datum?.type) {
//         case DestinationDatumType.Hash: {
//           destinationDatumConstr = {
//             constructor: DestinationDatumType.Hash,
//             fields: [SDK.PlutusBytes.wrap(datum.destination.datum.value)],
//           };
//           break;
//         }
//         case DestinationDatumType.Inline: {
//           destinationDatumConstr = {
//             constructor: DestinationDatumType.Inline,
//             fields: [SDK.PlutusData.fromDataHex(datum.destination.datum.value)],
//           };
//           break;
//         }
//         default: {
//           destinationDatumConstr = {
//             constructor: DestinationDatumType.None,
//             fields: [],
//           };
//         }
//       }

//       let detailsOrderConstr: SDK.PlutusData;
//       switch (datum.type) {
//         case OrderDatumType.Swap: {
//           detailsOrderConstr = {
//             constructor: OrderDatumType.Swap,
//             fields: [
//               {
//                 list: [
//                   SDK.PlutusBytes.wrap(datum.offer.asset.currencySymbol),
//                   SDK.PlutusBytes.wrap(datum.offer.asset.tokenName),
//                   SDK.PlutusInt.wrap(datum.offer.amount),
//                 ],
//               },
//               {
//                 list: [
//                   SDK.PlutusBytes.wrap(datum.minimumReceive.asset.currencySymbol),
//                   SDK.PlutusBytes.wrap(datum.minimumReceive.asset.tokenName),
//                   SDK.PlutusInt.wrap(datum.minimumReceive.amount),
//                 ],
//               },
//             ],
//           };
//           break;
//         }
//         case OrderDatumType.Deposit: {
//           detailsOrderConstr = {
//             constructor: OrderDatumType.Deposit,
//             fields: [
//               {
//                 list: [
//                   {
//                     list: [
//                       SDK.PlutusBytes.wrap(datum.amountA.asset.currencySymbol),
//                       SDK.PlutusBytes.wrap(datum.amountA.asset.tokenName),
//                       SDK.PlutusInt.wrap(datum.amountA.amount),
//                     ],
//                   },
//                   {
//                     list: [
//                       SDK.PlutusBytes.wrap(datum.amountB.asset.currencySymbol),
//                       SDK.PlutusBytes.wrap(datum.amountB.asset.tokenName),
//                       SDK.PlutusInt.wrap(datum.amountB.amount),
//                     ],
//                   },
//                 ],
//               },
//             ],
//           };
//           break;
//         }
//         case OrderDatumType.Withdraw: {
//           detailsOrderConstr = {
//             constructor: OrderDatumType.Withdraw,
//             fields: [
//               {
//                 list: [
//                   SDK.PlutusBytes.wrap(datum.lpAssetAmount.asset.currencySymbol),
//                   SDK.PlutusBytes.wrap(datum.lpAssetAmount.asset.tokenName),
//                   SDK.PlutusInt.wrap(datum.lpAssetAmount.amount),
//                 ],
//               },
//             ],
//           };
//           break;
//         }
//       }

//       return {
//         constructor: 0,
//         fields: [
//           SDK.PlutusMaybe.wrap(SDK.Maybe.map(datum.poolIdent, SDK.PlutusBytes.wrap)),
//           SDK.Credential.toPlutusJson(datum.owner),
//           SDK.PlutusInt.wrap(datum.scooperFee),
//           {
//             constructor: 0,
//             fields: [datum.destination.address.toPlutusJson(), destinationDatumConstr],
//           },
//           detailsOrderConstr,
//         ],
//       };
//     }

//     export function fromCborHex(data: SDK.CborHex<OrderDatum>): OrderDatum {
//       const plutusData = SDK.PlutusData.fromDataHex(data);
//       return fromPlutusData(plutusData);
//     }
//     export function toDataHex(data: OrderDatum): SDK.CborHex<OrderDatum> {
//       const plutusJson = toPlutusJson(data);
//       return SDK.PlutusData.toDataHex(plutusJson);
//     }

//     export function getOwnerAddressIdent(datum: OrderDatum): SDK.AddressIdent {
//       return SDK.extractAddressIdent(datum.destination.address);
//     }
//   }

//   export type OrderConstructor = {
//     txIn: SDK.TxIn;
//     value: SDK.Value;
//     rawDatum: string;
//     datum: OrderDatum;
//     assetA: SDK.Asset;
//     assetB: SDK.Asset;
//     contractAddr: SDK.Address;
//     aggrSource: AggrSource | null;
//   };

//   export class Order implements IOrder {
//     readonly txIn: SDK.TxIn;
//     readonly value: SDK.Value;
//     readonly rawDatum: string;
//     readonly datum: OrderDatum;
//     readonly assetA: SDK.Asset;
//     readonly assetB: SDK.Asset;
//     readonly contractAddr: SDK.Address;
//     readonly aggrSource: AggrSource | null;

//     static readonly depositAda = 2_000_000n;
//     static readonly scriptHash = SDK.Bytes.fromHex("fa6a58bbe2d0ff05534431c8e2f0ef2cbdc1602a8456e4b13c8f3077");

//     constructor({ txIn, value, contractAddr, datum, assetA, assetB, rawDatum, aggrSource }: OrderConstructor) {
//       this.txIn = txIn;
//       this.value = value;
//       this.datum = datum;
//       this.assetA = assetA;
//       this.assetB = assetB;
//       this.rawDatum = rawDatum;
//       this.aggrSource = aggrSource;
//       this.contractAddr = contractAddr;
//     }

//     get protocol(): Protocol {
//       return Protocol.SundaeswapAmmV3;
//     }

//     get lpAsset(): SDK.Asset {
//       return Pool.getLpAssetByPoolIdent(this.datum.poolIdent);
//     }

//     get type(): OrderType {
//       switch (this.datum.type) {
//         case OrderDatumType.Swap: {
//           return OrderType.Swap;
//         }
//         case OrderDatumType.Deposit: {
//           return OrderType.Deposit;
//         }
//         case OrderDatumType.Withdraw: {
//           return OrderType.Withdraw;
//         }
//         default:
//           throw new Error(`SundaeswapAmmV3: Order type is not supported.`);
//       }
//     }

//     get amountA(): bigint {
//       switch (this.datum.type) {
//         case OrderDatumType.Swap: {
//           return SDK.isNormalizePair([this.datum.offer.asset, this.datum.minimumReceive.asset])
//             ? this.datum.offer.amount
//             : this.datum.minimumReceive.amount;
//         }
//         case OrderDatumType.Deposit: {
//           return this.datum.amountA.amount;
//         }
//         case OrderDatumType.Withdraw: {
//           return 0n;
//         }
//         default:
//           return 0n;
//       }
//     }

//     get amountB(): bigint {
//       switch (this.datum.type) {
//         case OrderDatumType.Swap: {
//           return SDK.isNormalizePair([this.datum.offer.asset, this.datum.minimumReceive.asset])
//             ? this.datum.minimumReceive.amount
//             : this.datum.offer.amount;
//         }
//         case OrderDatumType.Deposit: {
//           return this.datum.amountB.amount;
//         }
//         case OrderDatumType.Withdraw: {
//           return 0n;
//         }
//         default:
//           return 0n;
//       }
//     }

//     get lpAmount(): bigint {
//       switch (this.datum.type) {
//         case OrderDatumType.Swap: {
//           return 0n;
//         }
//         case OrderDatumType.Deposit: {
//           return 0n;
//         }
//         case OrderDatumType.Withdraw: {
//           return this.datum.lpAssetAmount.amount;
//         }
//         default:
//           return 0n;
//       }
//     }

//     get batcherFee(): bigint {
//       return this.datum.scooperFee;
//     }

//     get ownerAddress(): SDK.AddressIdent {
//       return OrderDatum.getOwnerAddressIdent(this.datum);
//     }

//     get depositAda(): bigint {
//       return Order.depositAda;
//     }

//     get swapDirection(): null | SwapDirection {
//       if (this.datum.type !== OrderDatumType.Swap) {
//         return null;
//       }
//       return SDK.isNormalizePair([this.datum.offer.asset, this.datum.minimumReceive.asset])
//         ? SwapDirection.A_TO_B
//         : SwapDirection.B_TO_A;
//     }

//     // The value has been subtracted the depositAda.
//     get valueWithoutFees(): SDK.Value {
//       return this.value.clone().subtract(SDK.ADA, Order.depositAda).trim();
//     }

//     static fromUtxo(utxo: SDK.Utxo, rawDatum: string, pair: SDK.Asset[], aggrSource: AggrSource | null): Order {
//       try {
//         return new Order({
//           assetA: pair[0],
//           assetB: pair[1],
//           txIn: utxo.input,
//           rawDatum: rawDatum,
//           aggrSource: aggrSource,
//           value: utxo.output.value,
//           contractAddr: utxo.output.address,
//           datum: OrderDatum.fromCborHex(rawDatum),
//         });
//       } catch (err) {
//         throw new Error(`SundaeswapAmmV3: Failed to parse order from UTxO Order:
//           utxo: ${JSONBig.stringify(utxo)}
//           rawDatum: ${rawDatum}
//           error: ${err}
//         `);
//       }
//     }
//   }

//   // MARK: POOL
//   export enum MultisigScriptType {
//     Signature = 0,
//     AllOf = 1,
//     AnyOf = 2,
//     AtLeast = 3,
//     Before = 4,
//     After = 5,
//     Script = 6,
//   }

//   type MultisigScript = SDK.Maybe<
//     | {
//         type: MultisigScriptType.Signature;
//         keyHash: SDK.Bytes;
//       }
//     | {
//         type: MultisigScriptType.AllOf | MultisigScriptType.AnyOf;
//         scripts: SDK.Credential[];
//       }
//     | {
//         type: MultisigScriptType.AtLeast;
//         required: number; // threshold multi-signature condition
//         scripts: SDK.Credential[];
//       }
//     | {
//         type: MultisigScriptType.Before | MultisigScriptType.After;
//         time: bigint;
//       }
//     | {
//         type: MultisigScriptType.Script;
//         scriptHash: SDK.Bytes;
//       }
//   >;

//   namespace MultisigDatum {
//     export function fromPlutusJson(data: SDK.PlutusData): MultisigScript {
//       const { constructor: constr, fields } = SDK.PlutusConstr.unwrap(data, {
//         [0]: 1,
//         [1]: 1,
//         [2]: 1,
//         [3]: 2,
//         [4]: 1,
//         [5]: 1,
//         [6]: 1,
//       });

//       switch (constr) {
//         case MultisigScriptType.Signature: {
//           return {
//             type: MultisigScriptType.Signature,
//             keyHash: SDK.PlutusBytes.unwrap(fields[0]),
//           };
//         }
//         case MultisigScriptType.AnyOf:
//         case MultisigScriptType.AllOf: {
//           const managersPlutusList = SDK.PlutusList.unwrap(fields[0]);
//           const managers: SDK.Credential[] = [];
//           for (const manager of managersPlutusList) {
//             managers.push(SDK.Credential.fromPlutusJson(manager));
//           }
//           return {
//             type: constr,
//             scripts: managers,
//           };
//         }
//         case MultisigScriptType.AtLeast: {
//           const managersPlutusList = SDK.PlutusList.unwrap(fields[1]);
//           const managers: SDK.Credential[] = [];
//           for (const manager of managersPlutusList) {
//             managers.push(SDK.Credential.fromPlutusJson(manager));
//           }
//           return {
//             type: MultisigScriptType.AtLeast,
//             required: SDK.PlutusInt.unwrapToNumber(fields[0]),
//             scripts: managers,
//           };
//         }
//         case MultisigScriptType.Before:
//         case MultisigScriptType.After: {
//           return {
//             type: constr,
//             time: SDK.PlutusInt.unwrapToBigInt(fields[0]),
//           };
//         }
//         case MultisigScriptType.Script: {
//           return {
//             type: MultisigScriptType.Script,
//             scriptHash: SDK.PlutusBytes.unwrap(fields[0]),
//           };
//         }
//         default: {
//           throw new Error("SundaeswapAmmV3: Unsupported Multisig Datum type.");
//         }
//       }
//     }
//   }

//   export type PoolDatum = {
//     ident: SDK.Bytes;
//     assetA: SDK.Asset;
//     assetB: SDK.Asset;
//     liquidity: bigint; // circulating lp
//     askFee: bigint; // per 10_000
//     bidFee: bigint; // per 10_000
//     marketOpen: bigint; // start trading time, 0 means immediately
//     protocolFee: bigint;
//     feeManagers: MultisigScript;
//   };

//   export namespace PoolDatum {
//     export function fromPlutusJson(data: SDK.PlutusData): PoolDatum {
//       const dataConstr = SDK.PlutusConstr.unwrap(data, { [0]: 8 });
//       const assets = SDK.PlutusList.unwrap(dataConstr.fields[1]);
//       const assetAData = SDK.PlutusList.unwrap(assets[0]);
//       const assetA = new SDK.Asset(SDK.PlutusBytes.unwrap(assetAData[0]), SDK.PlutusBytes.unwrap(assetAData[1]));
//       const assetBData = SDK.PlutusList.unwrap(assets[1]);
//       const assetB = new SDK.Asset(SDK.PlutusBytes.unwrap(assetBData[0]), SDK.PlutusBytes.unwrap(assetBData[1]));
//       const feeManager = SDK.Maybe.map(SDK.PlutusMaybe.unwrap(dataConstr.fields[5]), (d) =>
//         MultisigDatum.fromPlutusJson(d),
//       );
//       return {
//         ident: SDK.PlutusBytes.unwrap(dataConstr.fields[0]),
//         assetA: assetA,
//         assetB: assetB,
//         liquidity: SDK.PlutusInt.unwrapToBigInt(dataConstr.fields[2]),
//         askFee: SDK.PlutusInt.unwrapToBigInt(dataConstr.fields[3]),
//         bidFee: SDK.PlutusInt.unwrapToBigInt(dataConstr.fields[4]),
//         marketOpen: SDK.PlutusInt.unwrapToBigInt(dataConstr.fields[6]),
//         protocolFee: SDK.PlutusInt.unwrapToBigInt(dataConstr.fields[7]),
//         feeManagers: feeManager,
//       };
//     }

//     export function toPlutusJson(datum: PoolDatum): SDK.PlutusData {
//       return {
//         constructor: 0,
//         fields: [
//           SDK.PlutusBytes.wrap(datum.ident),
//           {
//             list: [
//               {
//                 list: [SDK.PlutusBytes.wrap(datum.assetA.currencySymbol), SDK.PlutusBytes.wrap(datum.assetA.tokenName)],
//               },
//               {
//                 list: [SDK.PlutusBytes.wrap(datum.assetB.currencySymbol), SDK.PlutusBytes.wrap(datum.assetB.tokenName)],
//               },
//             ],
//           },
//           SDK.PlutusInt.wrap(datum.liquidity),
//           SDK.PlutusInt.wrap(datum.askFee),
//           SDK.PlutusInt.wrap(datum.bidFee),
//           SDK.PlutusMaybe.wrap(
//             SDK.Maybe.map(datum.feeManagers, (data) => {
//               // biome-ignore lint/suspicious/noShadowRestrictedNames: constructor as in Plutus data.
//               let constructor: number;
//               let fields: SDK.PlutusData[] = [];

//               switch (data.type) {
//                 case MultisigScriptType.Signature: {
//                   return SDK.PlutusBytes.wrap(data.keyHash);
//                 }
//                 case MultisigScriptType.AnyOf:
//                 case MultisigScriptType.AllOf: {
//                   constructor = MultisigScriptType.AtLeast;
//                   const scripts: SDK.PlutusData[] = [];
//                   for (const owner of data.scripts) {
//                     scripts.push(SDK.Credential.toPlutusJson(owner));
//                   }
//                   fields = [
//                     {
//                       list: scripts,
//                     },
//                   ];
//                   break;
//                 }
//                 case MultisigScriptType.Before:
//                 case MultisigScriptType.After: {
//                   return SDK.PlutusInt.wrap(data.time);
//                 }
//                 case MultisigScriptType.AtLeast: {
//                   constructor = MultisigScriptType.AtLeast;
//                   const scripts: SDK.PlutusData[] = [];
//                   for (const owner of data.scripts) {
//                     scripts.push(SDK.Credential.toPlutusJson(owner));
//                   }
//                   fields = [
//                     SDK.PlutusInt.wrap(data.required),
//                     {
//                       list: scripts,
//                     },
//                   ];
//                   break;
//                 }
//                 case MultisigScriptType.Script: {
//                   return SDK.PlutusBytes.wrap(data.scriptHash);
//                 }
//                 default: {
//                   throw new Error("Unknown fee manager type");
//                 }
//               }
//               return {
//                 constructor: constructor,
//                 fields: fields,
//               };
//             }),
//           ),
//           SDK.PlutusInt.wrap(datum.marketOpen),
//           SDK.PlutusInt.wrap(datum.protocolFee),
//         ],
//       };
//     }

//     export function clone(datum: PoolDatum): PoolDatum {
//       return {
//         ident: datum.ident,
//         assetA: datum.assetA,
//         assetB: datum.assetB,
//         liquidity: datum.liquidity,
//         askFee: datum.askFee,
//         bidFee: datum.bidFee,
//         marketOpen: datum.marketOpen,
//         protocolFee: datum.protocolFee,
//         feeManagers: datum.feeManagers,
//       };
//     }

//     export function fromDataHex(data: SDK.CborHex<PoolDatum>): PoolDatum {
//       const plutusData = SDK.PlutusData.fromDataHex(data);
//       return fromPlutusJson(plutusData);
//     }

//     export function toDataHex(data: PoolDatum): SDK.CborHex<PoolDatum> {
//       const plutusJson = toPlutusJson(data);
//       return SDK.PlutusData.toDataHex(plutusJson);
//     }
//   }

//   type SignedStrategyExecution = {
//     strategy: string;
//     signature: SDK.Bytes;
//   };
//   export enum PoolMintRedeemerType {
//     Mint = 0,
//     Create = 1,
//     Burn = 2,
//   }

//   export enum PoolSpendRedeemerType {
//     Scoop = 0,
//     Manage = 1,
//   }

//   export enum ManageRedeemerType {
//     WithdrawFees = 0,
//     UpdatePoolFees = 1,
//   }

//   export type MintPoolRedeemer =
//     | {
//         type: PoolMintRedeemerType.Mint;
//         ident: SDK.Bytes;
//       }
//     | {
//         type: PoolMintRedeemerType.Create;
//         assets: {
//           assetA: SDK.Asset;
//           assetB: SDK.Asset;
//         };
//         poolOutput: bigint; // The index in the outputs that corresponds to the pool output
//         metadataOutput: bigint; // The index in the outputs that the corresponding CIP-68 metadata token is paid to
//       }
//     | {
//         type: PoolMintRedeemerType.Burn;
//         ident: SDK.Bytes;
//       };

//   export type SpendPoolRedeemer =
//     | {
//         type: PoolSpendRedeemerType.Scoop;
//         signatoryIndex: bigint;
//         scooperIndex: bigint;
//         // The order to process the transaction inputs in, and optionally the signed strategy execution to execute for strategy orders.
//         inputOrder: [number, SDK.Maybe<SignedStrategyExecution>, number][];
//       }
//     | {
//         type: PoolSpendRedeemerType.Manage;
//       };

//   export type ManageRedeemer =
//     | {
//         type: ManageRedeemerType.UpdatePoolFees;
//         poolInput: bigint;
//       }
//     | {
//         type: ManageRedeemerType.WithdrawFees;
//         amount: bigint;
//         treasuryOutput: bigint;
//         poolInput: bigint;
//       };

//   export type PoolRedeemer = MintPoolRedeemer | SpendPoolRedeemer | ManageRedeemer;

//   export namespace PoolRedeemer {
//     function fromPlutusDataToMintPoolRedeemer(data: SDK.PlutusData): SDK.Result<MintPoolRedeemer, unknown> {
//       try {
//         const { constructor: constr, fields } = SDK.PlutusConstr.unwrap(data, {
//           [0]: 1,
//           [1]: 3,
//           [2]: 1,
//         });
//         switch (constr) {
//           case PoolMintRedeemerType.Mint: {
//             return SDK.Result.ok({
//               type: PoolMintRedeemerType.Mint,
//               ident: SDK.PlutusBytes.unwrap(fields[0]),
//             });
//           }
//           case PoolMintRedeemerType.Create: {
//             const assetsPlutusData = SDK.PlutusList.unwrap(fields[0]);
//             const assetAPlutusData = SDK.PlutusList.unwrap(assetsPlutusData[0]);
//             const assetBPlutusData = SDK.PlutusList.unwrap(assetsPlutusData[1]);
//             return SDK.Result.ok({
//               type: PoolMintRedeemerType.Create,
//               assets: {
//                 assetA: new SDK.Asset(
//                   SDK.PlutusBytes.unwrap(assetAPlutusData[0]),
//                   SDK.PlutusBytes.unwrap(assetAPlutusData[1]),
//                 ),
//                 assetB: new SDK.Asset(
//                   SDK.PlutusBytes.unwrap(assetBPlutusData[0]),
//                   SDK.PlutusBytes.unwrap(assetBPlutusData[1]),
//                 ),
//               },
//               poolOutput: SDK.PlutusInt.unwrapToBigInt(fields[1]),
//               metadataOutput: SDK.PlutusInt.unwrapToBigInt(fields[2]),
//             });
//           }
//           case PoolMintRedeemerType.Burn: {
//             return SDK.Result.ok({
//               type: PoolMintRedeemerType.Burn,
//               ident: SDK.PlutusBytes.unwrap(fields[0]),
//             });
//           }
//         }
//       } catch (err) {
//         return SDK.Result.err(err);
//       }
//       return SDK.Result.err(new Error("SundaeswapAmmV3 PoolRedeemer: Cannot parse plutus data to MintPoolRedeemer"));
//     }

//     function fromPlutusDataToSpendPoolRedeemer(data: SDK.PlutusData): SDK.Result<SpendPoolRedeemer, unknown> {
//       try {
//         const { fields } = SDK.PlutusConstr.unwrap(data, { [1]: 1 });
//         const redeemerConstr = SDK.PlutusConstr.unwrap(fields[0], {
//           [0]: 3,
//           [1]: 0,
//         });
//         if (redeemerConstr.constructor === 0) {
//           const inputOrders = SDK.PlutusList.unwrap(redeemerConstr.fields[2]);
//           const indexingSets: [number, SDK.Maybe<SignedStrategyExecution>, number][] = [];
//           for (const inputOrder of inputOrders) {
//             const order = SDK.PlutusList.unwrap(inputOrder);
//             const signedStrategyExecution: SDK.Maybe<SignedStrategyExecution> = SDK.Maybe.map(
//               SDK.PlutusMaybe.unwrap(order[1]),
//               (d) => {
//                 // TODO: verify
//                 const data = SDK.PlutusConstr.unwrap(d, {
//                   [0]: 2,
//                 });
//                 const strategy = SDK.PlutusData.toDataHex(data.fields[0]);
//                 return {
//                   strategy: strategy,
//                   signature: SDK.PlutusBytes.unwrap(data.fields[1]),
//                 };
//               },
//             );
//             indexingSets.push([
//               SDK.PlutusInt.unwrapToNumber(order[0]),
//               signedStrategyExecution,
//               SDK.PlutusInt.unwrapToNumber(order[2]),
//             ]);
//           }
//           return SDK.Result.ok({
//             type: PoolSpendRedeemerType.Scoop,
//             signatoryIndex: SDK.PlutusInt.unwrapToBigInt(redeemerConstr.fields[0]),
//             scooperIndex: SDK.PlutusInt.unwrapToBigInt(redeemerConstr.fields[1]),
//             inputOrder: indexingSets,
//           });
//         } else if (redeemerConstr.constructor === 1) {
//           return SDK.Result.ok({
//             type: PoolSpendRedeemerType.Manage,
//           });
//         }
//       } catch (err) {
//         return SDK.Result.err(err);
//       }
//       return SDK.Result.err(new Error("SundaeswapAmmV3 PoolRedeemer: Cannot parse plutus data to SpendPoolRedeemer"));
//     }

//     function fromPlutusDataToManagerRedeemer(data: SDK.PlutusData): SDK.Result<ManageRedeemer, unknown> {
//       try {
//         const { constructor: constr, fields } = SDK.PlutusConstr.unwrap(data, {
//           [0]: 3,
//           [1]: 1,
//         });
//         switch (constr) {
//           case ManageRedeemerType.WithdrawFees: {
//             return SDK.Result.ok({
//               type: ManageRedeemerType.WithdrawFees,
//               amount: SDK.PlutusInt.unwrapToBigInt(fields[0]),
//               treasuryOutput: SDK.PlutusInt.unwrapToBigInt(fields[1]),
//               poolInput: SDK.PlutusInt.unwrapToBigInt(fields[2]),
//             });
//           }
//           case ManageRedeemerType.UpdatePoolFees: {
//             return SDK.Result.ok({
//               type: ManageRedeemerType.UpdatePoolFees,
//               poolInput: SDK.PlutusInt.unwrapToBigInt(fields[0]),
//             });
//           }
//         }
//       } catch (err) {
//         return SDK.Result.err(err);
//       }
//       return SDK.Result.err(new Error("SundaeswapAmmV3 PoolRedeemer: Cannot parse plutus data to ManagerRedeemer"));
//     }

//     export function fromPlutusData(data: SDK.PlutusData): PoolRedeemer {
//       const result = [
//         fromPlutusDataToMintPoolRedeemer(data),
//         fromPlutusDataToSpendPoolRedeemer(data),
//         fromPlutusDataToManagerRedeemer(data),
//       ];
//       const redeemer = result.find((r) => r.type === "ok");
//       if (!redeemer) {
//         throw new Error(`SundaeswapAmmV3 PoolRedeemer.fromPlutusJson: unexpected constr ${JSON.stringify(data)}`);
//       }
//       return redeemer.value;
//     }

//     export function fromCborHex(data: SDK.CborHex<SDK.CSLPlutusData>): PoolRedeemer {
//       const plutusData = SDK.PlutusData.fromDataHex(data);
//       return fromPlutusData(plutusData);
//     }
//   }

//   type BasicPoolConstructor = {
//     txIn: SDK.TxIn;
//     value: SDK.Value;
//     datum: PoolDatum;
//     contractAddr: SDK.Address;
//   };

//   class BasicPool implements IBasicPool {
//     readonly txIn: SDK.TxIn;
//     readonly value: SDK.Value;
//     readonly datum: PoolDatum;
//     readonly contractAddr: SDK.Address;

//     static readonly feeDenominator = 10_000n;
//     static readonly minPoolAdaValue = 3_000_000n;
//     static readonly scriptHash = SDK.Bytes.fromHex("e0302560ced2fdcbfcb2602697df970cd0d6a38f94b32703f51c312b");
//     static readonly nftPolicyId = SDK.Bytes.fromHex("e0302560ced2fdcbfcb2602697df970cd0d6a38f94b32703f51c312b");

//     constructor({ txIn, value, datum, contractAddr }: BasicPoolConstructor) {
//       this.txIn = txIn;
//       this.value = value;
//       this.datum = datum;
//       this.contractAddr = contractAddr;
//     }

//     get protocol(): Protocol {
//       return Protocol.SundaeswapAmmV3;
//     }

//     get lpAsset(): SDK.Asset {
//       return BasicPool.getLpAssetByPoolIdent(this.ident);
//     }

//     get ident(): SDK.Bytes {
//       return this.datum.ident;
//     }

//     get assetA(): SDK.Asset {
//       return this.datum.assetA;
//     }

//     get assetB(): SDK.Asset {
//       return this.datum.assetB;
//     }

//     get reserveA(): bigint {
//       if (this.datum.assetA.isAda()) {
//         return this.value.get(this.datum.assetA) - this.datum.protocolFee;
//       }
//       return this.value.get(this.datum.assetA);
//     }

//     get reserveB(): bigint {
//       if (this.datum.assetB.isAda()) {
//         return this.value.get(this.datum.assetB) - this.datum.protocolFee;
//       }
//       return this.value.get(this.datum.assetB);
//     }

//     get liquidity(): bigint {
//       return this.datum.liquidity;
//     }

//     get tradingFeePercentageA(): RationalBigInt {
//       return new RationalBigInt({ num: this.datum.bidFee, den: BasicPool.feeDenominator });
//     }

//     get tradingFeePercentageB(): RationalBigInt {
//       return new RationalBigInt({ num: this.datum.askFee, den: BasicPool.feeDenominator });
//     }

//     /**
//      * CIP-68 (333) token.
//      * @param ident Pool's ID.
//      * @returns Pool lpAsset.
//      */
//     static getLpAssetByPoolIdent(ident: SDK.Bytes): SDK.Asset {
//       try {
//         return new SDK.Asset(Pool.nftPolicyId, SDK.Bytes.fromNumberArr([0x00, 0x14, 0xdf, 0x10]).concat(ident));
//       } catch {
//         throw new Error("SundaeswapAmmV3: Invalid pool ident.");
//       }
//     }
//   }

//   export class PoolState extends BasicPool implements IPoolState {
//     get batcherFee(): bigint {
//       return 1_280_000n;
//     }

//     get depositAda(): bigint {
//       return Order.depositAda;
//     }

//     get datumJson(): string {
//       return JSONBig.stringify(this.datum);
//     }

//     static parseUtxo(scriptHash: SDK.Bytes, rawDatum: string, utxo: SDK.Utxo): PoolState[] {
//       if (!scriptHash.equals(PoolState.scriptHash)) {
//         return [];
//       }

//       try {
//         const output = utxo.output;
//         invariant(SDK.Maybe.isJust(output.datumSource), "Pool is missing datum hash.");

//         const value = output.value;
//         invariant(value.hasPolicyID(Pool.nftPolicyId), `Pool is missing nft token.`);

//         return [
//           new PoolState({
//             value: value,
//             txIn: utxo.input,
//             contractAddr: output.address,
//             datum: PoolDatum.fromDataHex(rawDatum),
//           }),
//         ];
//       } catch (err) {
//         throw new Error(`SundaeswapAmmV3: Failed to parse pool state from UTxO Pool:
//           utxo: ${JSONBig.stringify(utxo)}
//           rawDatum: ${rawDatum}
//           error: ${err}
//         `);
//       }
//     }
//   }

//   export type PoolConstructor = {
//     txIn: SDK.TxIn;
//     value: SDK.Value;
//     datum: PoolDatum;
//     redeemer?: PoolRedeemer;
//     contractAddr: SDK.Address;
//   };

//   export class Pool extends BasicPool implements IPool {
//     readonly redeemer?: PoolRedeemer;

//     constructor({ txIn, value, datum, redeemer, contractAddr }: PoolConstructor) {
//       super({ txIn, value, datum, contractAddr });
//       this.redeemer = redeemer;
//     }

//     get prices(): PoolPrice {
//       if (this.reserveB === 0n) {
//         return { a: 0, b: 0 };
//       }
//       const priceB = Number(this.reserveA) / Number(this.reserveB);
//       if (priceB === 0) {
//         return { a: 0, b: 0 };
//       }
//       return { a: 1 / priceB, b: priceB };
//     }

//     // CIP-68 (222) token.
//     get factoryAsset(): SDK.Asset {
//       return new SDK.Asset(
//         Pool.nftPolicyId,
//         SDK.Bytes.fromNumberArr([0x00, 0x0d, 0xe1, 0x40]).concat(this.datum.ident),
//       );
//     }

//     /**
//      * Note that the liquidity provider fee to charge for bid (A -> B) or ask (B -> A) orders.
//      * @return bid fee numerator and ask fee numerator.
//      */
//     get tradingFeePercentages(): PoolFeePercentage {
//       return {
//         a: this.tradingFeePercentageA.toNumber(),
//         b: this.tradingFeePercentageB.toNumber(),
//       };
//     }

//     get lpFeePercentages(): PoolFeePercentage {
//       return {
//         a: this.tradingFeePercentageA.toNumber(),
//         b: this.tradingFeePercentageB.toNumber(),
//       };
//     }

//     get protocolFeePercentages(): PoolFeePercentage {
//       return { a: 0, b: 0 };
//     }

//     clone(): Pool {
//       return new Pool({
//         txIn: this.txIn,
//         redeemer: this.redeemer,
//         value: this.value.clone(),
//         contractAddr: this.contractAddr,
//         datum: PoolDatum.clone(this.datum),
//       });
//     }

//     /**
//      * SWAP.
//      * Reference: https://github.com/SundaeSwap-finance/sundae-contracts/blob/8d01af5123b82eac5031324c1190ada665f06e50/lib/calculation/swap.ak
//      * The liquidity provider fee to charge for bid (A -> B) or ask (B -> A) orders
//      */
//     calculateSwapExactIn(params: {
//       amountIn: bigint;
//       reserveIn: bigint;
//       reserveOut: bigint;
//       direction: SwapDirection;
//     }): bigint {
//       const { num: tradingFeeNumerator, den: tradingFeeDenominator } =
//         params.direction === SwapDirection.A_TO_B ? this.tradingFeePercentageA : this.tradingFeePercentageB;
//       const diff = tradingFeeDenominator - tradingFeeNumerator;
//       const inWithFee = diff * params.amountIn;
//       const numerator = params.reserveOut * inWithFee;
//       const denominator = tradingFeeDenominator * params.reserveIn + inWithFee;
//       return numerator / denominator;
//     }

//     calculateFees(
//       swapAmount: bigint,
//       direction: SwapDirection,
//     ): { tradingFees: bigint; lpFees: bigint; protocolFees: bigint } {
//       const { num: tradingFeeNumerator, den: tradingFeeDenominator } =
//         direction === SwapDirection.A_TO_B ? this.tradingFeePercentageA : this.tradingFeePercentageB;
//       const { num: lpFeeNumerator, den: lpFeeDenominator } =
//         direction === SwapDirection.A_TO_B ? this.tradingFeePercentageA : this.tradingFeePercentageB;
//       const tradingFees = (swapAmount * tradingFeeNumerator) / tradingFeeDenominator;
//       const lpFees = (swapAmount * lpFeeNumerator) / lpFeeDenominator;
//       return {
//         tradingFees: tradingFees,
//         lpFees: lpFees,
//         protocolFees: tradingFees - lpFees,
//       };
//     }

//     /**
//      * WITHDRAW.
//      * Reference: https://github.com/SundaeSwap-finance/sundae-contracts/blob/8d01af5123b82eac5031324c1190ada665f06e50/lib/calculation/withdrawal.ak
//      */
//     calculateWithdraw(lpAmount: bigint): { amountA: bigint; amountB: bigint } {
//       const amountA = (lpAmount * this.reserveA) / this.liquidity;
//       const amountB = (lpAmount * this.reserveB) / this.liquidity;
//       return {
//         amountA: amountA,
//         amountB: amountB,
//       };
//     }

//     /**
//      * DEPOSIT.
//      * Reference: https://github.com/SundaeSwap-finance/sundae-contracts/blob/8d01af5123b82eac5031324c1190ada665f06e50/lib/calculation/deposit.ak
//      */
//     calculateDeposit(params: {
//       amountA: bigint;
//       amountB: bigint;
//     }): {
//       lpAmount: bigint;
//       deposited: [bigint, bigint];
//     } {
//       const { amountA, amountB } = params;
//       const bInUnitOfA = (amountB * this.reserveA) / this.reserveB;
//       let depositedA: bigint = amountA;
//       let depositedB: bigint = amountB;
//       if (bInUnitOfA > amountA) {
//         depositedB = SDK.bigDivCeil(this.reserveB * amountA, this.reserveA);
//       } else {
//         depositedA = bInUnitOfA;
//       }

//       return {
//         lpAmount: (depositedA * this.liquidity) / this.reserveA,
//         deposited: [depositedA, depositedB],
//       };
//     }

//     static fromUtxo(utxo: SDK.Utxo, rawDatum: string, redeemer?: SDK.Bytes): Pool {
//       try {
//         const output = utxo.output;
//         invariant(SDK.Maybe.isJust(output.datumSource), "Pool is missing datum hash.");

//         const value = output.value;
//         invariant(value.hasPolicyID(Pool.nftPolicyId), `Pool is missing nft token.`);

//         return new Pool({
//           value: value,
//           txIn: utxo.input,
//           contractAddr: output.address,
//           datum: PoolDatum.fromDataHex(rawDatum),
//           redeemer: redeemer ? PoolRedeemer.fromCborHex(redeemer.hex) : undefined,
//         });
//       } catch (err) {
//         throw new Error(`SundaeswapAmmV3: Failed to parse pool from UTxO Pool:
//           utxo: ${JSONBig.stringify(utxo)}
//           rawDatum: ${rawDatum}
//           error: ${err}
//         `);
//       }
//     }
//   }

//   // MARK: SETTINGS
//   export type SettingDatum = {
//     settingAdmin: MultisigScript;
//     metadataAdmin: SDK.Address;
//     treasuryAdmin: MultisigScript;
//     treasuryAddress: SDK.Address;
//     treasuryAllowance: [bigint, bigint];
//     authorizedScooper: SDK.Maybe<SDK.Bytes[]>; // List of VerificationKey
//     authorizedStakingKeys: SDK.Credential[];
//     // all of the following fees are in lovelace unit
//     baseFee: bigint;
//     simpleFee: bigint;
//     strategyFee: bigint;
//     poolCreationFee: bigint;
//     extension: number;
//   };

//   export namespace SettingDatum {
//     export const nftTokenName: SDK.Bytes = SDK.Bytes.fromString("settings");
//     export const scriptHash: SDK.Bytes = SDK.Bytes.fromHex("6d9d7acac59a4469ec52bb207106167c5cbfa689008ffa6ee92acc50");

//     export function fromPlutusJson(data: SDK.PlutusData): SettingDatum {
//       const { fields } = SDK.PlutusConstr.unwrap(data, {
//         [0]: 12,
//       });
//       const treasuryAllowanceParts = SDK.PlutusList.unwrap(fields[4]);
//       const authorizedScooper = SDK.Maybe.map(SDK.PlutusMaybe.unwrap(fields[5]), (d) => {
//         const verificationKeyList = SDK.PlutusList.unwrap(d);
//         const verificationKeys = verificationKeyList.map((k) => SDK.PlutusBytes.unwrap(k));
//         return verificationKeys;
//       });
//       const authorizedStakingKeyList = SDK.PlutusList.unwrap(fields[6]);
//       const authorizedStakingKey = authorizedStakingKeyList.map((k) => {
//         return SDK.Credential.fromPlutusJson(k);
//       });
//       return {
//         settingAdmin: MultisigDatum.fromPlutusJson(fields[0]),
//         metadataAdmin: SDK.Address.fromPlutusJson(fields[1]),
//         treasuryAdmin: MultisigDatum.fromPlutusJson(fields[2]),
//         treasuryAddress: SDK.Address.fromPlutusJson(fields[3]),
//         treasuryAllowance: [
//           SDK.PlutusInt.unwrapToBigInt(treasuryAllowanceParts[0]),
//           SDK.PlutusInt.unwrapToBigInt(treasuryAllowanceParts[1]),
//         ],
//         authorizedScooper: authorizedScooper,
//         authorizedStakingKeys: authorizedStakingKey,
//         baseFee: SDK.PlutusInt.unwrapToBigInt(fields[7]),
//         simpleFee: SDK.PlutusInt.unwrapToBigInt(fields[8]),
//         strategyFee: SDK.PlutusInt.unwrapToBigInt(fields[9]),
//         poolCreationFee: SDK.PlutusInt.unwrapToBigInt(fields[10]),
//         extension: SDK.PlutusInt.unwrapToNumber(fields[11]),
//       };
//     }

//     export function fromDataHex(data: SDK.CborHex<OrderDatum>): SettingDatum {
//       const plutusData = SDK.PlutusData.fromDataHex(data);
//       return fromPlutusJson(plutusData);
//     }

//     export function fromUtxo(utxo: SDK.Utxo, rawDatum: string): SettingDatum {
//       try {
//         const output = utxo.output;
//         invariant(SDK.Maybe.isJust(output.datumSource), "SundaeswapAmmV3: Global Setting is missing datum hash.");

//         const value = output.value;
//         const hasSettingNft = value.assets().find((a) => a.tokenName.equals(SettingDatum.nftTokenName));
//         invariant(hasSettingNft, `SundaeswapAmmV3: Global Setting is missing setting nft token.`);

//         return SettingDatum.fromDataHex(rawDatum);
//       } catch (err) {
//         throw new Error(`SundaeswapAmmV3: Failed to parse order from UTxO Global Setting:
//           utxo: ${JSONBig.stringify(utxo)}
//           rawDatum: ${rawDatum}
//           error: ${err}
//         `);
//       }
//     }
//   }

//   // MARK: PARSER
//   export class Parser {
//     private readonly mapLpAssetToPair: Map<string, SDK.Asset[]>;

//     constructor(mapLpAssetToPair: Map<string, SDK.Asset[]>) {
//       this.mapLpAssetToPair = mapLpAssetToPair;
//     }

//     parseUtxo({
//       scriptHash,
//       rawDatum,
//       utxo,
//       redeemer,
//       messageMetadata,
//     }: ParseUtxoParams): ParseUtxoResult<Pool, Order> {
//       const pools: Pool[] = [];
//       if (scriptHash.equals(Pool.scriptHash)) {
//         pools.push(Pool.fromUtxo(utxo, rawDatum, redeemer));
//       }

//       const orders: Order[] = [];
//       if (scriptHash.equals(Order.scriptHash)) {
//         const draftOrderDatum = OrderDatum.fromCborHex(rawDatum);
//         try {
//           const lpAsset = Pool.getLpAssetByPoolIdent(draftOrderDatum.poolIdent);
//           const pair = this.mapLpAssetToPair.get(lpAsset.toString());
//           if (pair) {
//             orders.push(Order.fromUtxo(utxo, rawDatum, pair, messageMetadata.aggrSource));
//           } else {
//             throw new Error(
//               `SundaeswapAmmV3: cannot find pool creation for LP Asset ${lpAsset.toString()}, tx: ${SDK.TxIn.toString(utxo.input)}`,
//             );
//           }
//         } catch (error) {
//           throw new Error(`SundaeswapAmmV3: cannot parse order utxo, error: ${error}`);
//         }
//       }

//       return {
//         pools: pools,
//         orders: orders,
//       };
//     }

//     private static applySwapExactIn(
//       orderIn: Order,
//       txIn: SDK.TxIn,
//       poolIn: Pool,
//       blockId: bigint,
//       blockDate: Date,
//     ): {
//       tx: DexAggrTx;
//       poolOut: Pool;
//     } {
//       const orderDatum = orderIn.datum;
//       invariant(orderDatum.type === OrderDatumType.Swap, "Invalid order datum type. Expected type: Swap.");

//       let amountA = 0n;
//       let amountB = 0n;
//       let tradingFeeA = 0n;
//       let tradingFeeB = 0n;
//       let lpFeeA = 0n;
//       let lpFeeB = 0n;
//       let protocolFeeA = 0n;
//       let protocolFeeB = 0n;
//       const poolOutValue = poolIn.value.clone();

//       if (orderDatum.offer.asset.equals(poolIn.assetA)) {
//         amountA = orderDatum.offer.amount;
//         amountB = poolIn.calculateSwapExactIn({
//           amountIn: amountA,
//           reserveIn: poolIn.reserveA,
//           reserveOut: poolIn.reserveB,
//           direction: SwapDirection.A_TO_B,
//         });
//         poolOutValue.add(poolIn.assetA, amountA).subtract(poolIn.assetB, amountB);

//         const poolFees = poolIn.calculateFees(amountA, SwapDirection.A_TO_B);
//         tradingFeeA = poolFees.tradingFees;
//         lpFeeA = poolFees.lpFees;
//         protocolFeeA = poolFees.protocolFees;
//       } else {
//         amountB = orderDatum.offer.amount;
//         amountA = poolIn.calculateSwapExactIn({
//           amountIn: amountB,
//           reserveIn: poolIn.reserveB,
//           reserveOut: poolIn.reserveA,
//           direction: SwapDirection.B_TO_A,
//         });
//         poolOutValue.subtract(poolIn.assetA, amountA).add(poolIn.assetB, amountB);

//         const poolFees = poolIn.calculateFees(amountB, SwapDirection.B_TO_A);
//         tradingFeeB = poolFees.tradingFees;
//         lpFeeB = poolFees.lpFees;
//         protocolFeeB = poolFees.protocolFees;
//       }
//       const poolOut = new Pool({
//         txIn: txIn,
//         value: poolOutValue,
//         datum: poolIn.datum,
//         contractAddr: poolIn.contractAddr,
//       });

//       return {
//         poolOut: poolOut,
//         tx: {
//           type: DexAggrTxType.SingleBatchOrder,
//           blockId: blockId,
//           blockTimestamp: blockDate,
//           poolIn: poolIn,
//           poolOut: poolOut,
//           orderIn: orderIn,
//           orderOut: {
//             amountA: amountA,
//             amountB: amountB,
//             lpAmount: 0n,
//           },
//           volumes: [amountA, amountB],
//           tradingFees: [tradingFeeA, tradingFeeB],
//           lpFees: [lpFeeA, lpFeeB],
//           protocolFees: [protocolFeeA, protocolFeeB],
//         },
//       };
//     }

//     private static applyDeposit(
//       orderIn: Order,
//       txIn: SDK.TxIn,
//       poolIn: Pool,
//       blockId: bigint,
//       blockDate: Date,
//       fee: bigint,
//     ): {
//       tx: DexAggrTx;
//       poolOut: Pool;
//     } {
//       invariant(
//         orderIn.datum.type === OrderDatumType.Deposit,
//         "SundaeSwapAmmV3: Invalid order datum type. Expected type: Deposit.",
//       );
//       const valuesWithoutFees = orderIn.valueWithoutFees;

//       const assetAmountA = orderIn.datum.amountA;
//       const datumAmountA = assetAmountA.amount;
//       const assetAmountB = orderIn.datum.amountB;
//       const datumAmountB = assetAmountB.amount;
//       const valueAWithoutFees = valuesWithoutFees.get(assetAmountA.asset);

//       let amountAIn = datumAmountA;
//       const amountBIn = datumAmountB;
//       if (assetAmountA.asset.isAda()) {
//         amountAIn = valueAWithoutFees - fee > datumAmountA ? datumAmountA : valueAWithoutFees - fee;
//       }

//       const { lpAmount, deposited } = poolIn.calculateDeposit({
//         amountA: amountAIn,
//         amountB: amountBIn,
//       });

//       const poolOut = new Pool({
//         txIn: txIn,
//         value: poolIn.value.add(poolIn.assetA, deposited[0]).add(poolIn.assetB, deposited[1]),
//         datum: {
//           ...poolIn.datum,
//           liquidity: poolIn.liquidity + lpAmount,
//         },
//         contractAddr: poolIn.contractAddr,
//       });

//       return {
//         poolOut: poolOut,
//         tx: {
//           type: DexAggrTxType.SingleBatchOrder,
//           blockId: blockId,
//           blockTimestamp: blockDate,
//           poolIn: poolIn,
//           poolOut: poolOut,
//           orderIn: orderIn,
//           orderOut: {
//             amountA: deposited[0],
//             amountB: deposited[1],
//             lpAmount: lpAmount,
//           },
//           volumes: [0n, 0n],
//           tradingFees: [0n, 0n],
//           lpFees: [0n, 0n],
//           protocolFees: [0n, 0n],
//         },
//       };
//     }

//     private static applyWithdraw(
//       orderIn: Order,
//       txIn: SDK.TxIn,
//       poolIn: Pool,
//       blockId: bigint,
//       blockDate: Date,
//     ): {
//       tx: DexAggrTx;
//       poolOut: Pool;
//     } {
//       const orderDatum = orderIn.datum;
//       invariant(
//         orderDatum.type === OrderDatumType.Withdraw,
//         "SundaeswapAmmV3: Invalid order datum type. Expected type: Withdraw.",
//       );

//       const { amountA, amountB } = poolIn.calculateWithdraw(orderDatum.lpAssetAmount.amount);
//       const poolOut = new Pool({
//         txIn: txIn,
//         value: poolIn.value.clone().subtract(poolIn.assetA, amountA).subtract(poolIn.assetB, amountB).trim(),
//         datum: {
//           ...poolIn.datum,
//           liquidity: poolIn.datum.liquidity - orderDatum.lpAssetAmount.amount,
//         },
//         contractAddr: poolIn.contractAddr,
//       });

//       return {
//         poolOut: poolOut,
//         tx: {
//           type: DexAggrTxType.SingleBatchOrder,
//           blockId: blockId,
//           blockTimestamp: blockDate,
//           poolIn: poolIn,
//           poolOut: poolOut,
//           orderIn: orderIn,
//           orderOut: {
//             amountA: amountA,
//             amountB: amountB,
//             lpAmount: orderDatum.lpAssetAmount.amount,
//           },
//           volumes: [0n, 0n],
//           tradingFees: [0n, 0n],
//           lpFees: [0n, 0n],
//           protocolFees: [0n, 0n],
//         },
//       };
//     }

//     static parseTx(
//       txId: string,
//       mint: SDK.Value,
//       blockId: bigint,
//       blockTimestamp: Date,
//       inputs: SDK.TxIn[],
//       parseInputResult: ParseUtxoResult<Pool, Order>,
//       parseOutputResult: ParseUtxoResult<Pool, Order>,
//       settingDatum: SettingDatum | null,
//     ): DexAggrTx[] {
//       const { pools: poolInputs, orders: orderInputs } = parseInputResult;
//       const { pools: poolOutputs, orders: orderOutputs } = parseOutputResult;

//       if (
//         poolInputs.length === 0 &&
//         orderInputs.length === 0 &&
//         poolOutputs.length === 0 &&
//         orderOutputs.length === 0
//       ) {
//         return [];
//       }

//       const dexAggrTxs: DexAggrTx[] = [];

//       if (poolOutputs.length === 1 && mint.has(poolOutputs[0].factoryAsset)) {
//         return [
//           {
//             type: DexAggrTxType.CreatePool,
//             blockId: blockId,
//             blockTimestamp: blockTimestamp,
//             pool: poolOutputs[0],
//           },
//         ];
//       }

//       let baseFee = 0n;
//       let simpleFee = 0n;
//       if (settingDatum) {
//         baseFee = settingDatum.baseFee;
//         simpleFee = settingDatum.simpleFee;
//       }

//       if (orderOutputs.length > 0) {
//         dexAggrTxs.push({
//           type: DexAggrTxType.CreateOrder,
//           blockId: blockId,
//           blockTimestamp: blockTimestamp,
//           orders: orderOutputs,
//         });
//       }

//       if (poolInputs.length === 1 && poolOutputs.length === 1) {
//         const poolInRedeemer = poolInputs[0].redeemer;
//         invariant(poolInRedeemer, "SundaeswapAmmV3: Missing redeemer for pool input.");

//         let sortedOrders: Order[] = [];
//         if (poolInRedeemer) {
//           if (poolInRedeemer.type === PoolSpendRedeemerType.Scoop) {
//             const indexes = poolInRedeemer.inputOrder.map((o) => o[0]);
//             for (const i of indexes) {
//               const orderIn = orderInputs.find((o) => {
//                 const txIn = inputs[i];
//                 return SDK.TxIn.equals(o.txIn, txIn);
//               });
//               invariant(orderIn, "SundaeswapAmmV3: Cannot find matching order input.");
//               sortedOrders.push(orderIn);
//             }
//           } else {
//             sortedOrders = orderInputs.sort((a, b) => SDK.TxIn.compare(a.txIn, b.txIn));
//           }
//         }
//         let poolInput = poolInputs[0];
//         if (sortedOrders.length > 0) {
//           for (const i in sortedOrders) {
//             const orderIn = sortedOrders[i];
//             invariant(orderIn, "Can not find orderIn by txIn.");
//             const txIn: SDK.TxIn = {
//               txId: SDK.Bytes.fromHex(txId),
//               index: Number(i),
//             };

//             switch (orderIn.datum.type) {
//               case OrderDatumType.Swap: {
//                 const result = Parser.applySwapExactIn(orderIn, txIn, poolInput, blockId, blockTimestamp);
//                 poolInput = result.poolOut.clone();
//                 dexAggrTxs.push(result.tx);
//                 break;
//               }
//               case OrderDatumType.Deposit: {
//                 const realOrderCount = BigInt(orderInputs.length);
//                 // the base fee split by the number of orders, paid for each user
//                 const amortizedBaseFee = (baseFee + realOrderCount - 1n) / realOrderCount;
//                 const fee = amortizedBaseFee + simpleFee;
//                 const result = Parser.applyDeposit(orderIn, txIn, poolInput, blockId, blockTimestamp, fee);
//                 poolInput = result.poolOut.clone();
//                 dexAggrTxs.push(result.tx);
//                 break;
//               }
//               case OrderDatumType.Withdraw: {
//                 const result = Parser.applyWithdraw(orderIn, txIn, poolInput, blockId, blockTimestamp);
//                 poolInput = result.poolOut.clone();
//                 dexAggrTxs.push(result.tx);
//                 break;
//               }
//             }
//           }
//         } else {
//           dexAggrTxs.push({
//             type: DexAggrTxType.SettingPool,
//             blockId: blockId,
//             blockTimestamp: blockTimestamp,
//             pool: poolOutputs[0],
//           });
//         }
//       } else if (orderInputs.length > 0) {
//         dexAggrTxs.push({
//           type: DexAggrTxType.CancelOrder,
//           blockId: blockId,
//           blockTimestamp: blockTimestamp,
//           orders: orderInputs,
//         });
//       }

//       return dexAggrTxs;
//     }
//   }
// }
