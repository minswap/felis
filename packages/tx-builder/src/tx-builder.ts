import type { CIP25Metadata, CIP25NFT } from "@repo/cip";
import {
  ADA,
  type Address,
  Bytes,
  CredentialType,
  DEFAULT_STABLE_PROTOCOL_PARAMS,
  type DRep,
  type ExUnit,
  getSlotFromTimeMagic,
  NativeScript,
  type NetworkEnvironment,
  PlutusData,
  PlutusUsageType,
  PlutusVersion,
  type PrivateKey,
  type ProtocolParameters,
  type PublicKeyHash,
  RedeemerType,
  type RedeemerWithRef,
  type RewardAddress,
  TxIn,
  TxOut,
  type UnstableProtocolParams,
  Utxo,
  type Validator,
  Value,
  XJSON,
} from "@repo/ledger-core";
import {
  type CborHex,
  type CSLTransaction,
  type CSLVkeywitness,
  type ECSLTransaction,
  type ECSLTransactionWitnessSet,
  Maybe,
  Result,
  RustModule,
  safeFreeRustObjects,
  unwrapRustVec,
} from "@repo/ledger-utils";
import { unique } from "remeda";
import { ECSLConverter } from "./ecsl-converter";
import { CSLTxSerializer } from "./serializer";
import { TxBuildingError } from "./tx-builder-error";
import {
  CoinSelectionAlgorithm,
  type DebugInfo,
  type DebugNativeScriptMint,
  type DebugPlutusMint,
  type DebugPlutusSpend,
  TxDraft,
  type UtxoState,
} from "./types";
import { ChangeOutputBuilder, UtxoSelection } from "./utils";

export type TxBuilderBuildOptions = {
  changeAddress: Address;
  provider: ITxBuilderProvider;
  walletUtxos: Utxo[];
  walletCollaterals?: Utxo[];
  coinSelectionAlgorithm: CoinSelectionAlgorithm;
  debug?: boolean;
  // Sometimes, we need to pass extra fee for some special cases like when CSL compute Insufficient fee due to unknown reason.
  // For example, Metadata Message contains special characters like (Ť Ŏ Ǹ Ȳ) requires more fee than CSL calculated.
  extraFee?: bigint;
};

const MAX_FAKE_EX_UNIT: ExUnit = {
  memory: 14000000n,
  step: 10000000000n,
};

function calculateFakeExUnit(redeemerNum: number): ExUnit {
  return {
    memory: MAX_FAKE_EX_UNIT.memory / BigInt(redeemerNum),
    step: MAX_FAKE_EX_UNIT.step / BigInt(redeemerNum),
  };
}

type StandardMessageMetadataKey = "msg" | "extraData" | "limitOrders";

type TxChaining = {
  txId: string;
  txComplete: TxComplete;
  newUtxoState: UtxoState;
};

export interface ITxBuilderProvider {
  getUnstableProtocolParams(): Promise<UnstableProtocolParams>;
}

export class TxBuilder {
  protected readonly networkEnv: NetworkEnvironment;
  txDraft: TxDraft;

  protected tasks: ((txb: TxBuilder) => void)[];

