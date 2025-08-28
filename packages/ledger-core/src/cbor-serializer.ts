import invariant from "@minswap/tiny-invariant";
import { blake2b256, Maybe, RustModule, safeFreeRustObjects } from "@repo/ledger-utils";
import * as cbors from "@stricahq/cbors";
import BigNumber from "bignumber.js";
import * as cbor from "cbor";
import { RewardAddress } from "./address";
import { ADA } from "./asset";
import { Bytes } from "./bytes";
import type { CredentialType } from "./cardano-address";
import type { NativeScript, NativeScriptPubKeyHash } from "./native-script";
import { PlutusData, type PlutusList, type PreEncodedPlutusData } from "./plutus-json";
import { PlutusVersion } from "./plutus-version";
import type { CostModels } from "./protocol-parameters";
import { Redeemer } from "./redeemer";
import type { Certificates, Metadata, TxBody, VKeyWitness, Withdrawals, Witness } from "./tx";
import { DatumSourceType, type TxIn, type TxOut, Utxo } from "./utxo";
import type { Value } from "./value";

enum TransactionBodyItemType {
  INPUTS = 0,
  OUTPUTS = 1,
  FEE = 2,
  TTL = 3,
  CERTIFICATES = 4,
  WITHDRAWALS = 5,
  AUXILIARY_DATA_HASH = 7,
  VALIDITY_INTERVAL_START = 8,
  MINT = 9,
  SCRIPT_DATA_HASH = 11,
  COLLATERAL_INPUTS = 13,
  REQUIRED_SIGNERS = 14,
  NETWORK_ID = 15,
  COLLATERAL_OUTPUT = 16,
  TOTAL_COLLATERAL = 17,
  REFERENCE_INPUTS = 18,
}

type EncodedTxBody = Map<TransactionBodyItemType, unknown>;

enum OutputItemType {
  ADDRESS = 0,
  VALUE = 1,
  DATUM_OPTION = 2,
  SCRIPT_REF = 3,
}

type EncodedInput = [Buffer, number]; // number is trx index
type EncodedTokens = Map<Buffer, Map<Buffer, BigNumber>>;
type EncodedValue = BigNumber | [BigNumber, EncodedTokens];
type EncodedAlonzoDatumOption = Buffer;
type EncodedBabbageDatumOption = [0, Buffer] | [1, cbors.CborTag];
type EncodedAlonzoOutput = (Buffer | EncodedValue | EncodedAlonzoDatumOption)[];
type EncodedBabbageOutput = Map<OutputItemType, Buffer | EncodedValue | EncodedBabbageDatumOption | cbors.CborTag>;
type EncodedOutput = EncodedAlonzoOutput | EncodedBabbageOutput;
type EncodedWithdrawals = Map<Buffer, BigNumber>;
type EncodedStakeCredential = [CredentialType, Buffer];
type EncodedStakeRegistrationCertificate = [0, EncodedStakeCredential];
type EncodedStakeDeRegistrationCertificate = [1, EncodedStakeCredential];
type EncodedStakeDelegationCertificate = [2, EncodedStakeCredential, Buffer];
type EncodedCertificate =
  | EncodedStakeRegistrationCertificate
  | EncodedStakeDeRegistrationCertificate
  | EncodedStakeDelegationCertificate;

type EncodedVKeyWitness = [Buffer, Buffer];

// NativeScript types
type EncodedNativeScriptPubKeyHash = [0, Buffer];
type EncodedNativeScriptAll = [1, EncodedNativeScript[]];
type EncodedNativeScriptAny = [2, EncodedNativeScript[]];
type EncodedNativeScriptNOfK = [3, number, EncodedNativeScript[]];
type EncodedNativeScriptInvalidBefore = [4, number];
type EncodedNativeScriptInvalidAfter = [5, number];

type EncodedNativeScript =
  | EncodedNativeScriptPubKeyHash
  | EncodedNativeScriptAll
  | EncodedNativeScriptAny
  | EncodedNativeScriptNOfK
  | EncodedNativeScriptInvalidBefore
  | EncodedNativeScriptInvalidAfter;

