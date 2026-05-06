import {
  ADA,
  type Address,
  type Asset,
  Bytes,
  DatumSource,
  DatumSourceType,
  type NetworkEnvironment,
  PlutusData,
  TxIn,
  TxOut,
  type Utxo,
  Value,
} from "@minswap/felis-ledger-core";
import { Maybe } from "@minswap/felis-ledger-utils";
import { TxBuilder } from "@minswap/felis-tx-builder";
import { isNormalizePair, WingridersV2Warehouse, WingridersV2 as WRV2 } from "@minswap/felis-wingriders-v2";
import invariant from "@minswap/tiny-invariant";

export namespace WingridersV2 {
  export type BuildCreatePoolOptions = {
    networkEnv: NetworkEnvironment;
    owner: Address;
    factoryInput: Utxo;
    assetA: Asset;
    amountA: bigint;
    assetB: Asset;
    amountB: bigint;
  };

  // Integer square root over bigint (Newton's method). Used to compute initial LP.
  function isqrt(value: bigint): bigint {
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

  export function buildCreatePool(options: BuildCreatePoolOptions): TxBuilder {
    const { networkEnv, owner, factoryInput, assetA, amountA, assetB, amountB } = options;

    invariant(
      isNormalizePair([assetA, assetB]),
      "WingridersV2.buildCreatePool: assets must be normalized (assetA < assetB)",
    );
    invariant(amountA > 0n && amountB > 0n, "WingridersV2.buildCreatePool: amounts must be positive");

    const warehouse = WingridersV2Warehouse.getInstance(networkEnv);

    invariant(
      factoryInput.output.value.has(warehouse.factoryAsset),
      "WingridersV2.buildCreatePool: factory input must contain the factory token",
    );
    invariant(
      Maybe.isJust(factoryInput.output.datumSource) &&
        factoryInput.output.datumSource.type === DatumSourceType.INLINE_DATUM,
      "WingridersV2.buildCreatePool: factory input must have an inline datum",
    );
    const factoryDatum = WRV2.FactoryDatum.fromDataHex(factoryInput.output.datumSource.data.hex);

    // LP / share asset — the factory-split boundary is `lpAsset.tokenName`.
    const lpAsset = WRV2.computeLpAsset(warehouse.dexSymbolHash, assetA, assetB);
    const shareTokenName = lpAsset.tokenName;

    // Uniswap-V2-style initial LP: isqrt(A * B) − burnedShareTokens.
    const totalShares = isqrt(amountA * amountB);
    const initialLp = totalShares - WingridersV2Warehouse.BURNED_SHARE_TOKENS;
    invariant(
      initialLp >= 1n,
      "WingridersV2.buildCreatePool: initial deposit too small (isqrt(amountA * amountB) must exceed burnedShareTokens)",
    );

    // Validity range — on-chain lastInteraction = lowerBound (POSIXTime ms); range must be < 24h.
    // Round to slot boundary (1000ms) so `validFromMs` survives the slot round-trip unchanged.
    const SLOT_MS = 1000n;
    const now = BigInt(Date.now());
    const validFromMs = ((now - 60_000n) / SLOT_MS) * SLOT_MS;
    const validToMs = validFromMs + 30n * 60_000n;
    invariant(
      validToMs - validFromMs < WingridersV2Warehouse.MAX_TX_VALIDITY_RANGE_MS,
      "WingridersV2.buildCreatePool: validity window must be < 24h",
    );

    const factoryRedeemer = WRV2.FactoryRedeemer.toPlutusJson({
      poolChoice: { type: WRV2.PoolChoiceType.UseConstantProduct },
      assetA,
      assetB,
    });

    const poolDatum: WRV2.PoolDatum = {
      reqValidatorHash: warehouse.requestValidatorHashCP,
      assetA,
      assetB,
      swapFeeInBasis: WingridersV2Warehouse.DEFAULT_SWAP_FEE_IN_BASIS,
      protocolFeeInBasis: WingridersV2Warehouse.DEFAULT_PROTOCOL_FEE_IN_BASIS,
      projectFeeInBasis: 0n,
      reserveFeeInBasis: 0n,
      feeBasis: WingridersV2Warehouse.DEFAULT_FEE_BASIS,
      agentFeeAda: WingridersV2Warehouse.DEFAULT_AGENT_FEE_ADA,
      lastInteraction: validFromMs,
      treasuryA: 0n,
      treasuryB: 0n,
      projectTreasuryA: 0n,
      projectTreasuryB: 0n,
      reserveTreasuryA: 0n,
      reserveTreasuryB: 0n,
      projectBeneficiary: null,
      reserveBeneficiary: null,
      poolSpecifics: { constructor: 0, fields: [] },
    };

    const mintValue = new Value()
      .add(warehouse.factoryAsset, 1n)
      .add(warehouse.validityAsset, 1n)
      .add(lpAsset, WingridersV2Warehouse.MAX_LP_TOKENS - WingridersV2Warehouse.BURNED_SHARE_TOKENS);

    const factory1Datum: WRV2.FactoryDatum = { head: factoryDatum.head, tail: shareTokenName };
    const factory1Out = new TxOut(
      warehouse.factoryAddress,
      new Value().add(warehouse.factoryAsset, 1n),
      WRV2.FactoryDatum.toDatumSource(factory1Datum),
    ).addMinimumADAIfRequired(networkEnv);

    const factory2Datum: WRV2.FactoryDatum = { head: shareTokenName, tail: factoryDatum.tail };
    const factory2Out = new TxOut(
      warehouse.factoryAddress,
      new Value().add(warehouse.factoryAsset, 1n),
      WRV2.FactoryDatum.toDatumSource(factory2Datum),
    ).addMinimumADAIfRequired(networkEnv);

    const poolValue = new Value()
      .add(warehouse.validityAsset, 1n)
      .add(lpAsset, WingridersV2Warehouse.MAX_LP_TOKENS - totalShares);
    if (assetA.equals(ADA)) {
      poolValue.add(ADA, amountA + WingridersV2Warehouse.MIN_POOL_ADA);
      poolValue.add(assetB, amountB);
    } else {
      poolValue.add(ADA, WingridersV2Warehouse.MIN_POOL_ADA);
      poolValue.add(assetA, amountA);
      poolValue.add(assetB, amountB);
    }
    const poolOut = new TxOut(warehouse.poolAddressCP, poolValue, {
      type: DatumSourceType.INLINE_DATUM,
      data: Bytes.fromHex(WRV2.PoolDatum.toCborHex(poolDatum)),
    });

    const ownerOut = new TxOut(owner, new Value().add(lpAsset, initialLp)).addMinimumADAIfRequired(networkEnv);

    return new TxBuilder(networkEnv)
      .readFrom(warehouse.factoryRefInput, warehouse.dexSymbolRefInput)
      .collectFromPlutusContract([factoryInput], factoryRedeemer)
      .mintAssets(mintValue, WRV2.ValidityRedeemer.mintNewPool())
      .payTo(factory1Out, factory2Out, poolOut, ownerOut)
      .validFromUnixTime(Number(validFromMs))
      .validToUnixTime(Number(validToMs));
  }

  export type BuildBatchTxOptions = {
    networkEnv: NetworkEnvironment;
    agent: Address;
    agentInput: Utxo;
    pool: {
      input: Utxo;
      newValue: Value;
      newDatum: WRV2.PoolDatum;
    };
    order: {
      input: Utxo;
      compensation: Value;
      extraData?: PlutusData;
    };
    validFromMs?: bigint;
    validToMs?: bigint;
  };

  export function buildBatchTx(options: BuildBatchTxOptions): TxBuilder {
    const { networkEnv, agent, agentInput, pool, order } = options;
    const warehouse = WingridersV2Warehouse.getInstance(networkEnv);

    invariant(
      pool.input.output.value.has(warehouse.validityAsset),
      "WingridersV2.buildBatchTx: pool input must hold the validity token",
    );

    const SLOT_MS = 1000n;
    const nowMs = BigInt(Date.now());
    const validFromMs = options.validFromMs ?? ((nowMs - 60_000n) / SLOT_MS) * SLOT_MS;
    const validToMs = options.validToMs ?? validFromMs + 30n * 60_000n;
    invariant(
      validToMs - validFromMs < WingridersV2Warehouse.MAX_TX_VALIDITY_RANGE_MS,
      "WingridersV2.buildBatchTx: validity window must be < 24h",
    );
    invariant(
      pool.newDatum.lastInteraction === validFromMs,
      "WingridersV2.buildBatchTx: newDatum.lastInteraction must equal validFromMs",
    );

    const orderDatum = WRV2.OrderDatum.fromDataHex(
      Maybe.isJust(order.input.output.datumSource) &&
        order.input.output.datumSource.type === DatumSourceType.INLINE_DATUM
        ? order.input.output.datumSource.data.hex
        : (() => {
            throw new Error("WingridersV2.buildBatchTx: order input must carry an inline OrderDatum");
          })(),
      networkEnv,
    );
    invariant(orderDatum.type === WRV2.OrderType.Swap, "WingridersV2.buildBatchTx: only swap orders supported in v1");

    const sortedInputs = [pool.input, agentInput, order.input].slice().sort((a, b) => TxIn.compare(a.input, b.input));
    const indexOf = (u: Utxo): bigint => {
      const idx = sortedInputs.findIndex((s) => TxIn.equals(s.input, u.input));
      invariant(idx >= 0, "WingridersV2.buildBatchTx: internal index lookup failed");
      return BigInt(idx);
    };
    const poolLocation = indexOf(pool.input);
    const agentLocation = indexOf(agentInput);
    const orderLocation = indexOf(order.input);

    const evolveRedeemer = WRV2.PoolRedeemer.evolve({
      poolLocation,
      agentLocation,
      requestLocations: [
        {
          inputIndex: orderLocation,
          extraData: order.extraData ?? { int: "0" },
        },
      ],
    });
    const applyRedeemer = WRV2.OrderRedeemer.apply(poolLocation);

    const poolOut = new TxOut(pool.input.output.address, pool.newValue, {
      type: DatumSourceType.INLINE_DATUM,
      data: Bytes.fromHex(WRV2.PoolDatum.toCborHex(pool.newDatum)),
    });
    const compensationDatumSource = ((): DatumSource | undefined => {
      switch (orderDatum.datumType) {
        case WRV2.DatumType.No:
          return undefined;
        case WRV2.DatumType.Inline:
          return {
            type: DatumSourceType.INLINE_DATUM,
            data: Bytes.fromHex(PlutusData.toDataHex(orderDatum.compensationDatum)),
          };
        case WRV2.DatumType.Hash:
          // OUTLINE_DATUM stores hash on the output and lets TxBuilder.payTo
          // attach the datum as a tx witness so the chain can resolve it.
          return DatumSource.newOutlineDatum(
            Bytes.fromHex(PlutusData.toDataHex(orderDatum.compensationDatum)),
          );
      }
    })();
    const compensationOut = new TxOut(
      orderDatum.beneficiary,
      order.compensation,
      compensationDatumSource,
    ).addMinimumADAIfRequired(networkEnv);

    return new TxBuilder(networkEnv)
      .readFrom(warehouse.poolCpRefInput, warehouse.orderRefInput)
      .collectFromPlutusContract([pool.input], evolveRedeemer)
      .collectFromPlutusContract([order.input], applyRedeemer)
      .collectFromPubKey(agentInput)
      .payTo(poolOut, compensationOut)
      .validFromUnixTime(Number(validFromMs))
      .validToUnixTime(Number(validToMs))
      .addSigner(agent);
  }
}