  constructor(networkEnv: NetworkEnvironment) {
    this.networkEnv = networkEnv;
    this.txDraft = {
      body: {
        inputs: [],
        outputs: [],
        fee: 0n,
        mint: new Value(),
        withdrawals: {},
        validity: undefined,
        collateral: undefined,
        referenceInputs: [],
        requireSigners: [],
      },
      witness: {
        vkeys: [],
        nativeScripts: {},
        plutusScripts: {},
        plutusData: {},
        redeemers: [],
      },
      metadata: {},
      metadata2: {
        [674]: new Map(),
        [721]: new Map(),
      },
      plutusScripts: {},
      nativeScripts: {},
    };
    this.tasks = [];
  }
  readFrom(...utxos: Utxo[]): this {
    this.tasks.push((txb) => {
      const CSL = RustModule.get;
      const existingRefTxIds = Utxo.utxosToTxInSet(txb.txDraft.body.referenceInputs);
      for (const utxo of utxos) {
        if (existingRefTxIds.has(TxIn.toString(utxo.input))) {
          continue;
        }
        if (Maybe.isJust(utxo.output.scriptRef)) {
          const cPlutusScript = CSL.PlutusScript.from_bytes_with_version(
            utxo.output.scriptRef.script.bytes,
            PlutusVersion.toCSL(utxo.output.scriptRef.plutusVersion),
          );
          const cScriptHash = cPlutusScript.hash();
          txb.txDraft.plutusScripts[cScriptHash.to_hex()] = {
            referenceScript: cPlutusScript,
          };
        }
        txb.txDraft.body.referenceInputs.push(utxo);
      }
    });
    return this;
  }
  collectFromPubKey(...utxos: Utxo[]): this {
    this.tasks.push((txb) => {
      const existingInputs = Utxo.utxosToTxInSet(txb.txDraft.body.inputs);
      for (const utxo of utxos) {
        // Verify utxo belongs PubKey Address
        const keyHash = utxo.output.address.toPubKeyHash();
        if (Maybe.isNothing(keyHash)) {
          throw new Error(
            `Address is belonged to Script, use @collectFromNativeContract or @collectFromPlutusContract function, ${utxo.output.address.bech32}`,
          );
        }
        if (existingInputs.has(TxIn.toString(utxo.input))) {
          continue;
        }
        txb.txDraft.body.inputs.push(utxo);
      }
    });
    return this;
  }
  collectFromNativeContract(...utxos: Utxo[]): this {
    this.tasks.push((txb) => {
      const existingInputs = Utxo.utxosToTxInSet(txb.txDraft.body.inputs);
      for (const utxo of utxos) {
        const addressScriptHash = utxo.output.address.toScriptHash();
        if (Maybe.isNothing(addressScriptHash)) {
          throw new Error(`Address is not belonged to Script, use @collectFromPubKey function`);
        }
        const script = txb.txDraft.nativeScripts[addressScriptHash.hex];
        if (!script) {
          throw new Error(`Script was not attached for UTxO spend, hash required: ${addressScriptHash.hex}`);
        }
        if (existingInputs.has(TxIn.toString(utxo.input))) {
          continue;
        }
        txb.txDraft.body.inputs.push(utxo);
      }
    });
    return this;
  }
  collectFromPlutusContract(utxos: Utxo[], redeemer: PlutusData, datum?: PlutusData | string): this {
    this.tasks.push((txb) => {
      const existingInputs = Utxo.utxosToTxInSet(txb.txDraft.body.inputs);
      for (const utxo of utxos) {
        const addressScriptHash = utxo.output.address.toScriptHash();
        if (Maybe.isNothing(addressScriptHash)) {
          throw new Error(`Address is not belonged to Script, use @collectFromPubKey function`);
        }
        const script = txb.txDraft.plutusScripts[addressScriptHash.hex];
        if (!script) {
          throw new Error(`Script was not attached for UTxO spend,  hash required: ${addressScriptHash.hex}`);
        }
        if (existingInputs.has(TxIn.toString(utxo.input))) {
          continue;
        }
        txb.txDraft.body.inputs.push(utxo);
        const updatedExUnit = calculateFakeExUnit(txb.txDraft.witness.redeemers.length + 1);
        for (const r of txb.txDraft.witness.redeemers) {
          r.exUnit = updatedExUnit;
        }
        txb.txDraft.witness.redeemers.push({
          type: RedeemerType.SPEND,
          index: 0,
          redeemerData: redeemer,
          exUnit: updatedExUnit,
          ref: TxIn.toString(utxo.input),
        });
        if (datum) {
          const datumHash = Bytes.fromHex(PlutusData.hashPlutusData(datum));
          if (typeof datum === "string") {
            txb.txDraft.witness.plutusData[datumHash.hex] = datum;
          } else {
            txb.txDraft.witness.plutusData[datumHash.hex] = PlutusData.toDataHex(datum);
          }
        }
      }
    });

    return this;
  }
  mintAssets(value: Value, redeemer?: PlutusData): this {
    this.tasks.push((txb) => {
      const policyIds = value.policyIds();
      if (policyIds.length === 0) {
        return;
      }
      if (policyIds.length > 1) {
        throw new Error(
          "Only one policy id allowed. You can chain multiple mintAssets functions together if you need to mint assets with different policy ids.",
        );
      }
      const policyId = policyIds[0];

      if (redeemer) {
        const script = txb.txDraft.plutusScripts[policyId.hex];
        if (!script) {
          throw new Error("Scripts must be attached BEFORE they are used");
        }
        const updatedExUnit = calculateFakeExUnit(txb.txDraft.witness.redeemers.length + 1);
        for (const r of txb.txDraft.witness.redeemers) {
          r.exUnit = updatedExUnit;
        }
        txb.txDraft.witness.redeemers.push({
          type: RedeemerType.MINT,
          index: 0,
          redeemerData: redeemer,
          exUnit: updatedExUnit,
          ref: policyId.hex,
        });
      } else {
        const script = txb.txDraft.nativeScripts[policyId.hex];
        if (!script) {
          throw new Error("Scripts must be attached BEFORE they are used");
        }
      }
      txb.txDraft.body.mint.addAll(value);
    });
    return this;
  }
  payTo(...outputs: TxOut[]): this {
    this.tasks.push((txb) => {
      for (const _output of outputs) {
        // TODO: Prevent paying only datum hash
        const newOutput = _output.clone().addMinimumADAIfRequired(this.networkEnv);
        if (newOutput.incluneOutlineDatums()) {
          const outlineDatum = Result.unwrap(newOutput.getOutlineDatum());
          const datumHash = Bytes.fromHex(PlutusData.hashPlutusData(PlutusData.fromDataHex(outlineDatum.hex)));
          txb.txDraft.witness.plutusData[datumHash.hex] = outlineDatum.hex;
        }
        txb.txDraft.body.outputs.push(newOutput);
      }
    });
    return this;
  }
  delegateVote(rewardAddress: RewardAddress, drep: DRep): this {
    this.tasks.push((txb) => {
      if (!txb.txDraft.body.certificates) {
        txb.txDraft.body.certificates = {
          registrations: [],
          deregistration: [],
          delegations: [],
          voteDelegation: [],
        };
      }
      const existingDelegation = txb.txDraft.body.certificates.voteDelegation.find((delegation) =>
        delegation.rewardAddress.equals(rewardAddress),
      );
      if (existingDelegation) {
        existingDelegation.drep = drep;
      } else {
        txb.txDraft.body.certificates.voteDelegation.push({
          rewardAddress,
          drep,
        });
      }
    });
    return this;
  }
  registerStake(rewardAddress: RewardAddress): this {
    this.tasks.push((txb) => {
      if (!txb.txDraft.body.certificates) {
        txb.txDraft.body.certificates = {
          registrations: [rewardAddress],
          deregistration: [],
          delegations: [],
          voteDelegation: [],
        };
      } else {
        let isExisted = false;
        for (const existingRewardAddr of txb.txDraft.body.certificates.registrations) {
          if (rewardAddress.equals(existingRewardAddr)) {
            isExisted = true;
            break;
          }
        }
        if (!isExisted) {
          txb.txDraft.body.certificates.registrations.push(rewardAddress);
        }
      }
    });
    return this;
  }
  withdraw(rewardAddress: RewardAddress, amount: bigint, redeemer?: PlutusData): this {
    this.tasks.push((txb) => {
      if (rewardAddress.bech32 in txb.txDraft.body.withdrawals) {
        txb.txDraft.body.withdrawals[rewardAddress.bech32] += amount;
      } else {
        txb.txDraft.body.withdrawals[rewardAddress.bech32] = amount;
      }
      if (redeemer) {
        const addressScriptHash = rewardAddress.toScriptHash();
        if (Maybe.isNothing(addressScriptHash)) {
          throw new Error("Withdraw from PubKey Address no need attach Redeemer");
        }
        const script = txb.txDraft.plutusScripts[addressScriptHash.hex];
        if (!script) {
          throw new Error("Scripts must be attached BEFORE they are used");
        }
        const updatedExUnit = calculateFakeExUnit(txb.txDraft.witness.redeemers.length + 1);
        for (const r of txb.txDraft.witness.redeemers) {
          r.exUnit = updatedExUnit;
        }
        txb.txDraft.witness.redeemers.push({
          type: RedeemerType.REWARD,
          index: 0,
          redeemerData: redeemer,
          exUnit: updatedExUnit,
          ref: rewardAddress.bech32,
        });
      } else {
        const paymentCred = rewardAddress.toPaymentCredential();
        if (Maybe.isNothing(paymentCred)) {
          throw new Error("Do not support reward withdrawal of Byron Address");
        }
        if (paymentCred.type === CredentialType.SCRIPT_CREDENTIAL) {
          const script = txb.txDraft.nativeScripts[paymentCred.payload.hex];
          if (!script) {
            throw new Error("Script with no redeemer should be a nativescript, but none provided");
          }
        }
      }
    });

    return this;
  }
  addSigner(address: Address): this {
    this.tasks.push((txb) => {
      const pubKeyhash = address.toPubKeyHash();
      if (Maybe.isNothing(pubKeyhash)) {
        throw new Error("Only key hashes are allowed as signers.");
      }
      txb.addSignerKey(pubKeyhash);
    });
    return this;
  }
  addSigners(...addresses: Address[]): this {
    for (const address of addresses) {
      this.addSigner(address);
    }
    return this;
  }
  addSignerKey(keyHash: PublicKeyHash): this {
    this.tasks.push((txb) => {
      let existed = false;
      for (const existingKeyHash of txb.txDraft.body.requireSigners) {
        if (keyHash.equals(existingKeyHash)) {
          existed = true;
        }
      }
      if (!existed) {
        txb.txDraft.body.requireSigners.push(keyHash);
      }
    });
    return this;
  }
  addSignerKeys(...keyHashes: PublicKeyHash[]): this {
    for (const keyHash of keyHashes) {
      this.addSignerKey(keyHash);
    }
    return this;
  }
  validFrom(slot: number): this {
    this.tasks.push((txb) => {
      if (txb.txDraft.body.validity) {
        txb.txDraft.body.validity.validFrom = slot;
      } else {
        txb.txDraft.body.validity = {
          validFrom: slot,
          validUntil: undefined,
        };
      }
    });
    return this;
  }
  validFromUnixTime(unixTime: number): this {
    const slot = getSlotFromTimeMagic(this.networkEnv, new Date(unixTime));
    return this.validFrom(slot);
  }
  validTo(slot: number): this {
    this.tasks.push((txb) => {
      if (txb.txDraft.body.validity) {
        txb.txDraft.body.validity.validUntil = slot;
      } else {
        txb.txDraft.body.validity = {
          validFrom: undefined,
          validUntil: slot,
        };
      }
    });
    return this;
  }
  validToUnixTime(unixTime: number): this {
    const slot = getSlotFromTimeMagic(this.networkEnv, new Date(unixTime));
    return this.validTo(slot);
  }
  attachValidator(validator: Validator): this {
    this.tasks.push((txb) => {
      const CSL = RustModule.get;
      switch (validator.type) {
        case "Native": {
          const cScript = CSL.NativeScript.from_hex(NativeScript.toHex(validator.script));
          txb.txDraft.nativeScripts[cScript.hash().to_hex()] = cScript;
          txb.txDraft.witness.nativeScripts[cScript.hash().to_hex()] = validator;
          break;
        }
        case "PlutusV1": {
          const cPlutusScript = CSL.PlutusScript.from_bytes(Bytes.fromHex(validator.script).bytes);
          txb.txDraft.plutusScripts[cPlutusScript.hash().to_hex()] = {
            inlineScript: cPlutusScript,
          };
          txb.txDraft.witness.plutusScripts[cPlutusScript.hash().to_hex()] = validator;
          break;
        }
        case "PlutusV2": {
          const cPlutusScript = CSL.PlutusScript.from_bytes_v2(Bytes.fromHex(validator.script).bytes);
          txb.txDraft.plutusScripts[cPlutusScript.hash().to_hex()] = {
            inlineScript: cPlutusScript,
          };
          txb.txDraft.witness.plutusScripts[cPlutusScript.hash().to_hex()] = validator;
          break;
        }
        case "PlutusV3": {
          const cPlutusScript = CSL.PlutusScript.from_bytes_with_version(
            Bytes.fromHex(validator.script).bytes,
            CSL.Language.new_plutus_v3(),
          );
          txb.txDraft.plutusScripts[cPlutusScript.hash().to_hex()] = {
            inlineScript: cPlutusScript,
          };
          txb.txDraft.witness.plutusScripts[cPlutusScript.hash().to_hex()] = validator;
          break;
        }
      }
    });
    return this;
  }