type EncodedPlutusScript = Buffer;

type EncodedExUnits = [number, number];
type EncodedRedeemer = [number, number, PreEncodedPlutusData, EncodedExUnits];

enum WitnessType {
  V_KEY_WITNESS = 0,
  NATIVE_SCRIPT = 1,
  PLUTUS_SCRIPT_V1 = 3,
  PLUTUS_DATA = 4,
  REDEEMER = 5,
  PLUTUS_SCRIPT_V2 = 6,
}

export type EncodedWitnesses = Map<WitnessType.V_KEY_WITNESS, EncodedVKeyWitness[]> &
  Map<WitnessType.NATIVE_SCRIPT, EncodedNativeScript[]> &
  Map<WitnessType.PLUTUS_SCRIPT_V1, EncodedPlutusScript[]> &
  Map<WitnessType.PLUTUS_SCRIPT_V2, EncodedPlutusScript[]> &
  Map<WitnessType.PLUTUS_DATA, PreEncodedPlutusData[]> &
  Map<WitnessType.REDEEMER, EncodedRedeemer[]>;

type EncodedMetadata = Map<number, unknown>;

export namespace CborSerializer {
  export namespace CCostModels {
    export function toHex(plutusVersions: PlutusVersion[], costModels: CostModels): string {
      const encodedCostModels = new Map();
      for (const plutusVersion of plutusVersions) {
        switch (plutusVersion) {
          case PlutusVersion.V1: {
            encodedCostModels.set(0, costModels.PlutusV1);
            break;
          }
          case PlutusVersion.V2: {
            encodedCostModels.set(1, costModels.PlutusV2);
            break;
          }
          case PlutusVersion.V3: {
            encodedCostModels.set(2, costModels.PlutusV3);
            break;
          }
          default:
            throw new Error(`Unsupported Plutus version: ${plutusVersion}`);
        }
      }
      return cbors.Encoder.encode(encodedCostModels).toString("hex");
    }

    /**
     * Hex encoding is another format of CostModels that uses for building Script Data Hash
     * Script Data Hash requires the encoding format of Plutus V1 in both Language & Cost, the newer versions (PlutusV2, V3...) do not require the encoding format
     * @param plutusVersion
     * @returns CostModels in Encoding format
     */
    export function toHexEncoding(plutusVersions: PlutusVersion[], costModels: CostModels): string {
      const encodedCostModels = new Map();

      // Edge-case: combine plutus versions (v1, v2)
      if (plutusVersions.length > 1) {
        if (plutusVersions.includes(PlutusVersion.V3)) {
          throw new Error("Plutus V3 is not supported in combine mode");
        }
        /**
         * This is workaround solution to make the canonical ordering
         * We assume that the PlutusV2 Lang ID (1) places before the Encoding Plutus V1 Lang ID
         * The permanent solution is somehow sorting the LangID key by canonical ordering like CSL
         * https://github.com/minswap/cardano-serialization-lib/blob/minswap-11/rust/src/plutus.rs#L444
         */
        encodedCostModels.set(1, costModels.PlutusV2);

        // Wraping the cbor encoding to the Language ID and Costs of Plutus V1
        const costMdlsV1 = costModels.PlutusV1;
        const indefCostMdlsV1 = cbors.IndefiniteArray.from(costMdlsV1);
        const cborCostMdlsV1 = cbors.Encoder.encode(indefCostMdlsV1);
        const langIdV1 = cbors.Encoder.encode(0);
        encodedCostModels.set(langIdV1, cborCostMdlsV1);
        return cbors.Encoder.encode(encodedCostModels).toString("hex");
      }

      for (const plutusVersion of plutusVersions) {
        switch (plutusVersion) {
          case PlutusVersion.V1: {
            // Wraping the cbor encoding to the Language ID and Costs of Plutus V1
            const costMdlsV1 = costModels.PlutusV1;
            const indefCostMdlsV1 = cbors.IndefiniteArray.from(costMdlsV1);
            const cborCostMdlsV1 = cbors.Encoder.encode(indefCostMdlsV1);
            const langIdV1 = cbors.Encoder.encode(0);

            encodedCostModels.set(langIdV1, cborCostMdlsV1);
            break;
          }
          case PlutusVersion.V2: {
            encodedCostModels.set(1, costModels.PlutusV2);
            break;
          }
          case PlutusVersion.V3: {
            encodedCostModels.set(2, costModels.PlutusV3);
            break;
          }
          default:
            throw new Error(`Unsupported Plutus version: ${plutusVersion}`);
        }
      }
      return cbors.Encoder.encode(encodedCostModels).toString("hex");
    }
  }

