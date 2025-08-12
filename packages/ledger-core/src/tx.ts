import type { CborHex, CSLPlutusData, CSLPlutusScript, ECSLVotingProcedures, ECSLVotingProposals } from "@repo/ledger-utils";
import type { RewardAddress } from "./address";
import type { PublicKeyHash } from "./crypto";
import { DRep } from "./drep";
import type { NativeScript } from "./native-script";
import { Redeemer } from "./redeemer";
import type { StakeKeyDelegation } from "./stake-pool";
import { type TxOut, Utxo } from "./utxo";
import type { ValidityRange } from "./validity-range";
import { Value } from "./value";

export type NativeScriptValidator = {
  type: "Native";
  script: NativeScript;
};

export type PlutusScriptValidator = {
  type: "PlutusV1" | "PlutusV2" | "PlutusV3";
  script: CborHex<CSLPlutusScript>;
};

export type Validator = NativeScriptValidator | PlutusScriptValidator;

export type TxCollateral = {
  collaterals: Utxo[];
  collateralReturn?: TxOut;
};

export type VoteDelegation = {
  rewardAddress: RewardAddress;
  drep: DRep;
};

export type Certificates = {
  registrations: RewardAddress[];
  deregistration: RewardAddress[];
  delegations: StakeKeyDelegation[];
  voteDelegation: VoteDelegation[];
};

export type Withdrawals = Record<string, bigint>;

export type TxBody = {
  inputs: Utxo[];
  outputs: TxOut[];
  fee: bigint;
  mint: Value;
  withdrawals: Withdrawals;
  validity?: ValidityRange;
  collateral?: TxCollateral;
  referenceInputs: Utxo[];
  requireSigners: PublicKeyHash[];
  certificates?: Certificates;
  // TODO: Update later
  votingProcedures?: CborHex<ECSLVotingProcedures>;
  votingProposals?: CborHex<ECSLVotingProposals>;
  donation?: bigint;
  currentTreasuryValue?: bigint;
};

export type VKeyWitness = {
  vkey: string;
  signature: string;
};

export type RedeemerWithRef = Redeemer & {
  ref: string;
};

export type Witness = {
  vkeys: VKeyWitness[];
  nativeScripts: Record<string, NativeScriptValidator>;
  plutusScripts: Record<string, PlutusScriptValidator>;
  plutusData: Record<string, CborHex<CSLPlutusData>>;
  redeemers: RedeemerWithRef[];
};

export type Metadatum = Map<Metadatum, Metadatum> | Array<Metadatum> | number | Buffer | string;

export namespace Metadatum {
  // biome-ignore lint/complexity/noBannedTypes: it's legacy
  export function fromObject(obj: Object): Map<Metadatum, Metadatum> {
    const map = new Map<Metadatum, Metadatum>();
    for (const [k, v] of Object.entries(obj)) {
      map.set(k, v);
    }
    return map;
  }

  // biome-ignore lint/complexity/noBannedTypes: it's legacy
  export function fromArray(objs: Array<Object>): Array<Metadatum> {
    const arr: Array<Metadatum> = [];
    for (const obj of objs) {
      arr.push(fromObject(obj));
    }
    return arr;
  }
}

type MsgLabel = 674;
type NFTLabel = 721;
type MetadataLabel = MsgLabel | NFTLabel;
export type Metadata = Record<MetadataLabel, Map<Metadatum, Metadatum>>;

export namespace Metadata {
  export function isEmpty(metadata: Metadata): boolean {
    return metadata[674].size === 0 && metadata[721].size === 0;
  }
}

export type Transaction = {
  body: TxBody;
  witness: Witness;
  // biome-ignore lint/suspicious/noExplicitAny: it's legacy
  metadata: Record<string, any>;
  metadata2: Metadata;
};

export namespace Transaction {
  export function clone(tx: Transaction): Transaction {
    return {
      body: {
        inputs: tx.body.inputs.map(Utxo.clone),
        outputs: tx.body.outputs.map((o) => o.clone()),
        fee: tx.body.fee,
        mint: tx.body.mint.clone(),
        withdrawals: { ...tx.body.withdrawals },
        validity: tx.body.validity
          ? {
              validFrom: tx.body.validity.validFrom,
              validUntil: tx.body.validity.validUntil,
            }
          : undefined,
        referenceInputs: tx.body.referenceInputs.map(Utxo.clone),
        requireSigners: tx.body.requireSigners.map((s) => s.clone()),
        collateral: tx.body.collateral
          ? {
              collaterals: tx.body.collateral.collaterals.map(Utxo.clone),
              collateralReturn: tx.body.collateral.collateralReturn
                ? tx.body.collateral.collateralReturn.clone()
                : undefined,
            }
          : undefined,
        certificates: tx.body.certificates
          ? {
              registrations: tx.body.certificates.registrations.map((addr) => addr.clone()),
              deregistration: tx.body.certificates.deregistration.map((addr) => addr.clone()),
              delegations: tx.body.certificates.delegations.map((d) => ({
                stakeAddress: d.stakeAddress.clone(),
                stakePool: d.stakePool.clone(),
              })),
              voteDelegation: tx.body.certificates.voteDelegation.map((vd) => ({
                rewardAddress: vd.rewardAddress.clone(),
                drep: DRep.clone(vd.drep),
              })),
            }
          : undefined,
        votingProposals: tx.body.votingProposals,
        votingProcedures: tx.body.votingProcedures,
        donation: tx.body.donation,
        currentTreasuryValue: tx.body.currentTreasuryValue,
      },
      witness: {
        vkeys: tx.witness.vkeys.map((v) => ({
          vkey: v.vkey,
          signature: v.signature,
        })),
        nativeScripts: { ...tx.witness.nativeScripts },
        plutusScripts: { ...tx.witness.plutusScripts },
        plutusData: { ...tx.witness.plutusData },
        redeemers: tx.witness.redeemers.map((r) => ({
          ...Redeemer.clone(r),
          ref: r.ref,
        })),
      },
      metadata: { ...tx.metadata },
      metadata2: { ...tx.metadata2 },
    };
  }

  export function placeholder(): Transaction {
    return {
      body: {
        inputs: [],
        outputs: [],
        fee: 0n,
        mint: new Value(),
        withdrawals: {},
        validity: undefined,
        referenceInputs: [],
        requireSigners: [],
        collateral: undefined,
        certificates: undefined,
        votingProposals: undefined,
        votingProcedures: undefined,
        donation: undefined,
        currentTreasuryValue: undefined,
      },
      witness: {
        vkeys: [],
        nativeScripts: {},
        plutusScripts: {},
        plutusData: {},
        redeemers: [],
      },
      metadata: {},
      metadata2: { 674: new Map(), 721: new Map() },
    };
  }
}
