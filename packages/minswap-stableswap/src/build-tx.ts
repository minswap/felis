import invariant from "@minswap/tiny-invariant";
import {
  type Address,
  type Asset,
  Bytes,
  DatumSource,
  DatumSourceType,
  type NetworkEnvironment,
  PlutusData,
  PlutusInt,
  TxIn,
  TxOut,
  type Utxo,
  Value,
} from "@minswap/felis-ledger-core";
import { Maybe } from "@minswap/felis-ledger-utils";
import { MetadataMessage } from "@minswap/felis-build-tx";
import { TxBuilder } from "@minswap/felis-tx-builder";
import { getStableswapPoolConfig, getStableswapReferencesScript } from "./configs";
import { type StableswapOrder, StableswapOrderRedeemer } from "./order";
import {
  type StableswapPool,
  StableswapPoolDatum,
  StableswapPoolRedeemer,
  StableswapPoolRedeemerType,
} from "./pool";

export namespace StableswapTransaction {
  export type CreatePoolOptions = {
    networkEnv: NetworkEnvironment;
    amplificationCoefficient: bigint;
    poolKey: string;
  };

  export function createPoolTx({ networkEnv, amplificationCoefficient, poolKey }: CreatePoolOptions): {
    txBuilder: TxBuilder;
    lpAsset: Asset;
  } {
    const poolConfig = getStableswapPoolConfig(poolKey, networkEnv);
    invariant(poolConfig.assets.length >= 2, `number of assets must be greater than or equal 2`);
    invariant(
      poolConfig.assets.length === poolConfig.multiples.length,
      `number of assets must be equals number of its multiple`,
    );
    const scriptHash = poolConfig.orderAddress.toScriptHash();
    invariant(scriptHash, "stableswap order address must have script hash");
    const orderHash = Bytes.fromHex(scriptHash.hex);

    const poolDatum: StableswapPoolDatum = {
      balances: poolConfig.assets.map((_) => 0n),
      totalLiquidity: 0n,
      amplificationCoefficient: amplificationCoefficient,
      orderHash: orderHash,
    };
    const poolDatumHex = StableswapPoolDatum.toDataHex(poolDatum);
    const nftAsset = poolConfig.nftAsset;
    const lpAsset = poolConfig.lpAsset;

    const poolValue = new Value().add(nftAsset, 1n);

    const poolTxOut = TxOut.newScriptOut({
      address: poolConfig.poolAddress,
      value: poolValue,
      datumSource: DatumSource.newInlineDatum(Bytes.fromHex(poolDatumHex)),
    }).addMinimumADAIfRequired(networkEnv);
    const txb = new TxBuilder(networkEnv)
      .payTo(poolTxOut)
      .addMessageMetadata("msg", [MetadataMessage.DEX_CREATE_POOL]);
    return {
      txBuilder: txb,
      lpAsset: lpAsset,
    };
  }

  export type FeeSharingForProject = {
    address: Address;
    additionalDatum?: string;
    percent: {
      numerator: bigint;
      denominator: bigint;
    };
  };

  export type WithdrawAdminFeeOptions = {
    networkEnv: NetworkEnvironment;
    pool: StableswapPool;
    poolUtxo: Utxo;
    feeToAddress: Address;
    inputsToChoose: Utxo[];
    feeForProjects?: FeeSharingForProject;
  };