  export namespace ScriptDataHash {
    // MARK: Compute script_data_hash
    export function generate({
      redeemers,
      plutusVersions,
      costModels,
      plutusDataList,
      computeMethod,
    }: {
      redeemers: Redeemer[];
      plutusVersions: PlutusVersion[];
      costModels: CostModels;
      plutusDataList: PlutusList | undefined;
      computeMethod: "CSL" | "MINSWAP";
    }): string {
      switch (computeMethod) {
        case "CSL": {
          const ECSL = RustModule.getE;
          const rawCostModels = CborSerializer.CCostModels.toHex(plutusVersions, costModels);
          const eCostModels = ECSL.Costmdls.from_hex(rawCostModels);
          const ePlutusList = plutusDataList
            ? ECSL.PlutusList.from_hex(PlutusData.toDataHex(plutusDataList))
            : undefined;

          const eRedeemers = ECSL.Redeemers.from_hex(Redeemer.toHex(redeemers));
          const eScriptDataHash = ECSL.hash_script_data(eRedeemers, eCostModels, ePlutusList);
          const scriptDataHash = eScriptDataHash.to_hex();

          safeFreeRustObjects(eRedeemers, eCostModels, ePlutusList, eScriptDataHash);

          return scriptDataHash;
        }
        case "MINSWAP": {
          // TODO: Investigate & fix the issue. Right now the script data hash is different to CSL13
          const rawCostModels = CborSerializer.CCostModels.toHexEncoding(plutusVersions, costModels);

          let plutusDataCbor: string;
          if (plutusDataList && plutusDataList.list.length > 0) {
            plutusDataCbor = PlutusData.toDataHex(plutusDataList);
          } else {
            plutusDataCbor = "";
          }
          let redeemerCbor: string;
          if (redeemers.length > 0) {
            redeemerCbor = Redeemer.toHex(redeemers);
          } else {
            redeemerCbor = cbors.Encoder.encode({}).toString("hex");
          }

          const scriptData = Buffer.from(redeemerCbor + plutusDataCbor + rawCostModels, "hex");
          return blake2b256(scriptData);
        }
      }
    }
  }

  export namespace CInput {
    export function toHex(input: TxIn): string {
      const encodedInput = encode(input);
      const inputBuffer = cbors.Encoder.encode(encodedInput) as Buffer;
      return new Bytes(Uint8Array.from(inputBuffer)).hex;
    }
    export function encode(input: TxIn): EncodedInput {
      const txHash = Buffer.from(input.txId.bytes);
      return [txHash, input.index];
    }

    export function encodeMany(inputs: TxIn[]): Array<EncodedInput> {
      return inputs.map(encode);
    }
  }

  export namespace CValue {
    export function encode(value: Value): EncodedValue {
      const adaAmount = new BigNumber(value.get(ADA).toString());
      if (value.isAdaOnly()) {
        return adaAmount;
      } else {
        const pidMapForEncoding = new Map<Buffer, Map<Buffer, BigNumber>>();
        const valueMap = value.toMap();
        const sortedPids = Object.keys(valueMap).sort((a, b) => Bytes.fromHex(a).compare(Bytes.fromHex(b)));
        for (const pid of sortedPids) {
          if (pid === "") {
            // Skip ADA
            continue;
          }
          const tnMap = valueMap[pid];
          const sortedTokenNames = Object.keys(tnMap).sort((a, b) => Bytes.fromHex(a).compare(Bytes.fromHex(b)));
          const tnMapForEncoding = new Map<Buffer, BigNumber>();
          for (const tokenName of sortedTokenNames) {
            tnMapForEncoding.set(Buffer.from(tokenName, "hex"), new BigNumber(tnMap[tokenName].toString()));
          }
          pidMapForEncoding.set(Buffer.from(pid, "hex"), tnMapForEncoding);
        }
        return [adaAmount, pidMapForEncoding];
      }
    }
  }