  attachValidators(...validators: Validator[]): this {
    for (const validator of validators) {
      this.attachValidator(validator);
    }
    return this;
  }

  /**
   * THIS WILL REPLACE ANY EXISTING METADATA WITH THE SAME KEY
   * txb.addMessageMetadata("msg", ["alice"])
   * txb.addMessageMetadata("msg", ["bob"])
   * => txb.txDraft.metadata["674"]["msg"] === ["bob"]
   */
  // biome-ignore lint/suspicious/noExplicitAny: legacy
  addMessageMetadata(key: StandardMessageMetadataKey, data: any): this {
    this.tasks.push((txb) => {
      if (data !== undefined && data !== null) {
        if (!txb.txDraft.metadata["674"]) {
          txb.txDraft.metadata["674"] = {};
        }
        txb.txDraft.metadata["674"][key] = data;
      }
    });

    return this;
  }

  addCIP25NFTMetadata(...cip25NFTs: CIP25NFT[]): this {
    this.tasks.push((txb) => {
      if (!txb.txDraft.metadata["721"]) {
        txb.txDraft.metadata["721"] = {};
      }
      const cip25Metadata: CIP25Metadata = {};
      for (const nft of cip25NFTs) {
        const { asset, ...rest } = nft;
        const policyId = asset.currencySymbol.hex;
        const tokenNameUTF8 = asset.tokenName.toString();
        if (!cip25Metadata[policyId]) {
          cip25Metadata[policyId] = {
            [tokenNameUTF8]: rest,
          };
          continue;
        }
        if (!cip25Metadata[policyId][tokenNameUTF8]) {
          cip25Metadata[policyId][tokenNameUTF8] = rest;
        }
      }
      txb.txDraft.metadata["721"] = {
        ...cip25Metadata,
        version: "1.0",
      };
    });
    return this;
  }