  export function withdrawAdminFeeTx({
    networkEnv,
    pool,
    poolUtxo,
    feeToAddress,
    inputsToChoose,
    feeForProjects,
  }: WithdrawAdminFeeOptions): TxBuilder {
    const poolConfig = getStableswapPoolConfig(pool.poolIdentifier, networkEnv);
    const referencesScript = getStableswapReferencesScript(pool.poolIdentifier, networkEnv);

    const poolInDatumPlutusData = StableswapPoolDatum.toPlutusJson(pool.datum);
    const datumRaw = Bytes.fromHex(PlutusData.toDataHex(poolInDatumPlutusData));

    const earnedAmounts = pool.earnedAdminFeeAmounts;
    const poolAssets = pool.assetInfos.map((info) => info.asset);

    const totalEarnedAmount = earnedAmounts.reduce((acc, amount) => amount + acc, 0n);
    invariant(totalEarnedAmount > 0n, "No Admin fee is earned");

    const adminUtxo = inputsToChoose.find((utxo) => utxo.output.value.get(poolConfig.adminAsset) === 1n);
    invariant(adminUtxo, "not found pool Admin utxo");

    const txInputs: Utxo[] = [...inputsToChoose, poolUtxo].sort((a, b) => TxIn.compare(a.input, b.input));

    const adminIndex = txInputs.findIndex((txIn) => TxIn.compare(txIn.input, adminUtxo.input) === 0);
    invariant(adminIndex !== -1, "not found pool Admin in the input");
    const redeemer: StableswapPoolRedeemer = {
      type: StableswapPoolRedeemerType.WITHDRAW_ADMIN_FEE,
      adminIndex: BigInt(adminIndex),
      feeToIndex: 0n,
    };
    const adminValue = new Value();
    const newPoolValue = poolUtxo.output.value.clone();
    for (let i = 0; i < poolAssets.length; i++) {
      if (earnedAmounts[i] > 0n) {
        adminValue.add(poolAssets[i], earnedAmounts[i]);
        newPoolValue.remove(poolAssets[i], earnedAmounts[i]);
      }
    }

    const adminTxOut = new TxOut(feeToAddress, adminValue);
    const poolTxOut = TxOut.newScriptOut({
      address: poolConfig.poolAddress,
      value: newPoolValue,
      datumSource: DatumSource.newInlineDatum(datumRaw),
    });
    const tx = new TxBuilder(networkEnv)
      .readFrom(referencesScript.poolRef)
      .collectFromPubKey(...inputsToChoose)
      .collectFromPlutusContract(
        [poolUtxo],
        StableswapPoolRedeemer.toPlutusJson(redeemer),
        !poolUtxo.output.includeInlineDatums() ? poolInDatumPlutusData : undefined,
      )
      .payTo(adminTxOut, poolTxOut)
      .addMessageMetadata("msg", [MetadataMessage.STABLESWAP_WITHDRAW_ADMIN_FEE]);

    if (feeForProjects) {
      const projectAddress = feeForProjects.address;
      const projectValue = new Value();
      for (const [asset, amount] of adminValue.flatten()) {
        const projectAmount = (amount * feeForProjects.percent.numerator) / feeForProjects.percent.denominator;
        projectValue.add(asset, projectAmount);
      }
      const datumSource: Maybe<DatumSource> = feeForProjects.additionalDatum
        ? {
            type: DatumSourceType.INLINE_DATUM,
            data: Bytes.fromHex(feeForProjects.additionalDatum),
          }
        : undefined;

      const projectOutput = new TxOut(projectAddress, projectValue.trim(), datumSource);
      tx.payTo(projectOutput);
    }

    return tx;
  }

  export type UpdateAmpOptions = {
    networkEnv: NetworkEnvironment;
    pool: StableswapPool;
    poolUtxo: Utxo;
    inputsToChoose: Utxo[];
    newAmp: bigint;
  };

  export function updateAmpTx({ networkEnv, pool, poolUtxo, inputsToChoose, newAmp }: UpdateAmpOptions): TxBuilder {
    const poolConfig = getStableswapPoolConfig(pool.poolIdentifier, networkEnv);
    const referencesScript = getStableswapReferencesScript(pool.poolIdentifier, networkEnv);

    const poolInDatumPlutusData = StableswapPoolDatum.toPlutusJson(pool.datum);

    const adminUtxo = inputsToChoose.find((utxo) => utxo.output.value.get(poolConfig.adminAsset) === 1n);
    invariant(adminUtxo, "not found pool Admin utxo");

    const txInputs: Utxo[] = [...inputsToChoose, poolUtxo].sort((a, b) => TxIn.compare(a.input, b.input));

    const adminIndex = txInputs.findIndex((txIn) => TxIn.compare(txIn.input, adminUtxo.input) === 0);
    invariant(adminIndex !== -1, "not found pool Admin in the input");
    const redeemer: StableswapPoolRedeemer = {
      type: StableswapPoolRedeemerType.UPDATE_AMP_OR_STAKE_CREDENTIAL,
      adminIndex: BigInt(adminIndex),
    };

    const newDatum: StableswapPoolDatum = {
      balances: pool.datum.balances,
      totalLiquidity: pool.datum.totalLiquidity,
      amplificationCoefficient: newAmp,
      orderHash: pool.datum.orderHash,
    };
    const newDatumRaw = Bytes.fromHex(StableswapPoolDatum.toDataHex(newDatum));

    const newPoolValue = poolUtxo.output.value.clone();
    const poolTxOut = TxOut.newScriptOut({
      address: poolConfig.poolAddress,
      value: newPoolValue,
      datumSource: DatumSource.newInlineDatum(newDatumRaw),
    });
    const tx = new TxBuilder(networkEnv)
      .readFrom(referencesScript.poolRef)
      .collectFromPubKey(...inputsToChoose)
      .collectFromPlutusContract(
        [poolUtxo],
        StableswapPoolRedeemer.toPlutusJson(redeemer),
        !poolUtxo.output.includeInlineDatums() ? poolInDatumPlutusData : undefined,
      )
      .payTo(poolTxOut);

    return tx;
  }