  export namespace CMint {
    export function encode(value: Value): EncodedTokens {
      const pidMapForEncoding = new Map<Buffer, Map<Buffer, BigNumber>>();
      const valueMap = value.toMap();
      const sortedPids = Object.keys(valueMap).sort((a, b) => Bytes.fromHex(a).compare(Bytes.fromHex(b)));
      for (const pid of sortedPids) {
        if (pid === "") {
          // Skip ADA
          continue;
        }
        const tnMap = valueMap[pid];
        const sortedTokenNames = Object.keys(tnMap).sort((a, b) => Bytes.fromHex(a).compare(Bytes.fromHex(b)));
        const tnMapForEncoding = new Map<Buffer, BigNumber>();
        for (const tokenName of sortedTokenNames) {
          tnMapForEncoding.set(Buffer.from(tokenName, "hex"), new BigNumber(tnMap[tokenName].toString()));
        }
        pidMapForEncoding.set(Buffer.from(pid, "hex"), tnMapForEncoding);
      }
      return pidMapForEncoding;
    }
  }

  export namespace COutput {
    export function toHex(output: TxOut): string {
      const encodedOutput = encode(output);
      const outputBuffer = cbors.Encoder.encode(encodedOutput) as Buffer;
      return new Bytes(Uint8Array.from(outputBuffer)).hex;
    }

    export function encode(output: TxOut): EncodedOutput {
      const datumSource = output.datumSource;
      const scriptRef = output.scriptRef;
      const isBabbageOutput =
        Maybe.isJust(scriptRef) || (Maybe.isJust(datumSource) && datumSource.type === DatumSourceType.INLINE_DATUM);
      const encodedValue = CValue.encode(output.value);
      const addressBuffer = Buffer.from(output.address.toCSL().to_bytes());
      let encodedOutput: EncodedOutput;
      if (isBabbageOutput) {
        encodedOutput = new Map();
        encodedOutput.set(OutputItemType.ADDRESS, addressBuffer);
        encodedOutput.set(OutputItemType.VALUE, encodedValue);
        if (Maybe.isJust(datumSource)) {
          switch (datumSource.type) {
            case DatumSourceType.DATUM_HASH:
            case DatumSourceType.OUTLINE_DATUM: {
              encodedOutput.set(OutputItemType.DATUM_OPTION, [0, Buffer.from(datumSource.hash.bytes)]);
              break;
            }
            case DatumSourceType.INLINE_DATUM: {
              const encodedPlutusData = cbors.Encoder.encode(
                PlutusData.toPlutusDataEncoding(PlutusData.fromDataHex(datumSource.data.hex)),
              );
              encodedOutput.set(OutputItemType.DATUM_OPTION, [1, new cbors.CborTag(encodedPlutusData, 24)]);
              break;
            }
          }
        }

        if (Maybe.isJust(scriptRef)) {
          /**
           * TODO: Support Native Script & Plutus V1
           * - Native Script: Tag 0
           * - Plutus V1: Tag 1
           * - Plutus V2: Tag 2
           * - Plutus V3: Tag 3
           */
          const mapPlutusTag: Record<PlutusVersion, number> = {
            [PlutusVersion.V1]: 1,
            [PlutusVersion.V2]: 2,
            [PlutusVersion.V3]: 3,
          };
          // We need to remove the CBOR encoding inside the @scriptRef
          const scriptRefWithoutCborEncoding = cbor.decode(scriptRef.script.hex);
          const plutusTag = mapPlutusTag[scriptRef.plutusVersion];
          invariant(Maybe.isJust(plutusTag), `Plutus Version ${scriptRef.plutusVersion} is not supported`);
          const encodedScriptRef = cbors.Encoder.encode([plutusTag, Buffer.from(scriptRefWithoutCborEncoding)]);
          encodedOutput.set(OutputItemType.SCRIPT_REF, new cbors.CborTag(encodedScriptRef, 24));
        }
      } else {
        encodedOutput = [addressBuffer, encodedValue];
        if (
          Maybe.isJust(datumSource) &&
          (datumSource.type === DatumSourceType.DATUM_HASH || datumSource.type === DatumSourceType.OUTLINE_DATUM)
        ) {
          encodedOutput.push(Buffer.from(datumSource.hash.bytes));
        }
      }

      return encodedOutput;
    }

