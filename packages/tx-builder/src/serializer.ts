import invariant from "@minswap/tiny-invariant";
import { getSlotConfig, ADA, Bytes, CborSerializer, CredentialType, ExUnit, getSlotFromTimeMagic, NetworkEnvironment, PlutusData, PlutusList, PlutusVersion, ProtocolParameters, Redeemer, RedeemerType, RedeemerWithRef, RewardAddress, TxIn, Utxo, Value } from "@repo/ledger-core";
import { CSLTransactionBuilder, RustModule, Maybe, safeFreeRustObjects, CSLPlutusScripts, CSLPlutusScript, CSLPlutusList, CSLPlutusData, CSLRedeemers, ECSLTransaction, CSLTransaction, Result, unwrapRustVec, unwrapRustMap, Duration } from "@repo/ledger-utils";
import JSONBig from "json-bigint";
import { ECSLConverter } from "./ecsl-converter";
import { TxDraft } from "./types";
import { TxBuilderUtils } from "./utils";
import { CertsBuilder } from "./certs-builder";

export function fakeSignature(): string {
  return "dfaabe3664b19c02a2c20ed8bc4abcf2a59975e7212c6857eb89f58f4b6854c9ba78ca491b7bf625ef82a6c4119701382e2817f099cb1b42796e55d3dacb090d";
}

export function fakePubKey(): string {
  return "ed25519_pk17jp8qj5q3x34anfvtfnps4yjfal2hrh4uzg38s04nx5p6zm7cuzsv86c8m";
}

export class CSLTxSerializer {
  private readonly networkEnv: NetworkEnvironment;
  private readonly txDraft: TxDraft;
  private readonly protocolParameters: ProtocolParameters;
  readonly cBuilder: CSLTransactionBuilder;
  constructor(networkEnv: NetworkEnvironment, txDraft: TxDraft, protocolParameters: ProtocolParameters) {
    this.networkEnv = networkEnv;
    this.protocolParameters = protocolParameters;
    this.txDraft = txDraft;
    this.cBuilder = TxBuilderUtils.createTransactionBuilder(this.networkEnv);
  }

  private buildInput(): this {
    const CSL = RustModule.get;
    const cInputBuilder = CSL.TxInputsBuilder.new();
    for (const utxo of this.txDraft.body.inputs) {
      const addr = utxo.output.address;
      const addrCred = Maybe.unwrap(addr.toPaymentCredential(), "");
      const cAddress = utxo.output.address.toCSL();
      const cValue = utxo.output.value.toCSL();
      const cInput = TxIn.toCSL(utxo.input);
      if (addrCred.type === CredentialType.PUB_KEY_CREDENTIAL) {
        cInputBuilder.add_input(cAddress, cInput, cValue);
      } else {
        const plutusScriptOrRef = this.txDraft.plutusScripts[addrCred.payload.hex];
        const cNativeScript = this.txDraft.nativeScripts[addrCred.payload.hex];
        if (cNativeScript) {
          cInputBuilder.add_native_script_input(cNativeScript, cInput, cValue);
        } else if (plutusScriptOrRef) {
          cInputBuilder.add_input(cAddress, cInput, cValue);
        } else {
          throw new Error("Scripts must be attached BEFORE they are used");
        }
      }
    }
    this.cBuilder.set_inputs(cInputBuilder);
    return this;
  }