  completeTasks({ debug }: { debug?: boolean }): this {
    let task = this.tasks.shift();
    while (task) {
      try {
        task(this);
      } catch (err) {
        if (debug) {
          console.error("Task function source:", task.toString());
          console.error("Error details:", err);
        }
        throw err;
      }
      task = this.tasks.shift();
    }
    return this;
  }

  getTxDraft(): TxDraft {
    this.completeTasks({});
    return TxDraft.clone(this.txDraft);
  }

  /**
   * This function will extract debug info of TxBuilderV1 based on TxDraft
   * @returns
   */
  getDebugInfo(): DebugInfo {
    const plutusSpends: DebugPlutusSpend[] = [];
    const plutusMints: DebugPlutusMint[] = [];
    const nativeScriptMints: DebugNativeScriptMint[] = [];
    for (const utxo of this.txDraft.body.inputs) {
      const addr = utxo.output.address;
      const scriptHash = addr.toScriptHash();
      if (Maybe.isNothing(scriptHash)) {
        continue;
      }
      let datum: string;
      if (utxo.output.includeInlineDatums()) {
        datum = Result.unwrap(utxo.output.getInlineDatum()).hex;
      } else if (utxo.output.incluneOutlineDatums()) {
        datum = Result.unwrap(utxo.output.getOutlineDatum()).hex;
      } else {
        datum = "";
      }
      const redeemer = this.txDraft.witness.redeemers.find((r) => r.ref === TxIn.toString(utxo.input));
      if (redeemer) {
        plutusSpends.push({
          type: PlutusUsageType.SPEND,
          utxo: Utxo.toHex(utxo),
          script: scriptHash.hex,
          datum: datum,
          redeemer: PlutusData.toDataHex(redeemer.redeemerData),
          exUnit: {
            memory: redeemer.exUnit.memory.toString(),
            step: redeemer.exUnit.step.toString(),
          },
        });
      }
    }
    for (const [asset, amount] of this.txDraft.body.mint.flatten()) {
      const pid = asset.currencySymbol.hex;
      if (this.txDraft.nativeScripts[pid]) {
        nativeScriptMints.push({
          asset: asset.toString(),
          amount: amount.toString(),
          script: this.txDraft.nativeScripts[pid].to_hex(),
        });
      } else if (this.txDraft.plutusScripts[pid]) {
        const redeemer = this.txDraft.witness.redeemers.find((r) => r.ref === pid);
        if (redeemer) {
          plutusMints.push({
            type: PlutusUsageType.MINT,
            asset: asset.toString(),
            amount: amount.toString(),
            script: pid,
            redeemer: PlutusData.toDataHex(redeemer.redeemerData),
            exUnit: {
              memory: redeemer.exUnit.memory.toString(),
              step: redeemer.exUnit.step.toString(),
            },
          });
        }
      }
    }
    return {
      networkEnvironment: this.networkEnv,
      forcedInputs: this.txDraft.body.inputs.map(Utxo.toHex),
      allInputs: this.txDraft.body.inputs.map(Utxo.toHex),
      collateralInputs: this.txDraft.body.collateral?.collaterals?.map(Utxo.toHex) ?? [],
      outputs: this.txDraft.body.outputs.map((o) => o.toHex()),
      plutusSpends: plutusSpends,
      plutusMints: plutusMints,
      nativeScriptMints: nativeScriptMints,
      requiredSigners: this.txDraft.body.requireSigners.map((s) => s.keyHash.hex),
      metadata: [this.txDraft.metadata["674"], this.txDraft.metadata["721"]],
      txFee: {
        calculatedFee: this.txDraft.body.fee.toString(),
        cslFee: this.txDraft.body.fee.toString(),
      },
      validFrom: this.txDraft.body.validity?.validFrom ?? null,
      validUntil: this.txDraft.body.validity?.validUntil ?? null,
      coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
      splitChange: true,
      changeOuts: [],
      builtTx: undefined,
    };
  }