    export function encodeMany(outputs: TxOut[]): Array<EncodedOutput> {
      return outputs.map(encode);
    }
  }

  export namespace CWithdrawals {
    export function encode(withdrawals: Withdrawals): EncodedWithdrawals {
      const encodedWithdrawals: EncodedWithdrawals = new Map();
      for (const [addrBech32, amount] of Object.entries(withdrawals)) {
        const stakingAddressBuffer = Buffer.from(RewardAddress.fromBech32(addrBech32).toCSL().to_bytes());
        encodedWithdrawals.set(stakingAddressBuffer, new BigNumber(amount.toString()));
      }
      return encodedWithdrawals;
    }
  }

  export namespace CCertificates {
    export function encode({ registrations, deregistration, delegations }: Certificates): EncodedCertificate[] {
      const encodedRegistrations: EncodedStakeRegistrationCertificate[] = [];
      const encodedDeregistrations: EncodedStakeDeRegistrationCertificate[] = [];
      const encodedDelegations: EncodedStakeDelegationCertificate[] = [];
      for (const rewardAddr of registrations) {
        const credential = Maybe.unwrap(
          rewardAddr.toPaymentCredential(),
          `cannot get payment credetial of address ${rewardAddr.bech32}`,
        );
        const stakeKeyHash: Buffer = Buffer.from(credential.payload.bytes);
        const stakeCredential: EncodedStakeCredential = [credential.type, stakeKeyHash];
        encodedRegistrations.push([0, stakeCredential]);
      }
      for (const rewardAddr of deregistration) {
        const credential = Maybe.unwrap(
          rewardAddr.toPaymentCredential(),
          `cannot get payment credetial of address ${rewardAddr.bech32}`,
        );
        const stakeKeyHash: Buffer = Buffer.from(credential.payload.bytes);
        const stakeCredential: EncodedStakeCredential = [credential.type, stakeKeyHash];
        encodedDeregistrations.push([1, stakeCredential]);
      }
      for (const { stakeAddress: rewardAddr, stakePool } of delegations) {
        const credential = Maybe.unwrap(
          rewardAddr.toPaymentCredential(),
          `cannot get payment credetial of address ${rewardAddr.bech32}`,
        );
        const stakeKeyHash: Buffer = Buffer.from(credential.payload.bytes);
        const stakeCredential: EncodedStakeCredential = [credential.type, stakeKeyHash];
        const poolHash = Buffer.from(stakePool.hash.bytes);
        encodedDelegations.push([2, stakeCredential, poolHash]);
      }

      return [...encodedRegistrations, ...encodedDeregistrations, ...encodedDelegations];
    }
  }

  export namespace CVkeyWitness {
    export function toHex(vkeyWitness: VKeyWitness): string {
      const CSL = RustModule.get;
      // TODO: Support serialize PublicKey
      const vkeyHex = CSL.PublicKey.from_bech32(vkeyWitness.vkey).to_hex();
      const encodedWitness: [Buffer, Buffer] = [Buffer.from(vkeyHex, "hex"), Buffer.from(vkeyWitness.signature, "hex")];
      const witnessBuffer = cbors.Encoder.encode(encodedWitness) as Buffer;
      return new Bytes(Uint8Array.from(witnessBuffer)).hex;
    }