  private buildMint(): this {
    const mintAssets = this.txDraft.body.mint;
    const mintPolicyIds = mintAssets.policyIds();
    if (mintAssets.isEmpty()) {
      return this;
    }
    const CSL = RustModule.get;
    const cMint = CSL.Mint.new();
    const value = new Value();

    // Map from policyID to map from assetName to amount
    const assetMap: Record<string, Record<string, bigint>> = {};

    // Add mints to assetMap
    for (const [asset, amount] of mintAssets.flatten()) {
      invariant(!asset.equals(ADA), "you can't mint ADA");
      const policyID = asset.currencySymbol.hex;
      const assetName = asset.tokenName.hex;
      if (assetMap[policyID] === undefined) {
        assetMap[policyID] = {};
      }
      if (assetMap[policyID][assetName] === undefined) {
        assetMap[policyID][assetName] = 0n;
      }
      assetMap[policyID][assetName] += amount;
      value.add(asset, amount);
    }

    for (const [policyID, assetNameMap] of Object.entries(assetMap)) {
      const cMintAssets = CSL.MintAssets.new();
      for (const [assetName, amount] of Object.entries(assetNameMap)) {
        cMintAssets.insert(
          CSL.AssetName.new(Bytes.fromHex(assetName).bytes),
          amount >= 0
            ? CSL.Int.new(CSL.BigNum.from_str(amount.toString()))
            : CSL.Int.new_negative(CSL.BigNum.from_str((-amount).toString())),
        );
      }
      cMint.insert(CSL.ScriptHash.from_bytes(Bytes.fromHex(policyID).bytes), cMintAssets);
    }
    // build nativeScripts
    const cNativeScripts = CSL.NativeScripts.new();

    for (const mintPolicyId of mintPolicyIds) {
      if (this.txDraft.nativeScripts[mintPolicyId.hex]) {
        cNativeScripts.add(this.txDraft.nativeScripts[mintPolicyId.hex]);
      }
    }
    this.cBuilder.set_mint(cMint, cNativeScripts);
    return this;
  }

  private buildReferenceInputs(): this {
    for (const refInput of this.txDraft.body.referenceInputs) {
      this.cBuilder.add_reference_input(TxIn.toCSL(refInput.input));
    }
    return this;
  }

  private buildWithdrawals(): this {
    const withdrawal = this.txDraft.body.withdrawals;
    if (Object.keys(withdrawal).length === 0) {
      return this;
    }
    const CSL = RustModule.get;
    const cWithdrawals = CSL.Withdrawals.new();
    for (const [rewardAddressStr, amount] of Object.entries(withdrawal)) {
      const rewardAddress = RewardAddress.fromBech32(rewardAddressStr);
      const cslRewardAddr = CSL.RewardAddress.from_address(rewardAddress.toCSL());
      invariant(cslRewardAddr);
      cWithdrawals.insert(cslRewardAddr, CSL.BigNum.from_str(amount.toString()));
    }
    this.cBuilder.set_withdrawals(cWithdrawals);
    return this;
  }

  private buildValidity(): this {
    const defaultValidUntil = getSlotFromTimeMagic(this.networkEnv, Duration.after(new Date(), Duration.newHours(3)));
    if (!this.txDraft.body.validity) {
      this.cBuilder.set_ttl(defaultValidUntil);
      return this;
    }
    const { validFrom, validUntil } = this.txDraft.body.validity;
    if (Maybe.isJust(validFrom)) {
      this.cBuilder.set_validity_start_interval(validFrom);
    }
    if (Maybe.isJust(validUntil)) {
      this.cBuilder.set_ttl(validUntil);
    } else {
      this.cBuilder.set_ttl(defaultValidUntil);
    }
    return this;
  }

  private buildCollaterals(): this {
    if (!this.txDraft.body.collateral) {
      return this;
    }
    const CSL = RustModule.get;
    const cCollateralBuilder = CSL.TxInputsBuilder.new();
    const { collaterals, collateralReturn } = this.txDraft.body.collateral;

    for (const collateral of collaterals) {
      const cAddress = collateral.output.address.toCSL();
      const cInput = TxIn.toCSL(collateral.input);
      const cValue = collateral.output.value.toCSL();
      cCollateralBuilder.add_input(cAddress, cInput, cValue);
    }
    this.cBuilder.set_collateral(cCollateralBuilder);
    if (collateralReturn) {
      this.cBuilder.set_collateral_return_and_total(collateralReturn.toCSL());
    }
    return this;
  }

  private buildOutputs(): this {
    for (const output of this.txDraft.body.outputs) {
      const cOut = output.toCSL();
      this.cBuilder.add_output(cOut);
      safeFreeRustObjects(cOut);
    }
    return this;
  }

  private buildSigners(): this {
    for (const signer of this.txDraft.body.requireSigners) {
      this.cBuilder.add_required_signer(signer.toCSL());
    }
    return this;
  }

