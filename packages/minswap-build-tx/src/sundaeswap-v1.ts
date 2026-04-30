import {
  ADA,
  type Address,
  type Asset,
  Bytes,
  DatumSource,
  DatumSourceType,
  type NetworkEnvironment,
  PlutusData,
  TxOut,
  type Utxo,
  Value,
} from "@minswap/felis-ledger-core";
import { Maybe } from "@minswap/felis-ledger-utils";
import { SundaeSwapV1 as S1, SundaeSwapV1Warehouse } from "@minswap/felis-sundaeswap-v1";
import { TxBuilder } from "@minswap/felis-tx-builder";
import invariant from "@minswap/tiny-invariant";

export namespace SundaeSwapV1 {
  export type BuildCreatePoolOptions = {
    networkEnv: NetworkEnvironment;
    owner: Address;
    /** Factory UTxO carrying `factoryAuthenAsset` (datum-hash style). */
    factoryInput: Utxo;
    /**
     * Resolved factory datum. The factory output uses a datum hash, so the
     * caller must look up the datum body via Kupo (or another provider) and
     * pass it in. We embed the body in the witness set to satisfy the input.
     */
    factoryDatum: S1.FactoryDatum;
    /** Sorted-canonical pair (assetA <= assetB by [policy, name] bytes). */
    assetA: Asset;
    amountA: bigint;
    assetB: Asset;
    amountB: bigint;
    /** Trading fee fraction; defaults to 3/1000 (0.3%). */
    feeNum?: bigint;
    feeDen?: bigint;
  };

  function isCanonicallySorted(a: Asset, b: Asset): boolean {
    return a.compare(b) <= 0;
  }

  function newOutlineDatumOut(address: Address, value: Value, datum: PlutusData): TxOut {
    return new TxOut(address, value, DatumSource.newOutlineDatum(Bytes.fromHex(PlutusData.toDataHex(datum))));
  }

