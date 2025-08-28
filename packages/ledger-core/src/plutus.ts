import type { CborHex, CSLNativeScript, CSLPlutusScript } from "@repo/ledger-utils";
import type { Address, RewardAddress } from "./address";
import type { Asset } from "./asset";
import type { PlutusData } from "./plutus-json";
import type { ExUnit } from "./redeemer";
import type { Utxo } from "./utxo";
import type { Value } from "./value";

export enum PlutusUsageType {
  SPEND = 0,
  MINT = 1,
  CERT = 2,
  REWARD = 3,
}

export type PlutusSpend = {
  type: PlutusUsageType.SPEND;
  utxo: Utxo;
  script: CborHex<CSLPlutusScript>;
  datum: PlutusData;
  redeemer: PlutusData;
  exUnit: ExUnit;
};

export type PlutusMint = {
  type: PlutusUsageType.MINT;
  asset: Asset;
  amount: bigint;
  script: CborHex<CSLPlutusScript>;
  redeemer: PlutusData;
  exUnit: ExUnit;
};

export type PlutusSpendV2 = {
  type: PlutusUsageType.SPEND;
  utxo: Utxo;
  scriptInputRef: Utxo;
  datum?: PlutusData;
  redeemer: PlutusData;
  exUnit: ExUnit;
};

export type PlutusMintV2 = {
  type: PlutusUsageType.MINT;
  asset: Asset;
  amount: bigint;
  scriptInputRef: Utxo;
  redeemer: PlutusData;
  exUnit: ExUnit;
};

export type PlutusWithdrawalV2 = {
  type: PlutusUsageType.REWARD;
  stakeAddress: RewardAddress;
  amount: bigint;
  scriptInputRef: Utxo;
  redeemer: PlutusData;
  exUnit: ExUnit;
};

export type PlutusUsage = PlutusSpend | PlutusMint;
export type PlutusUsageV2 = PlutusSpendV2 | PlutusMintV2 | PlutusWithdrawalV2;

export type PlutusPay = {
  address: Address;
  value: Value;
  datum: PlutusData;
};

export type NativeScriptMint = {
  asset: Asset;
  amount: bigint;
  script: CborHex<CSLNativeScript>;
};

export type NativeScriptSpend = {
  utxo: Utxo;
  script: CborHex<CSLNativeScript>;
};

export type RewardsWithdrawal = {
  stakeAddress: RewardAddress;
  amount: bigint;
};

export type CIP25MetadataFile = {
  name: string;
  mediaType: string;
  src: string;
};

export type CIP25AssetMetadata = {
  name: string;
  mediaType?: string;
  image: string;
  files?: CIP25MetadataFile[];
};

export type CIP25AssetsMetadata = Record<string, CIP25AssetMetadata>;

export type CIP25NFTMetadata = Record<string, CIP25AssetsMetadata>;