  private isTxBalance(): boolean {
    const protocolParams = DEFAULT_STABLE_PROTOCOL_PARAMS[this.networkEnv];
    const sumInputsValue = Utxo.sumValue(this.txDraft.body.inputs);
    const sumOutputsValue = TxOut.sumValue(this.txDraft.body.outputs);
    const sumMint = this.txDraft.body.mint.clone();
    const sumWithdrawalAmount = Object.values(this.txDraft.body.withdrawals).reduce((acc, a) => acc + a, 0n);
    const sumStakeKeyRegistrationFee = BigInt(
      protocolParams.stakeAddressDeposit * (this.txDraft.body.certificates?.registrations.length ?? 0),
    );
    const sumStakeKeyDeRegistrationFee = BigInt(
      protocolParams.stakeAddressDeposit * (this.txDraft.body.certificates?.deregistration.length ?? 0),
    );

    const leftOver = sumInputsValue
      .addAll(sumMint)
      .add(ADA, sumWithdrawalAmount + sumStakeKeyDeRegistrationFee)
      .subtractAll(sumOutputsValue)
      .subtract(ADA, this.txDraft.body.fee + sumStakeKeyRegistrationFee)
      .trim();

    return leftOver.isEmpty();
  }

  private async build(options: TxBuilderBuildOptions): Promise<
    Result<
      {
        txId: string;
        cTx: ECSLTransaction;
        newUtxoState: UtxoState;
      },
      TxBuildingError
    >
  > {
    const {
      changeAddress,
      provider,
      walletUtxos: _walletUtxos,
      walletCollaterals: _walletCollaterals,
      coinSelectionAlgorithm,
      debug,
    } = options;

    let finalTx: string | undefined;

    try {
      this.completeTasks({ debug: options.debug });

      const unstableProtocolParams = await provider.getUnstableProtocolParams();
      const protocolParameters: ProtocolParameters = {
        ...DEFAULT_STABLE_PROTOCOL_PARAMS[this.networkEnv],
        ...unstableProtocolParams,
      };

      const walletCollaterals = _walletCollaterals ? [..._walletCollaterals] : [];
      const walletUtxos = _walletUtxos.filter((utxo) => !Utxo.contains(this.txDraft.body.inputs, utxo));
      const allUtxos = [
        ...this.txDraft.body.inputs,
        ...this.txDraft.body.referenceInputs,
        ...walletUtxos,
        ...walletCollaterals,
      ];

      const isUsingPlutus = Object.keys(this.txDraft.plutusScripts).length > 0;
      if (isUsingPlutus) {
        const collateralSelectionResult = UtxoSelection.selectCollaterals({
          walletUtxos: walletUtxos,
          walletCollaterals: walletCollaterals,
          maxCollateralInputs: protocolParameters.maxCollateralInputs,
          currentInputs: this.txDraft.body.inputs,
          changeAddress: changeAddress,
          networkEnv: this.networkEnv,
        });
        if (collateralSelectionResult.type === "err") {
          throw collateralSelectionResult.error;
        }
        const txCollateral = collateralSelectionResult.value;

        this.txDraft.body.collateral = txCollateral;
      }

      switch (coinSelectionAlgorithm) {
        case CoinSelectionAlgorithm.SPEND_ALL_V2: {
          // Use-Case: DAO Batcher
          // Example: Spending (2ADA + 10k MIN) to (1.84 ADA + 10k MIN) output.
          this.txDraft.body.inputs.push(...walletUtxos);
          const { changeValue, txFee } = Result.unwrap(
            ChangeOutputBuilder.getChangeValue({
              networkEnv: this.networkEnv,
              txDraft: this.getTxDraft(),
              protocolParameters: protocolParameters,
            }),
          );
          // If changeOut is not cover Minimum ada, we need to add minimum ada
          const changeOut = TxOut.newPubKeyOut({
            address: changeAddress,
            value: changeValue,
          });
          const changeOutCoin = changeOut.value.coin();
          changeOut.addMinimumADAIfRequired(this.networkEnv);
          // If we had added some ada for MinimumAda, we need to minus it from fee
          const minusFee = changeOut.value.coin() - changeOutCoin;
          this.txDraft.body.outputs.push(changeOut);
          this.txDraft.body.fee = txFee - minusFee;
          break;
        }
        case CoinSelectionAlgorithm.SPEND_ALL: {
          this.txDraft.body.inputs.push(...walletUtxos);
          const { changeValue, txFee } = Result.unwrap(
            ChangeOutputBuilder.getChangeValue({
              networkEnv: this.networkEnv,
              txDraft: this.getTxDraft(),
              protocolParameters: protocolParameters,
            }),
          );
          this.txDraft.body.outputs.push(
            TxOut.newPubKeyOut({
              address: changeAddress,
              value: changeValue,
            }),
          );
          this.txDraft.body.fee = txFee;
          break;
        }
        case CoinSelectionAlgorithm.MINSWAP: {
          const { additionalInputs, changeOuts, txFee } = Result.unwrap(
            ChangeOutputBuilder.buildChangeOut({
              networkEnv: this.networkEnv,
              txDraft: this.getTxDraft(),
              changeAddress: changeAddress,
              walletUtxos: walletUtxos,
              protocolParameters: protocolParameters,
            }),
          );
          this.txDraft.body.inputs.push(...additionalInputs);
          this.txDraft.body.outputs.push(...changeOuts);
          this.txDraft.body.fee = txFee;
          break;
        }
        case CoinSelectionAlgorithm.MINWALLET_SEND_ALL: {
          this.txDraft.body.inputs.push(...walletUtxos);
          const { changeOuts, txFee } = Result.unwrap(
            ChangeOutputBuilder.buildChangeOutSendAll({
              networkEnv: this.networkEnv,
              txDraft: this.getTxDraft(),
              protocolParameters: protocolParameters,
              changeAddress: changeAddress,
            }),
          );
          this.txDraft.body.outputs.push(...changeOuts);
          this.txDraft.body.fee = txFee;
          break;
        }
        default: {
          throw new Error(`Not supported coin selection algorithms: ${coinSelectionAlgorithm}`);
        }
      }

      if (isUsingPlutus) {
        const computer = new CSLTxSerializer(this.networkEnv, this.getTxDraft(), protocolParameters);
        // evaluatedRedeemersResult = computer.evaluate(allUtxos);
        const evaluatedRedeemersResult: Result<RedeemerWithRef[], Error> = computer.evaluateV2(allUtxos);

        if (Result.isError(evaluatedRedeemersResult)) {
          if (options.debug) {
            console.error("evaluate redeemers error", evaluatedRedeemersResult.error);
            console.info(XJSON.stringify(this.getTxDraft(), 2));
          }
        }
        const evaluatedRedeemers = Result.unwrap(evaluatedRedeemersResult);
        this.txDraft.witness.redeemers = evaluatedRedeemers;
      }

      let actualFee = 0n + (options.extraFee ?? 0n);
      actualFee += new CSLTxSerializer(this.networkEnv, this.getTxDraft(), protocolParameters).getNecessaryFee();

      const currentTxFee = this.txDraft.body.fee;
      this.txDraft.body.fee = actualFee;
      const feeDiff = currentTxFee - actualFee;
      if (feeDiff > 0n) {
        const changeOuts = this.txDraft.body.outputs.filter((o) => o.address.equals(changeAddress));
        const lastChangeOut = changeOuts[changeOuts.length - 1];
        if (!lastChangeOut) {
          throw new Error("cannot find change output");
        }
        lastChangeOut.value.add(ADA, feeDiff);
      }

      if (!this.isTxBalance()) {
        throw new Error("Transaction is not balanced");
      }

      const builtTx: {
        txId: string;
        cTx: ECSLTransaction;
        cTx11: CSLTransaction;
      } = new CSLTxSerializer(this.networkEnv, this.getTxDraft(), protocolParameters).build();

      const { cTx: cFinalTx, txId } = builtTx;
      if (debug) {
        console.info(cFinalTx.to_json());
      }
      finalTx = cFinalTx.to_hex();

      if (Bytes.fromHex(finalTx).length > protocolParameters.maxTxSize) {
        throw new Error(`Transaction size exceeds ${protocolParameters.maxTxSize}`);
      }

      return Result.ok({
        txId: txId,
        cTx: cFinalTx,
        newUtxoState: TxDraft.extractUtxoState({
          txId: txId,
          txDraft: this.getTxDraft(),
          changeAddress: changeAddress,
          walletUtxos: walletUtxos,
        }),
      });
    } catch (e) {
      return Result.err(
        new TxBuildingError(e, {
          ...this.getDebugInfo(),
          allUtxos: _walletUtxos.map(Utxo.toHex),
          walletCollateralUtxos: _walletCollaterals?.map(Utxo.toHex) ?? [],
          changeOuts: this.txDraft.body.outputs.filter((o) => o.address.equals(changeAddress)).map((o) => o.toHex()),
          builtTx: finalTx,
          coinSelectionAlgorithm: coinSelectionAlgorithm,
          changeAddress: changeAddress.bech32,
          stakeAddress: changeAddress.toStakeAddress()?.bech32,
        }),
      );
    }
  }