  /**
   * Build a SundaeSwap V1 CreatePool transaction.
   *
   * Outputs (canonical order, matching mainnet debug3.json):
   *   [0] continuing factory at warehouse.factoryAddress (datum-hash, new factory datum)
   *   [1] new pool at warehouse.poolAddress             (datum-hash, pool datum)
   *   [2] LP creator change                              (handled by coin selection + lp payout)
   *
   * Mints (under warehouse.poolMintScriptHash):
   *   +1 pool NFT  (name = "p " + ident)
   *   +lpSupply LP (name = "lp " + ident)  with lpSupply = isqrt(amountA * amountB)
   *
   * The factory.spend script is consumed via inline-script witness and the
   * input factory datum is provided via the witness set so its hash resolves.
   */
  export function buildCreatePool(options: BuildCreatePoolOptions): TxBuilder {
    const { networkEnv, owner, factoryInput, factoryDatum, assetA, amountA, assetB, amountB } = options;
    const feeNum = options.feeNum ?? SundaeSwapV1Warehouse.DEFAULT_FEE_NUM;
    const feeDen = options.feeDen ?? SundaeSwapV1Warehouse.DEFAULT_FEE_DEN;

    invariant(amountA > 0n && amountB > 0n, "SundaeSwapV1.buildCreatePool: amounts must be positive");
    invariant(
      isCanonicallySorted(assetA, assetB),
      "SundaeSwapV1.buildCreatePool: assets must be sorted by [policy, name] bytes (assetA <= assetB)",
    );
    invariant(feeNum >= 0n && feeDen > 0n, "SundaeSwapV1.buildCreatePool: invalid fee fraction");

    const warehouse = SundaeSwapV1Warehouse.getInstance(networkEnv);

    invariant(
      factoryInput.output.value.has(warehouse.factoryAuthenAsset),
      "SundaeSwapV1.buildCreatePool: factory input must contain the factory authen token",
    );
    invariant(
      Maybe.isJust(factoryInput.output.datumSource) &&
        (factoryInput.output.datumSource.type === DatumSourceType.DATUM_HASH ||
          factoryInput.output.datumSource.type === DatumSourceType.OUTLINE_DATUM),
      "SundaeSwapV1.buildCreatePool: factory input must use a datum hash (V1 style)",
    );

    // Sanity-check that the supplied factoryDatum hashes to the value carried
    // by the input. This prevents subtle silent mismatches if the caller
    // passes a stale or wrong datum.
    {
      const expectedHex = factoryInput.output.datumSource.hash.hex;
      const computedHex = PlutusData.hashPlutusData(S1.FactoryDatum.toPlutusJson(factoryDatum));
      invariant(
        expectedHex === computedHex,
        `SundaeSwapV1.buildCreatePool: factoryDatum does not match input datum hash (expected ${expectedHex}, got ${computedHex})`,
      );
    }

    const ident = factoryDatum.nextPoolIdent;
    const nextIdentHex = S1.incrementIdentLE(ident.hex);
    const nextIdent = Bytes.fromHex(nextIdentHex);

    const poolNftAsset = warehouse.poolNftAsset(ident);
    const lpAsset = warehouse.lpAsset(ident);
    const lpSupply = S1.isqrt(amountA * amountB);
    invariant(lpSupply >= 1n, "SundaeSwapV1.buildCreatePool: initial reserves too small (lpSupply < 1)");

    const newFactoryDatum: S1.FactoryDatum = {
      nextPoolIdent: nextIdent,
      proposal: factoryDatum.proposal,
      scooperIdent: factoryDatum.scooperIdent,
      scoopers: factoryDatum.scoopers,
    };

    const poolDatum: S1.PoolDatum = {
      assetA,
      assetB,
      ident,
      liquidity: lpSupply,
      tradingFee: [Number(feeNum), Number(feeDen)],
    };

    // ─── Outputs ────────────────────────────────────────────────────────
    const factoryOut = newOutlineDatumOut(
      warehouse.factoryAddress,
      new Value().add(ADA, SundaeSwapV1Warehouse.MIN_LOVELACE).add(warehouse.factoryAuthenAsset, 1n),
      S1.FactoryDatum.toPlutusJson(newFactoryDatum),
    );

    const poolValue = new Value().add(poolNftAsset, 1n);
    if (assetA.equals(ADA)) {
      poolValue.add(ADA, amountA + SundaeSwapV1Warehouse.MIN_LOVELACE);
      poolValue.add(assetB, amountB);
    } else if (assetB.equals(ADA)) {
      // Sorted order means ADA always lands at index 0; this branch should be
      // unreachable, but kept for safety.
      poolValue.add(assetA, amountA);
      poolValue.add(ADA, amountB + SundaeSwapV1Warehouse.MIN_LOVELACE);
    } else {
      poolValue.add(ADA, SundaeSwapV1Warehouse.MIN_LOVELACE);
      poolValue.add(assetA, amountA);
      poolValue.add(assetB, amountB);
    }
    const poolOut = newOutlineDatumOut(warehouse.poolAddress, poolValue, S1.PoolDatum.toPlutusJson(poolDatum));

    const lpOut = new TxOut(owner, new Value().add(lpAsset, lpSupply));

    // ─── Validity range ─────────────────────────────────────────────────
    // factory.spend reuses the scooper-license week constant (604_800_000ms).
    // Any tx must satisfy [weekStart, weekEnd) on both lower and upper bounds.
    // Use a 30-minute window starting ~60s in the past, but bump if it would
    // straddle a week boundary.
    const SLOT_MS = 1000n;
    const WEEK_MS = SundaeSwapV1Warehouse.WEEK_MS;
    const nowMs = BigInt(Date.now());
    let validFromMs = ((nowMs - 60_000n) / SLOT_MS) * SLOT_MS;
    let validToMs = validFromMs + 30n * 60_000n;
    const fromWeek = validFromMs / WEEK_MS;
    const toWeek = (validToMs - 1n) / WEEK_MS;
    if (fromWeek !== toWeek) {
      // If we straddle, pull validToMs back to the end of the from-week minus
      // a slot. Caller should retry near the start of a new week if this fires
      // close to the boundary.
      validToMs = (fromWeek + 1n) * WEEK_MS - SLOT_MS;
      invariant(
        validToMs > validFromMs,
        "SundaeSwapV1.buildCreatePool: validity window collapses at week boundary; retry",
      );
    }
    // Also guard against validFromMs landing exactly on a week boundary that
    // the on-chain check rejects (open interval on either end is unclear).
    if (validFromMs % WEEK_MS === 0n) {
      validFromMs += SLOT_MS;
    }

    // ─── Mints ──────────────────────────────────────────────────────────
    const mintValue = new Value().add(poolNftAsset, 1n).add(lpAsset, lpSupply);

    // ─── Redeemers ──────────────────────────────────────────────────────
    const factoryRedeemer = S1.FactoryRedeemer.createPool({ assetA, assetB });
    const poolMintRedeemer = S1.PoolMintRedeemer.createPool(ident);

    return new TxBuilder(networkEnv)
      .attachValidator({ type: "PlutusV1", script: warehouse.factorySpendScript.hex })
      .attachValidator({ type: "PlutusV1", script: warehouse.poolMintScript.hex })
      .collectFromPlutusContract([factoryInput], factoryRedeemer, S1.FactoryDatum.toPlutusJson(factoryDatum))
      .mintAssets(mintValue, poolMintRedeemer)
      .payTo(factoryOut, poolOut, lpOut)
      .validFromUnixTime(Number(validFromMs))
      .validToUnixTime(Number(validToMs))
      .addSigner(owner);
  }