  private buildCerts(): this {
    const certs = this.txDraft.body.certificates;
    if (certs) {
      const certBuilder = new CertsBuilder();
      if (certs.registrations.length > 0) {
        certBuilder.registerStakeKey(...certs.registrations);
      }
      if (certs.deregistration.length > 0) {
        certBuilder.deregisterStakeKey(...certs.deregistration);
      }
      if (certs.delegations.length > 0) {
        certBuilder.delegateStakeKey(...certs.delegations);
      }
      if (certs.voteDelegation.length > 0) {
        certBuilder.delegateVote(...certs.voteDelegation);
      }
      const cCertificates = certBuilder.build();
      this.cBuilder.set_certs(cCertificates);
    }
    return this;
  }

  // Export for testing
  buildMetadata(): this {
    if (Object.keys(this.txDraft.metadata).length === 0) {
      return this;
    }
    const CSL = RustModule.get;
    for (const [k, v] of Object.entries(this.txDraft.metadata)) {
      const metadataKey = CSL.BigNum.from_str(k);
      this.cBuilder.add_json_metadatum(metadataKey, JSONBig.stringify(v));
    }
    return this;
  }

  private buildPlutusScripts(): Maybe<CSLPlutusScripts> {
    const CSL = RustModule.get;
    if (Object.keys(this.txDraft.witness.plutusScripts).length === 0) {
      return null;
    }
    const cScripts: CSLPlutusScript[] = [];
    for (const plutusScript of Object.values(this.txDraft.witness.plutusScripts)) {
      const cPlutusScript = CSL.PlutusScript.from_bytes_with_version(
        Bytes.fromHex(plutusScript.script).bytes,
        PlutusVersion.toCSL(PlutusVersion.fromPlutusType(plutusScript.type)),
      );
      cScripts.push(cPlutusScript);
    }
    const cPlutusScripts = CSL.PlutusScripts.new();
    for (const cScript of cScripts) {
      cPlutusScripts.add(cScript);
    }
    return cPlutusScripts;
  }

  private buildPlutusDatums(): Maybe<{
    cslPlutusList: CSLPlutusList;
    plutusList: PlutusList;
  }> {
    const CSL = RustModule.get;
    if (Object.keys(this.txDraft.witness.plutusData).length === 0) {
      return null;
    }
    const datums: string[] = Object.values(this.txDraft.witness.plutusData);
    const cDatums: CSLPlutusData[] = datums.map(CSL.PlutusData.from_hex);

    const cPlutusList = CSL.PlutusList.new();
    for (const cDatum of cDatums) {
      cPlutusList.add(cDatum);
    }
    return {
      cslPlutusList: cPlutusList,
      plutusList: PlutusList.unwrapToPlutusList(PlutusData.fromDataHex(cPlutusList.to_hex())),
    };
  }