  export type BatchOrderData = {
    order: StableswapOrder;
    utxo: Utxo;
    orderOut: TxOut;
  };

  export type BatchPoolData = {
    poolIn: StableswapPool;
    poolOut: StableswapPool;
    poolInUtxo: Utxo;
  };

  export type BatchOptions = {
    networkEnv: NetworkEnvironment;
    ordersData: BatchOrderData[];
    poolData: BatchPoolData;
    licenseUtxo: Utxo;
    batcherAddress: Address;
    validFrom: number;
    withdrawAmount?: bigint;
  };

  export function batchTx({
    networkEnv,
    ordersData,
    poolData,
    licenseUtxo,
    batcherAddress,
    validFrom,
    withdrawAmount,
  }: BatchOptions & { networkEnv: NetworkEnvironment }): TxBuilder {
    const { poolIn, poolOut, poolInUtxo } = poolData;
    const poolIdentifier = poolIn.poolIdentifier;
    const poolConfig = getStableswapPoolConfig(poolIdentifier, networkEnv);
    const referencesScript = getStableswapReferencesScript(poolIdentifier, networkEnv);
    const txb = new TxBuilder(networkEnv)
      .readFrom(referencesScript.orderRef, referencesScript.poolRef, referencesScript.orderBatchingRef)
      .collectFromPubKey(licenseUtxo);
    const txInputs: Utxo[] = [];
    txInputs.push(licenseUtxo);

    const orderOuts: TxOut[] = [];
    for (const { order, utxo, orderOut } of ordersData) {
      txb.collectFromPlutusContract(
        [utxo],
        StableswapOrderRedeemer.toPlutusJson(StableswapOrderRedeemer.APPLY_ORDER),
        !utxo.output.includeInlineDatums() ? order.rawDatum : undefined,
      );
      txInputs.push(utxo);
      orderOuts.push(orderOut);
    }
    txInputs.push(poolInUtxo);
    txInputs.sort((a, b) => TxIn.compare(a.input, b.input));

    let licenseIndex = -1;
    let poolInputIndex = -1;
    for (let i = 0; i < txInputs.length; i++) {
      if (TxIn.compare(txInputs[i].input, licenseUtxo.input) === 0 && licenseIndex === -1) {
        licenseIndex = i;
        continue;
      }
      if (TxIn.compare(txInputs[i].input, poolInUtxo.input) === 0 && poolInputIndex === -1) {
        poolInputIndex = i;
        continue;
      }
    }

    // legacy code, Only Stableswap use reverse
    const inputIndexes = TxIn.calculateSortedIndexes(ordersData.map(({ order }) => order.txIn))
      .map((e) => BigInt(e))
      .reverse();

    const deltaLiquidity = poolOut.datum.totalLiquidity - poolIn.datum.totalLiquidity;
    const poolTxOut = TxOut.newScriptOut({
      address: poolConfig.poolAddress,
      value: poolOut.value.clone(),
      datumSource: DatumSource.newInlineDatum(Bytes.fromHex(StableswapPoolDatum.toDataHex(poolOut.datum))),
    }).addMinimumADAIfRequired(networkEnv);

    txb
      .collectFromPlutusContract(
        [poolInUtxo],
        StableswapPoolRedeemer.toPlutusJson({
          type: StableswapPoolRedeemerType.APPLY_POOL,
          inputIndexes: inputIndexes,
          licenseIndex: BigInt(licenseIndex),
        }),
        !poolInUtxo.output.includeInlineDatums() ? StableswapPoolDatum.toPlutusJson(poolIn.datum) : undefined,
      )
      .payTo(poolTxOut, ...orderOuts)
      .withdraw(poolConfig.orderBatchingAddress, withdrawAmount ?? 0n, {
        constructor: 0,
        fields: [PlutusInt.wrap(poolInputIndex)],
      })
      .validFrom(validFrom)
      .validTo(validFrom + 1000)
      .addSigner(batcherAddress)
      .addMessageMetadata("msg", [MetadataMessage.DEX_BATCH]);

    if (deltaLiquidity !== 0n) {
      txb
        .readFrom(referencesScript.lpRef)
        .mintAssets(new Value().add(poolIn.lpAsset, deltaLiquidity), Bytes.fromHex("61").toPlutusJson());
    }
    return txb;
  }
}