  async completeForTxChaining(options: TxBuilderBuildOptions): Promise<Result<TxChaining, TxBuildingError>> {
    const builtTxResult = await this.build(options);
    if (builtTxResult.type === "err") {
      return builtTxResult;
    }
    const { txId, cTx, newUtxoState } = builtTxResult.value;
    return Result.ok({
      txId: txId,
      txComplete: new TxComplete(cTx),
      newUtxoState: newUtxoState,
    });
  }

  async completeUnsafeForTxChaining(options: TxBuilderBuildOptions): Promise<TxChaining> {
    return Result.unwrap(await this.completeForTxChaining(options));
  }

  async completeUnsafe(options: TxBuilderBuildOptions): Promise<TxComplete> {
    return Result.unwrap(await this.complete(options));
  }

  async complete(options: TxBuilderBuildOptions): Promise<Result<TxComplete, TxBuildingError>> {
    const builtTxResult = await this.build(options);
    if (builtTxResult.type === "err") {
      return builtTxResult;
    }
    return Result.ok(new TxComplete(builtTxResult.value.cTx));
  }

  async canComplete(options: TxBuilderBuildOptions): Promise<boolean> {
    try {
      await this.completeUnsafe(options);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }
}

export class TxComplete {
  private cTx: ECSLTransaction;