  private buildPlutusRedeemers(): Maybe<{
    cslRedeemers: CSLRedeemers;
    redeemers: Redeemer[];
  }> {
    const txRedeemers = this.txDraft.witness.redeemers;
    if (txRedeemers.length === 0) {
      return null;
    }
    const spendRedeemers: RedeemerWithRef[] = [];
    const mintRedeemers: RedeemerWithRef[] = [];
    const withdrawalRedeemers: RedeemerWithRef[] = [];
    for (const redeemer of txRedeemers) {
      switch (redeemer.type) {
        case RedeemerType.SPEND: {
          spendRedeemers.push(redeemer);
          break;
        }
        case RedeemerType.MINT: {
          mintRedeemers.push(redeemer);
          break;
        }
        case RedeemerType.REWARD: {
          withdrawalRedeemers.push(redeemer);
          break;
        }
        case RedeemerType.CERT: {
          throw new Error("Not supported CERT redeemer");
        }
      }
    }

    const CSL = RustModule.get;
    const cRedeemers = CSL.Redeemers.new();

    const sortedTxIns = [...this.txDraft.body.inputs].sort((a, b) => TxIn.compare(a.input, b.input));
    // build spend redeemer
    for (const redeemer of spendRedeemers) {
      const index = sortedTxIns.findIndex((utxo) => TxIn.toString(utxo.input) === redeemer.ref);
      if (index === -1) {
        throw new Error(`Not found index of input ${redeemer.ref}`);
      }
      if (!redeemer.redeemerData) {
        throw new Error(`Not found redeemer data of input ${redeemer.ref}`);
      }
      redeemer.index = index;
      cRedeemers.add(
        CSL.Redeemer.new(
          CSL.RedeemerTag.new_spend(),
          CSL.BigNum.from_str(index.toString()),
          PlutusData.toCSL(redeemer.redeemerData),
          ExUnit.toCSL(redeemer.exUnit),
        ),
      );
    }

    const sortedPolicyIds: string[] = this.txDraft.body.mint
      .policyIds()
      .map((pid) => pid.hex)
      .sort();
    for (const redeemer of mintRedeemers) {
      const index = sortedPolicyIds.findIndex((pid) => pid === redeemer.ref);
      if (index === -1) {
        throw new Error(`Not found index of PolicyID ${redeemer.ref}`);
      }
      if (!redeemer.redeemerData) {
        throw new Error(`Not found redeemer data of PolicyID ${redeemer.ref}`);
      }
      redeemer.index = index;
      cRedeemers.add(
        CSL.Redeemer.new(
          CSL.RedeemerTag.new_mint(),
          CSL.BigNum.from_str(index.toString()),
          PlutusData.toCSL(redeemer.redeemerData),
          ExUnit.toCSL(redeemer.exUnit),
        ),
      );
    }

    const sortedRewardAddresses: RewardAddress[] = Object.keys(this.txDraft.body.withdrawals)
      .map(RewardAddress.fromBech32)
      .sort((a, b) => a.compare(b));
    for (const redeemer of withdrawalRedeemers) {
      const index = sortedRewardAddresses.findIndex((rewardAddr) => rewardAddr.bech32 === redeemer.ref);
      if (index === -1) {
        throw new Error(`Not found index of Reward Address ${redeemer.ref}`);
      }
      if (!redeemer.redeemerData) {
        throw new Error(`Not found redeemer data of Reward Address ${redeemer.ref}`);
      }
      redeemer.index = index;
      cRedeemers.add(
        CSL.Redeemer.new(
          CSL.RedeemerTag.new_reward(),
          CSL.BigNum.from_str(index.toString()),
          PlutusData.toCSL(redeemer.redeemerData),
          ExUnit.toCSL(redeemer.exUnit),
        ),
      );
    }

    return {
      cslRedeemers: cRedeemers,
      redeemers: [...spendRedeemers, ...mintRedeemers, ...withdrawalRedeemers],
    };
  }

  private getPlutusVersions(): PlutusVersion[] {
    const plutusVersions: PlutusVersion[] = [];
    const scripts = Object.values(this.txDraft.plutusScripts);
    for (const script of scripts) {
      let cslScript: CSLPlutusScript | undefined = undefined;
      if ("inlineScript" in script) {
        cslScript = script.inlineScript;
      } else if ("referenceScript" in script) {
        cslScript = script.referenceScript;
      } else {
        throw new Error("Invalid script");
      }
      const plutusVersion = PlutusVersion.fromCSL(cslScript.language_version());
      if (plutusVersions.includes(plutusVersion)) {
        continue;
      }
      plutusVersions.push(plutusVersion);
    }
    return plutusVersions;
  }

  private buildAndSetRedeemersAndScripts(): this {
    const CSL = RustModule.get;
    const plutusScripts = this.buildPlutusScripts();
    const redeemers = this.buildPlutusRedeemers();
    const datums = this.buildPlutusDatums();
    if (Maybe.isJust(plutusScripts)) {
      this.cBuilder.set_plutus_scripts(plutusScripts);
    }
    if (Maybe.isJust(redeemers)) {
      this.cBuilder.set_redeemers(redeemers.cslRedeemers);
    }
    if (Maybe.isJust(datums)) {
      this.cBuilder.set_plutus_data(datums.cslPlutusList);
    }
    if (Maybe.isJust(redeemers) || Maybe.isJust(datums)) {
      const scriptDataHash = CborSerializer.ScriptDataHash.generate({
        redeemers: redeemers?.redeemers ?? [],
        plutusVersions: this.getPlutusVersions(),
        costModels: this.protocolParameters.costModels,
        plutusDataList: datums?.plutusList,
        computeMethod: "CSL",
      });
      const cScriptDataHash = CSL.ScriptDataHash.from_hex(scriptDataHash);
      this.cBuilder.set_script_data_hash(cScriptDataHash);
    }
    safeFreeRustObjects(plutusScripts, redeemers?.cslRedeemers, datums?.cslPlutusList);
    return this;
  }