  /**
   * The single order being scooped: the input UTxO at the order validator,
   * the pre-resolved order datum (datum-hash style on V1), and the value
   * that should be paid back to the order's beneficiary as compensation.
   *
   * V1 scoops here are intentionally one-order-per-tx — multi-order batching
   * is not supported.
   */
  export type ScoopOrder = {
    input: Utxo;
    datum: S1.OrderDatum;
    /** Beneficiary compensation (typically swap-out asset + the order's deposit). */
    compensation: Value;
  };

  export type BuildScoopTxOptions = {
    networkEnv: NetworkEnvironment;
    /** Scooper pubkey address — receives change and signs the tx. */
    scooper: Address;
    /** Scooper's pubkey UTxO holding the active license NFT (will be consumed and returned). */
    scooperLicenseInput: Utxo;
    /** Active license token (`policy.scooperPrefix||suffix`) — used to build the order redeemer. */
    license: Asset;
    /**
     * Suffix of the license token name. The on-chain order validator concatenates
     * the static `"scooper "` prefix internally, so we only pass the suffix.
     */
    licenseSuffix: Bytes;
    pool: {
      input: Utxo;
      datum: S1.PoolDatum;
      /** Updated pool value after applying the order. */
      newValue: Value;
      /**
       * Updated pool datum — pass the SAME datum the input had for swap-only
       * scoops (LP doesn't change), or a new datum for deposit/withdraw
       * scoops where `liquidity` shifts.
       */
      newDatum: S1.PoolDatum;
    };
    /** Exactly one order is scooped per tx. */
    order: ScoopOrder;
    /** Value for the escrow output (address comes from warehouse.licenseEscrowAddress). */
    licenseEscrow: Value;
    currentSlot: number;
    validFromMs?: bigint;
    validToMs?: bigint;
  };