  constructor(cTx: ECSLTransaction) {
    this.cTx = cTx;
  }

  signWithPrivateKey(...privateKeys: PrivateKey[]): this {
    const cWitness = this.partialSignWithPrivateKey(...privateKeys);
    return this.assemble(cWitness);
  }
  partialSignWithPrivateKey(...privateKeys: PrivateKey[]): CborHex<ECSLTransactionWitnessSet> {
    const ECSL = RustModule.getE;

    // From Conway Era, please use ECSL to calculate TxHash
    const txHash = ECSLConverter.getTxHash(this.cTx);
    const witnessSet = ECSL.TransactionWitnessSet.new();
    const vkeyWitnesses = ECSL.Vkeywitnesses.new();
    for (const key of privateKeys) {
      const pKey = key.toECSL();
      const cslTxHash = ECSL.TransactionHash.from_hex(txHash);
      const vKey = ECSL.make_vkey_witness(cslTxHash, pKey);
      vkeyWitnesses.add(vKey);
      safeFreeRustObjects(pKey, vKey, cslTxHash);
    }
    witnessSet.set_vkeys(vkeyWitnesses);
    const witnesses = witnessSet.to_hex();

    safeFreeRustObjects(witnessSet, vkeyWitnesses);
    return witnesses;
  }
  assemble(witnesses: CborHex<ECSLTransactionWitnessSet>): this {
    const ECSL = RustModule.getE;
    const allVkeyWitnesses: CborHex<CSLVkeywitness>[] = [];
    const txWitnessSet = this.cTx.witness_set();
    const originalVkeyWitnesses = txWitnessSet.vkeys();
    if (originalVkeyWitnesses && originalVkeyWitnesses.len() > 0) {
      allVkeyWitnesses.push(
        ...unwrapRustVec(originalVkeyWitnesses).map((v) => {
          const vkw = v.to_hex();
          safeFreeRustObjects(v);
          return vkw;
        }),
      );
    }
    const witnessSet = ECSL.TransactionWitnessSet.from_hex(witnesses);
    const additionalVkeyWitnesses = witnessSet.vkeys();
    if (!additionalVkeyWitnesses || additionalVkeyWitnesses.len() === 0) {
      throw new Error("witness set must have signatures");
    }
    allVkeyWitnesses.push(
      ...unwrapRustVec(additionalVkeyWitnesses).map((v) => {
        const vkw = v.to_hex();
        safeFreeRustObjects(v);
        return vkw;
      }),
    );
    const finalVkeyWitnesses = ECSL.Vkeywitnesses.new();
    for (const vkw of unique(allVkeyWitnesses)) {
      const vKeyWitness = ECSL.Vkeywitness.from_hex(vkw);
      finalVkeyWitnesses.add(vKeyWitness);
      safeFreeRustObjects(vKeyWitness);
    }

    const currentTxWitnessSet = this.cTx.witness_set();
    const _finalWitnessSet = ECSL.TransactionWitnessSet.from_hex(currentTxWitnessSet.to_hex());
    _finalWitnessSet.set_vkeys(finalVkeyWitnesses);

    const finalWitnessSet = ECSL.TransactionWitnessSet.from_hex(_finalWitnessSet.to_hex());

    const currentTxBody = this.cTx.body();
    const currentTxAuxiliary = this.cTx.auxiliary_data();
    const finalTx = ECSL.Transaction.new(currentTxBody, finalWitnessSet, currentTxAuxiliary);
    this.cTx = finalTx;
    return this;
  }
  complete(): CborHex<ECSLTransaction> {
    return this.cTx.to_hex();
  }
}