  private buildFee(): this {
    const CSL = RustModule.get;
    this.cBuilder.set_fee(CSL.BigNum.from_str(this.txDraft.body.fee.toString()));
    return this;
  }

  private getFee(): bigint {
    const cTxSizeFee = this.cBuilder.min_fee();
    const txSizeFee = BigInt(cTxSizeFee.to_str());

    const referenceFeeCfg = this.protocolParameters.referenceFee;

    const refFee = TxBuilderUtils.calReferenceInputsFee({
      inputs: this.txDraft.body.inputs,
      referenceInputs: this.txDraft.body.referenceInputs,
      referenceFeeCfg,
    });

    // Build transaction by CSL 11
    const cTx11 = this.internalBuild().cBuilder.build_tx();
    const txRaw = cTx11.to_hex();
    // Compute transaction size of transaction made by CSL 11
    const cTxLen11 = cTx11.to_bytes().length;
    // Deserialize transaction by CSL 13
    const eTx = ECSLConverter.getTransactionFromHex(txRaw);
    // Compute transaction size of transaction made by CSL 13
    const cTxLen13 = eTx.to_bytes().length;
    // Calculate different size between CSL 11 & CSL 13 (due to some new governance fields)
    const extraTxSize = BigInt(Math.abs(cTxLen13 - cTxLen11));
    // Calculate the different fee due to different size
    const extraTxSizeFee = extraTxSize * BigInt(this.protocolParameters.txFeePerByte);

    safeFreeRustObjects(cTxSizeFee, cTx11, eTx);

    return txSizeFee + refFee + extraTxSizeFee;
  }

  private internalBuild(): this {
    return this.buildInput()
      .buildOutputs()
      .buildMint()
      .buildReferenceInputs()
      .buildWithdrawals()
      .buildCerts()
      .buildValidity()
      .buildCollaterals()
      .buildAndSetRedeemersAndScripts()
      .buildFee()
      .buildSigners()
      .buildMetadata();
  }

  getTxSize(): number {
    this.internalBuild();
    return this.cBuilder.full_size();
  }

  getNecessaryFee(): bigint {
    return this.internalBuild().getFee();
  }

  build(): {
    txId: string;
    cTx: ECSLTransaction;
    cTx11: CSLTransaction;
  } {
    const cTx11 = this.internalBuild().cBuilder.build_tx();

    const txRaw = cTx11.to_hex();
    const cTx = ECSLConverter.getTransactionFromHex(txRaw);
    const txID = ECSLConverter.getTxHash(cTx);

    return {
      txId: txID,
      cTx,
      cTx11,
    };
  }