    export function encode(vkeysWitness: VKeyWitness[], allowDuplicatedVkeys?: boolean): EncodedVKeyWitness[] {
      const CSL = RustModule.get;
      const encodedVKeyWitness: EncodedVKeyWitness[] = [];
      if (allowDuplicatedVkeys) {
        // Note: No dedup of vKeys
        for (const { vkey, signature } of vkeysWitness) {
          const cslPubKey = CSL.PublicKey.from_bech32(vkey);
          encodedVKeyWitness.push([Buffer.from(cslPubKey.to_hex(), "hex"), Buffer.from(signature, "hex")]);
          safeFreeRustObjects(cslPubKey);
        }
      } else {
        // create a map of unique v keys
        const vKeyMap: Map<string, Buffer> = new Map();
        for (const { vkey, signature } of vkeysWitness) {
          // TODO: Support serialize PublicKey
          const cslPubKey = CSL.PublicKey.from_bech32(vkey);
          vKeyMap.set(cslPubKey.to_hex(), Buffer.from(signature, "hex"));
          safeFreeRustObjects(cslPubKey);
        }
        for (const [vKey, sig] of vKeyMap) {
          encodedVKeyWitness.push([Buffer.from(vKey, "hex"), sig]);
        }
      }

      return encodedVKeyWitness;
    }
  }

  export namespace CWitness {
    export function toHex(witness: Witness): string {
      const encodedWitness = encode(witness);
      const witnessBuffer = cbors.Encoder.encode(encodedWitness) as Buffer;
      return new Bytes(Uint8Array.from(witnessBuffer)).hex;
    }

    export function encode(witness: Witness, allowDuplicatedVkeys?: boolean): EncodedWitnesses {
      const encodedWitnesses: EncodedWitnesses = new Map();

      const encodedNativeScriptMap: Map<string, EncodedNativeScript> = new Map();
      for (const ns of Object.values(witness.nativeScripts)) {
        const encodedNativeScript = CNativeScript.encode(ns.script);
        const nsCbor = cbors.Encoder.encode(encodedNativeScript);
        encodedNativeScriptMap.set(nsCbor.toString("hex"), encodedNativeScript);
      }
      const encodedNativeScripts = [];
      for (const [, encodedNS] of encodedNativeScriptMap) {
        encodedNativeScripts.push(encodedNS);
      }

      const encodedRedeemers: Array<EncodedRedeemer> = [];
      for (const redeemer of witness.redeemers) {
        encodedRedeemers.push([
          redeemer.type,
          redeemer.index,
          PlutusData.toPlutusDataEncoding(redeemer.redeemerData),
          [Number(redeemer.exUnit.memory), Number(redeemer.exUnit.step)],
        ]);
      }

      const encodedPlutusScriptsV1: Array<EncodedPlutusScript> = [];
      const encodedPlutusScriptsV2: Array<EncodedPlutusScript> = [];
      for (const plutusScript of Object.values(witness.plutusScripts)) {
        encodedPlutusScriptsV1.push(cbors.Decoder.decode(Buffer.from(plutusScript.script, "hex")).value);
        // if (scriptType === PlutusScriptType.PlutusScriptV1) {
        //   const pls = cbors.Decoder.decode(Buffer.from(scriptCbor, "hex"));

        // } else if (scriptType === PlutusScriptType.PlutusScriptV2) {
        //   const pls = cbors.Decoder.decode(Buffer.from(script, "hex"));
        //   encodedPlutusScriptsV2.push(pls.value);
        // } else {
        //   throw new Error("Unsupported PlutusScript Version");
        // }
      }

      if (witness.vkeys.length > 0) {
        encodedWitnesses.set(WitnessType.V_KEY_WITNESS, CVkeyWitness.encode(witness.vkeys, allowDuplicatedVkeys));
      }
      if (encodedNativeScripts.length > 0) {
        encodedWitnesses.set(WitnessType.NATIVE_SCRIPT, encodedNativeScripts);
      }
      if (encodedPlutusScriptsV1.length > 0) {
        encodedWitnesses.set(WitnessType.PLUTUS_SCRIPT_V1, encodedPlutusScriptsV1);
      }
      const encodedPlutusDataList = new cbors.IndefiniteArray();
      for (const plutusData of Object.values(witness.plutusData)) {
        encodedPlutusDataList.push(PlutusData.toPlutusDataEncoding(PlutusData.fromDataHex(plutusData)));
      }
      if (encodedPlutusDataList.length > 0) {
        encodedWitnesses.set(WitnessType.PLUTUS_DATA, encodedPlutusDataList);
      }
      if (encodedRedeemers.length) {
        encodedWitnesses.set(WitnessType.REDEEMER, encodedRedeemers);
      }
      if (encodedPlutusScriptsV2.length > 0) {
        encodedWitnesses.set(WitnessType.PLUTUS_SCRIPT_V2, encodedPlutusScriptsV2);
      }

      return encodedWitnesses;
    }
  }