  /**
   * Build a SundaeSwap V1 Scoop transaction for EXACTLY ONE order.
   *
   * Mirrors the structure observed in the mainnet scoop tx
   * `e1615e56f980b2ff86fdaf6d554bdbb347cd3b249250334b3d189c3b9ac6ec2a`:
   *
   *   inputs:  [scooper-pubkey..., poolInput, orderInput]
   *   outputs: [poolOut, licenseEscrowOut, beneficiaryCompensationOut, licenseReturnOut, scooper-change]
   *   redeemers:
   *     pool.spend   = Scoop  (Constr 0 [scooperPkh, licenseSuffix])
   *     order.spend  = Scoop  (Constr 0 [])
   */
  export function buildScoopTx(options: BuildScoopTxOptions): TxBuilder {
    const {
      networkEnv,
      scooper,
      scooperLicenseInput,
      license,
      licenseSuffix,
      pool,
      order,
      licenseEscrow,
      currentSlot,
    } = options;

    const warehouse = SundaeSwapV1Warehouse.getInstance(networkEnv);

    invariant(
      scooperLicenseInput.output.value.has(license),
      `SundaeSwapV1.buildScoopTx: scooperLicenseInput must hold the license token ${license.toString()}`,
    );
    invariant(
      pool.input.output.address.bech32 === warehouse.poolAddress.bech32,
      "SundaeSwapV1.buildScoopTx: pool input must sit at the pool spend address",
    );

    const scooperPkh = scooper.toPaymentCredential();
    invariant(Maybe.isJust(scooperPkh), "SundaeSwapV1.buildScoopTx: scooper address must have a payment credential");

    // ─── Validity range ─────────────────────────────────────────────────
    // Scoop redeemers must run inside the current scooper-license week window.
    // Default to a small recent slot range; the caller can override.
    const SLOT_MS = 1000n;
    const nowMs = BigInt(Date.now());
    const validFromMs = options.validFromMs ?? ((nowMs - 60_000n) / SLOT_MS) * SLOT_MS;
    const _validToMs = options.validToMs ?? validFromMs + 30n * 60_000n;

    // ─── Outputs ────────────────────────────────────────────────────────
    const poolOut = new TxOut(
      pool.input.output.address,
      pool.newValue,
      DatumSource.newOutlineDatum(Bytes.fromHex(S1.PoolDatum.toCborHex(pool.newDatum))),
    );

    const escrowOut = new TxOut(
      warehouse.licenseEscrowAddress,
      licenseEscrow,
      DatumSource.newOutlineDatum(
        Bytes.fromHex(
          PlutusData.toDataHex(S1.LicenseDatum.toPlutusJson({ scooperPkh: scooperPkh.payload, licenseSuffix })),
        ),
      ),
    );

    // The order's deposit refund can fall below min-utxo when the beneficiary's
    // assetOut is a multi-asset output. Top up to min-ada from scooper change
    // (same pattern as WingRiders V2 buildBatchTx's compensationOut).
    const compensationOut = new TxOut(
      order.datum.orderAddresses.destination.address,
      order.compensation,
    ).addMinimumADAIfRequired(networkEnv);

    // License is returned intact (2 ADA + 1 token) so the scooper UTxO set
    // remains stable across batches. The escrow and fee are covered by other
    // scooper UTxOs fed via walletUtxos in the .complete() call.
    const licenseReturnOut = new TxOut(
      scooper,
      new Value().add(ADA, SundaeSwapV1Warehouse.MIN_LOVELACE).add(license, 1n),
    );

    // ─── Redeemers ──────────────────────────────────────────────────────
    const poolRedeemer = S1.PoolRedeemer.scoop(scooperPkh.payload, licenseSuffix);
    const orderRedeemer = S1.OrderRedeemer.scoop();

    return (
      new TxBuilder(networkEnv)
        .attachValidator({ type: "PlutusV1", script: warehouse.poolSpendScript.hex })
        .attachValidator({ type: "PlutusV1", script: warehouse.orderSpendScript.hex })
        .collectFromPubKey(scooperLicenseInput)
        .collectFromPlutusContract([pool.input], poolRedeemer, S1.PoolDatum.toCborHex(pool.datum))
        .collectFromPlutusContract(
          [order.input],
          orderRedeemer,
          PlutusData.toDataHex(S1.OrderDatum.toPlutusJson(order.datum)),
        )
        .payTo(poolOut, escrowOut, compensationOut, licenseReturnOut)
        .validFrom(currentSlot)
        .validTo(currentSlot + 2000)
        // .validFromUnixTime(Number(validFromMs))
        // .validToUnixTime(Number(validToMs))
        .addSigner(scooper)
    );
  }
}