  evaluateV2(allUtxos: Utxo[]): Result<RedeemerWithRef[], Error> {
    try {
      const CSL = RustModule.get;
      const UPLC = RustModule.getU;
      const cslDraftTx = this.build().cTx11;
      const cslTxBody = cslDraftTx.body();
      const cslTxInputs = cslTxBody.inputs();
      const cslTxRefInputs = cslTxBody.reference_inputs();
      const txIns: TxIn[] = unwrapRustVec(cslTxInputs)
        .map((input) => input.to_hex())
        .map(TxIn.fromHex);
      const refIns: TxIn[] = [];
      if (cslTxRefInputs) {
        refIns.push(
          ...unwrapRustVec(cslTxRefInputs)
            .map((input) => input.to_hex())
            .map(TxIn.fromHex),
        );
      }
      const txInSet = new Set<string>(txIns.map(TxIn.toString));
      const refInSet = new Set<string>(refIns.map(TxIn.toString));
      const utxos: Utxo[] = [];
      for (const utxo of allUtxos) {
        const txIn = TxIn.toString(utxo.input);
        if (txInSet.has(txIn) || refInSet.has(txIn)) {
          utxos.push(utxo);
        }
      }

      const mem = CSL.BigNum.from_str(this.protocolParameters.maxTxExecutionUnits.memory.toString());
      const step = CSL.BigNum.from_str(this.protocolParameters.maxTxExecutionUnits.steps.toString());
      const maxExUnits = CSL.ExUnits.new(mem, step);
      const { zeroTime, zeroSlot, slotLength } = getSlotConfig(this.networkEnv);
      const cslZeroTime = CSL.BigNum.from_str(zeroTime);
      const cslZeroSlot = CSL.BigNum.from_str(zeroSlot);
      const costModels = CSL.Costmdls.from_hex(
        CborSerializer.CCostModels.toHex(this.getPlutusVersions(), this.protocolParameters.costModels),
      );
      const utxo_inputs = utxos.map((u) => TxIn.toCSL(u.input).to_bytes());
      const utxo_outputs = utxos.map((u) => u.output.toCSL().to_bytes());
      const cslEvaluatedRedeemers = UPLC.get_ex_units(
        cslDraftTx.to_bytes(),
        utxo_inputs,
        utxo_outputs,
        costModels.to_bytes(),
        BigInt(maxExUnits.steps().to_str()),
        BigInt(maxExUnits.mem().to_str()),
        BigInt(cslZeroTime.to_str()),
        BigInt(cslZeroSlot.to_str()),
        slotLength,
      );
      const sortedTxIns = [...txIns].sort((a, b) => TxIn.compare(a, b));
      const cslMint = cslTxBody.mint();
      let sortedPolicyIds: string[] = [];
      if (cslMint) {
        const policyIds = unwrapRustMap(cslMint).map(([hash, _]) => hash.to_hex());
        sortedPolicyIds = policyIds.sort();
      }

      let sortedRewardAddresses: RewardAddress[] = [];
      const cslWithdrawals = cslTxBody.withdrawals();
      if (cslWithdrawals) {
        const cslRewardAdddresses = cslWithdrawals.keys();
        sortedRewardAddresses = unwrapRustVec(cslRewardAdddresses)
          .map((cslRewardAddr) => {
            const cslAddr = cslRewardAddr.to_address();
            const rewardAddr = RewardAddress.fromBech32(cslAddr.to_bech32());
            safeFreeRustObjects(cslRewardAddr, cslAddr);
            return rewardAddr;
          })
          .sort((a, b) => a.compare(b));
        safeFreeRustObjects(cslRewardAdddresses);
      }
      const redeemers: Redeemer[] = [];
      for (const evaluatedRedeemer of cslEvaluatedRedeemers) {
        const cslRedeemer = CSL.Redeemer.from_bytes(evaluatedRedeemer);
        redeemers.push(Redeemer.fromCSLSingular(cslRedeemer));
      }
      const redeemersWithRef: RedeemerWithRef[] = [];
      for (const redeemer of redeemers) {
        switch (redeemer.type) {
          case RedeemerType.SPEND: {
            redeemersWithRef.push({
              ...redeemer,
              ref: TxIn.toString(sortedTxIns[redeemer.index]),
            });
            break;
          }
          case RedeemerType.MINT: {
            redeemersWithRef.push({
              ...redeemer,
              ref: sortedPolicyIds[redeemer.index],
            });
            break;
          }
          case RedeemerType.CERT: {
            // Not supported yet
            break;
          }
          case RedeemerType.REWARD: {
            redeemersWithRef.push({
              ...redeemer,
              ref: sortedRewardAddresses[redeemer.index].bech32,
            });
            break;
          }
        }
      }

      safeFreeRustObjects(
        cslDraftTx,
        cslTxBody,
        cslTxInputs,
        cslTxRefInputs,
        cslMint,
        cslWithdrawals,
        mem,
        step,
        maxExUnits,
        costModels,
        cslZeroTime,
        cslZeroSlot,
      );

      return Result.ok(redeemersWithRef);
    } catch (err) {
      const errorMessage = typeof err?.toString === "function" ? err.toString() : JSON.stringify(err);
      return Result.err(new Error(errorMessage));
    }
  }