  export namespace CTxBody {
    export function toHex(txBody: TxBody, scriptDataHash?: string, auxiliaryDataHash?: string): string {
      const encodedTxBody = encode(txBody, scriptDataHash, auxiliaryDataHash);
      const txBodyBuffer = cbors.Encoder.encode(encodedTxBody) as Buffer;
      return new Bytes(Uint8Array.from(txBodyBuffer)).hex;
    }
    export function encode(txBody: TxBody, scriptDataHash?: string, auxiliaryDataHash?: string): EncodedTxBody {
      const encodedBody = new Map<TransactionBodyItemType, unknown>();

      encodedBody.set(TransactionBodyItemType.INPUTS, CInput.encodeMany(txBody.inputs.map((utxo) => utxo.input)));
      encodedBody.set(TransactionBodyItemType.OUTPUTS, COutput.encodeMany(txBody.outputs));
      encodedBody.set(TransactionBodyItemType.FEE, new BigNumber(txBody.fee.toString()));

      if (txBody.validity && Maybe.isJust(txBody.validity.validUntil)) {
        encodedBody.set(TransactionBodyItemType.TTL, txBody.validity.validUntil);
      }
      if (txBody.certificates) {
        encodedBody.set(TransactionBodyItemType.CERTIFICATES, CCertificates.encode(txBody.certificates));
      }
      if (Object.keys(txBody.withdrawals).length > 0) {
        encodedBody.set(TransactionBodyItemType.WITHDRAWALS, CWithdrawals.encode(txBody.withdrawals));
      }

      if (auxiliaryDataHash) {
        encodedBody.set(TransactionBodyItemType.AUXILIARY_DATA_HASH, Buffer.from(auxiliaryDataHash, "hex"));
      }

      if (txBody.validity && Maybe.isJust(txBody.validity.validFrom)) {
        encodedBody.set(TransactionBodyItemType.VALIDITY_INTERVAL_START, txBody.validity.validFrom);
      }

      if (!txBody.mint.isEmpty()) {
        encodedBody.set(TransactionBodyItemType.MINT, CMint.encode(txBody.mint));
      }

      if (scriptDataHash) {
        encodedBody.set(TransactionBodyItemType.SCRIPT_DATA_HASH, Buffer.from(scriptDataHash, "hex"));
      }

      if (txBody.collateral && txBody.collateral.collaterals.length > 0) {
        encodedBody.set(
          TransactionBodyItemType.COLLATERAL_INPUTS,
          CInput.encodeMany(txBody.collateral.collaterals.map((utxo) => utxo.input)),
        );
      }

      if (txBody.requireSigners.length > 0) {
        encodedBody.set(
          TransactionBodyItemType.REQUIRED_SIGNERS,
          txBody.requireSigners.map((key) => Buffer.from(key.keyHash.hex, "hex")),
        );
      }

      if (txBody.collateral?.collateralReturn) {
        encodedBody.set(TransactionBodyItemType.COLLATERAL_OUTPUT, COutput.encode(txBody.collateral.collateralReturn));
        const totalCollateral = Utxo.sumValue(txBody.collateral.collaterals)
          .subtractAll(txBody.collateral.collateralReturn.value)
          .trim();
        encodedBody.set(TransactionBodyItemType.TOTAL_COLLATERAL, new BigNumber(totalCollateral.get(ADA).toString()));
      }

      if (txBody.referenceInputs.length > 0) {
        encodedBody.set(
          TransactionBodyItemType.REFERENCE_INPUTS,
          CInput.encodeMany(txBody.referenceInputs.map((utxo) => utxo.input)),
        );
      }

      return encodedBody;
    }
  }

