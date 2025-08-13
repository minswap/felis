import {
  type Address,
  Bytes,
  CredentialType,
  type NativeScriptMint,
  type NetworkEnvironment,
  type PlutusMint,
  type PlutusSpend,
  Transaction,
  TxIn,
  TxOut,
  type Utxo,
} from "@repo/ledger-core";
import type {
  CborHex,
  CSLEd25519KeyHash,
  CSLNativeScript,
  CSLPlutusData,
  CSLPlutusScript,
  CSLRedeemer,
  CSLTransaction,
  CSLTransactionInput,
  CSLTransactionOutput,
  CSLTransactionUnspentOutput,
} from "@repo/ledger-utils";
import { Maybe } from "@repo/ledger-utils";

export interface CoverForFeesResult {
  finalCoins: TxOut[];
  finalNativeTokens: TxOut[];
  finalFee: bigint;
}

export class SplitChangeOutError extends Error {
  additionalAdaRequired: bigint;
  constructor(additionalAdaRequired: bigint) {
    super(`require ${additionalAdaRequired} more ADA`);
    this.additionalAdaRequired = additionalAdaRequired;
  }
}

export type SplitChangeOutResult = {
  coins: TxOut[];
  nativeTokens: TxOut[];
};

export type ScriptOrRef = { inlineScript: CSLPlutusScript } | { referenceScript: CSLPlutusScript };

export type TxDraft = Transaction & {
  plutusScripts: Record<string, ScriptOrRef>;
  nativeScripts: Record<string, CSLNativeScript>;
};

export type UtxoState = {
  changeUtxos: Utxo[];
  scriptUtxos: Utxo[];
  pubKeyUtxos: Utxo[];
};

export namespace TxDraft {
  export function clone(tx: TxDraft): TxDraft {
    return {
      ...Transaction.clone(tx),
      plutusScripts: { ...tx.plutusScripts },
      nativeScripts: { ...tx.nativeScripts },
    };
  }

  export function extractUtxoState({
    txId,
    txDraft,
    changeAddress,
    walletUtxos,
  }: {
    txId: string;
    txDraft: TxDraft;
    changeAddress: Address;
    walletUtxos: Utxo[];
  }): UtxoState {
    const txIdByte = Bytes.fromHex(txId);
    const state: UtxoState = {
      changeUtxos: [],
      scriptUtxos: [],
      pubKeyUtxos: [],
    };
    for (let i = 0; i < txDraft.body.outputs.length; i++) {
      const txIn: TxIn = {
        txId: txIdByte,
        index: i,
      };
      const output = txDraft.body.outputs[i];
      const addr = output.address;
      if (addr.equals(changeAddress)) {
        state.changeUtxos.push({
          input: txIn,
          output: output,
        });
        continue;
      }

      const paymentCredential = addr.toPaymentCredential();
      if (Maybe.isNothing(paymentCredential)) {
        // Byron address
        state.pubKeyUtxos.push({
          input: txIn,
          output: output,
        });
        continue;
      }
      if (paymentCredential.type === CredentialType.SCRIPT_CREDENTIAL) {
        state.scriptUtxos.push({
          input: txIn,
          output: output,
        });
        continue;
      } else {
        // Shelley address
        state.pubKeyUtxos.push({
          input: txIn,
          output: output,
        });
        continue;
      }
    }

    const usedInputSet = new Set<string>();
    for (const utxo of txDraft.body.inputs) {
      usedInputSet.add(TxIn.toString(utxo.input));
    }
    const unusedWalletUtxos = walletUtxos.filter((utxo) => !usedInputSet.has(TxIn.toString(utxo.input)));
    state.changeUtxos.push(...unusedWalletUtxos);
    return state;
  }

  export function placeholder(): TxDraft {
    return {
      ...Transaction.placeholder(),
      plutusScripts: {},
      nativeScripts: {},
    };
  }
}

export enum CoinSelectionAlgorithm {
  MINSWAP = "MINSWAP",
  SPEND_ALL = "SPEND_ALL",
  MINWALLET_SEND_ALL = "MINWALLET_SEND_ALL",
  SPEND_ALL_V2 = "SPEND_ALL_V2",
}

export type DebugPlutusSpend = Omit<PlutusSpend, "utxo" | "datum" | "redeemer" | "exUnit"> & {
  utxo: CborHex<CSLTransactionUnspentOutput>;
  datum: CborHex<CSLPlutusData>;
  redeemer: CborHex<CSLRedeemer>;
  exUnit: {
    memory: string;
    step: string;
  };
};

export type DebugPlutusMint = Omit<PlutusMint, "amount" | "asset" | "redeemer" | "exUnit"> & {
  amount: string;
  asset: string;
  redeemer: CborHex<CSLRedeemer>;
  exUnit: {
    memory: string;
    step: string;
  };
};

export type DebugNativeScriptMint = Omit<NativeScriptMint, "asset" | "amount"> & {
  asset: string;
  amount: string;
};

export type DebugInfo = {
  // Inputs added by pays and paysToScript methods
  forcedInputs: CborHex<CSLTransactionInput>[];
  // Above inputs and inputs selected by selectInputs method
  allInputs: CborHex<CSLTransactionInput>[];
  collateralInputs: CborHex<CSLTransactionInput>[];
  outputs: CborHex<CSLTransactionOutput>[];
  plutusSpends: DebugPlutusSpend[];
  plutusMints: DebugPlutusMint[];
  nativeScriptMints: DebugNativeScriptMint[];
  requiredSigners: CborHex<CSLEd25519KeyHash>[];
  networkEnvironment: NetworkEnvironment;
  metadata: Record<number, unknown>;
  txFee: { calculatedFee: string; cslFee: string } | null;
  validFrom: number | null;
  validUntil: number | null;
  coinSelectionAlgorithm: CoinSelectionAlgorithm;
  splitChange: boolean;
  changeOuts: CborHex<CSLTransactionOutput>[];
  builtTx: CborHex<CSLTransaction> | undefined;
};