  evaluate(allUtxos: Utxo[]): Result<RedeemerWithRef[], Error> {
    try {
      const CSL = RustModule.get;
      const cslDraftTx = this.build().cTx11;
      const cslTxBody = cslDraftTx.body();
      const cslTxInputs = cslTxBody.inputs();
      const cslTxRefInputs = cslTxBody.reference_inputs();
      const txIns: TxIn[] = unwrapRustVec(cslTxInputs)
        .map((input) => input.to_hex())
        .map(TxIn.fromHex);
      const refIns: TxIn[] = [];
      if (cslTxRefInputs) {
        refIns.push(
          ...unwrapRustVec(cslTxRefInputs)
            .map((input) => input.to_hex())
            .map(TxIn.fromHex),
        );
      }
      const txInSet = new Set<string>(txIns.map(TxIn.toString));
      const refInSet = new Set<string>(refIns.map(TxIn.toString));
      const utxos: Utxo[] = [];
      for (const utxo of allUtxos) {
        const txIn = TxIn.toString(utxo.input);
        if (txInSet.has(txIn) || refInSet.has(txIn)) {
          utxos.push(utxo);
        }
      }

      const cslUtxos = Utxo.listToCSL(utxos);
      const mem = CSL.BigNum.from_str(this.protocolParameters.maxTxExecutionUnits.memory.toString());
      const step = CSL.BigNum.from_str(this.protocolParameters.maxTxExecutionUnits.steps.toString());
      const maxExUnits = CSL.ExUnits.new(mem, step);
      const { zeroTime, zeroSlot, slotLength } = getSlotConfig(this.networkEnv);
      const cslZeroTime = CSL.BigNum.from_str(zeroTime);
      const cslZeroSlot = CSL.BigNum.from_str(zeroSlot);
      const costModels = CSL.Costmdls.from_hex(
        CborSerializer.CCostModels.toHex(this.getPlutusVersions(), this.protocolParameters.costModels),
      );
      const cslEvaluatedRedeemers = CSL.get_ex_units(
        cslDraftTx,
        cslUtxos,
        costModels,
        maxExUnits,
        cslZeroTime,
        cslZeroSlot,
        slotLength,
      );
      const sortedTxIns = [...txIns].sort((a, b) => TxIn.compare(a, b));
      const cslMint = cslTxBody.mint();
      let sortedPolicyIds: string[] = [];
      if (cslMint) {
        const policyIds = unwrapRustMap(cslMint).map(([hash, _]) => hash.to_hex());
        sortedPolicyIds = policyIds.sort();
      }

      let sortedRewardAddresses: RewardAddress[] = [];
      const cslWithdrawals = cslTxBody.withdrawals();
      if (cslWithdrawals) {
        const cslRewardAdddresses = cslWithdrawals.keys();
        sortedRewardAddresses = unwrapRustVec(cslRewardAdddresses)
          .map((cslRewardAddr) => {
            const cslAddr = cslRewardAddr.to_address();
            const rewardAddr = RewardAddress.fromBech32(cslAddr.to_bech32());
            safeFreeRustObjects(cslRewardAddr, cslAddr);
            return rewardAddr;
          })
          .sort((a, b) => a.compare(b));
        safeFreeRustObjects(cslRewardAdddresses);
      }

      const redeemers = Redeemer.fromHex(cslEvaluatedRedeemers.to_hex());
      const redeemersWithRef: RedeemerWithRef[] = [];
      for (const redeemer of redeemers) {
        switch (redeemer.type) {
          case RedeemerType.SPEND: {
            redeemersWithRef.push({
              ...redeemer,
              ref: TxIn.toString(sortedTxIns[redeemer.index]),
            });
            break;
          }
          case RedeemerType.MINT: {
            redeemersWithRef.push({
              ...redeemer,
              ref: sortedPolicyIds[redeemer.index],
            });
            break;
          }
          case RedeemerType.CERT: {
            // Not supported yet
            break;
          }
          case RedeemerType.REWARD: {
            redeemersWithRef.push({
              ...redeemer,
              ref: sortedRewardAddresses[redeemer.index].bech32,
            });
            break;
          }
        }
      }

      safeFreeRustObjects(
        cslDraftTx,
        cslTxBody,
        cslTxInputs,
        cslTxRefInputs,
        cslUtxos,
        cslMint,
        cslWithdrawals,
        mem,
        step,
        maxExUnits,
        costModels,
        cslZeroTime,
        cslZeroSlot,
        cslEvaluatedRedeemers,
      );

      return Result.ok(redeemersWithRef);
    } catch (err) {
      return Result.err(new Error(JSON.stringify(err)));
    }
  }
}