  export namespace CMetadata {
    export function sanitizeMetadata(metadata: unknown): unknown {
      if (Array.isArray(metadata)) {
        const ary = [];
        for (const d of metadata) {
          ary.push(sanitizeMetadata(d));
        }
        return ary;
      }
      if (typeof metadata === "string" || metadata instanceof Buffer) {
        if (metadata.length > 64) {
          throw new Error("string or buffer length invalid");
        }
        return metadata;
      }
      // TODO: map is also an object, hence check map first, maybe requires a proper fix
      if (metadata instanceof Map) {
        const map = new Map();
        for (const [key, value] of metadata.entries()) {
          map.set(key, sanitizeMetadata(value));
        }
        return new Map([...map.entries()].sort());
      }
      if (metadata instanceof Object) {
        const map = new Map();
        for (const [key, value] of Object.entries(metadata)) {
          map.set(key, sanitizeMetadata(value));
        }
        return new Map([...map.entries()].sort());
      }
      return metadata;
    }

    export function toHex(metadata: Metadata): string {
      const encodedMetadata = encode(metadata);
      const metadataBuffer = cbors.Encoder.encode(encodedMetadata) as Buffer;
      return new Bytes(Uint8Array.from(metadataBuffer)).hex;
    }

    export function encode(metadata: Metadata): EncodedMetadata {
      const encodedMetadata = new Map<number, unknown>();
      for (const [key, metadatum] of Object.entries(metadata)) {
        if (metadatum.size === 0) {
          continue;
        }
        encodedMetadata.set(Number(key), sanitizeMetadata(metadatum));
      }
      return encodedMetadata;
    }

    export function hash(metadata: Metadata): string {
      const auxiliaryDataCbor = cbors.Encoder.encode(encode(metadata));
      return blake2b256(auxiliaryDataCbor);
    }
  }

  export namespace CNativeScriptPubKey {
    export function encode(ns: NativeScriptPubKeyHash): EncodedNativeScriptPubKeyHash {
      return [0, Buffer.from(ns.keyHash, "hex")];
    }
  }

  export namespace CNativeScript {
    export function toHex(ns: NativeScript): string {
      const encodedNativeScript = encode(ns);
      const nativeScriptBuffer = cbors.Encoder.encode(encodedNativeScript) as Buffer;
      return new Bytes(Uint8Array.from(nativeScriptBuffer)).hex;
    }

    export function encode(ns: NativeScript): EncodedNativeScript {
      if (ns.type === "sig" && "keyHash" in ns) {
        return CNativeScriptPubKey.encode(ns);
      }
      if (ns.type === "all") {
        const encodedChildScripts: EncodedNativeScript[] = [];
        for (const childJsonScript of ns.scripts) {
          if (childJsonScript.type === "sig") {
            encodedChildScripts.push(CNativeScriptPubKey.encode(childJsonScript));
          } else if (childJsonScript.type === "after") {
            encodedChildScripts.push([4, childJsonScript.slot]);
          } else {
            encodedChildScripts.push([5, childJsonScript.slot]);
          }
        }
        return [1, encodedChildScripts];
      }

      if (ns.type === "any") {
        return [2, ns.scripts.map(CNativeScriptPubKey.encode)];
      }

      if (ns.type === "atLeast") {
        return [3, ns.required, ns.scripts.map(CNativeScriptPubKey.encode)];
      }

      throw new Error("Invalid native script");
    }
  }
}
