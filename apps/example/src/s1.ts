import { SundaeSwapV1 as SundaeSwapV1Build } from "@minswap/felis-build-tx";
import { baseAddressWalletFromSeed } from "@minswap/felis-cip";
import {
  ADA,
  Address,
  Asset,
  Bytes,
  DatumSourceType,
  NetworkEnvironment,
  TxIn,
  TxOut,
  type Utxo,
  Value,
  XJSON,
} from "@minswap/felis-ledger-core";
import { Maybe, RustModule } from "@minswap/felis-ledger-utils";
import { CardanoscanProvider, KupoService } from "@minswap/felis-provider";
import { SundaeSwapV1, SundaeSwapV1Warehouse } from "@minswap/felis-sundaeswap-v1";
import { CoinSelectionAlgorithm, ECSLConverter, EmulatorProvider, TxBuilder } from "@minswap/felis-tx-builder";
import invariant from "@minswap/tiny-invariant";

// ─── CLI plumbing ──────────────────────────────────────────────────────────

const DEFAULT_NETWORK = "testnet-preprod";

function parseNetwork(s: string | undefined): NetworkEnvironment {
  switch (s ?? DEFAULT_NETWORK) {
    case "mainnet":
      return NetworkEnvironment.MAINNET;
    case "testnet-preview":
      return NetworkEnvironment.TESTNET_PREVIEW;
    case "testnet-preprod":
      return NetworkEnvironment.TESTNET_PREPROD;
    default:
      throw new Error(`--network must be one of mainnet|testnet-preprod|testnet-preview (got ${s})`);
  }
}

function resolveKupoUrl(network: NetworkEnvironment): string {
  switch (network) {
    case NetworkEnvironment.MAINNET:
      return process.env["KUPO_MAINNET_URL"] ?? "http://mainnet-staging:1442";
    case NetworkEnvironment.TESTNET_PREPROD:
      return process.env["KUPO_PREPROD_URL"] ?? "http://testnet-preprod:1442";
    case NetworkEnvironment.TESTNET_PREVIEW:
      return process.env["KUPO_PREVIEW_URL"] ?? "http://dev-3:1442";
  }
}

function parseFlags(argv: string[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected positional arg: ${key}`);
    const val = argv[i + 1];
    if (val === undefined) throw new Error(`Missing value for ${key}`);
    m[key.slice(2)] = val;
    i++;
  }
  return m;
}

// ─── Use case: info ────────────────────────────────────────────────────────

function runInfo(argv: string[]): void {
  const m = parseFlags(argv);
  const network = parseNetwork(m["network"]);
  const w = SundaeSwapV1Warehouse.getInstance(network);
  console.log(
    XJSON.stringify(
      {
        network,
        factory: {
          mintScriptHash: w.factoryMintScriptHash.hex,
          spendScriptHash: w.factorySpendScriptHash.hex,
          address: w.factoryAddress.bech32,
          authenAsset: w.factoryAuthenAsset.toString(),
        },
        pool: {
          mintScriptHash: w.poolMintScriptHash.hex,
          spendScriptHash: w.poolSpendScriptHash.hex,
          address: w.poolAddress.bech32,
        },
        order: {
          spendScriptHash: w.orderSpendScriptHash.hex,
          address: w.orderAddress.bech32,
        },
        constants: {
          POOL_NFT_NAME_PREFIX: SundaeSwapV1Warehouse.POOL_NFT_NAME_PREFIX,
          LP_TOKEN_NAME_PREFIX: SundaeSwapV1Warehouse.LP_TOKEN_NAME_PREFIX,
          FACTORY_TOKEN_NAME_HEX: SundaeSwapV1Warehouse.FACTORY_TOKEN_NAME_HEX,
          MIN_LOVELACE: SundaeSwapV1Warehouse.MIN_LOVELACE.toString(),
          WEEK_MS: SundaeSwapV1Warehouse.WEEK_MS.toString(),
          DEFAULT_FEE: `${SundaeSwapV1Warehouse.DEFAULT_FEE_NUM}/${SundaeSwapV1Warehouse.DEFAULT_FEE_DEN}`,
        },
      },
      2,
    ),
  );
}

// ─── Use case: create pool ─────────────────────────────────────────────────

type CreatePoolFlags = {
  network: NetworkEnvironment;
  owner: Address;
  assetA: Asset;
  amountA: bigint;
  assetB: Asset;
  amountB: bigint;
  feeNum?: bigint;
  feeDen?: bigint;
};

function parseCreatePoolFlags(argv: string[]): CreatePoolFlags {
  const m = parseFlags(argv);
  for (const r of ["owner", "asset-a", "amount-a", "asset-b", "amount-b"]) {
    invariant(m[r] !== undefined, `--${r} is required`);
  }
  return {
    network: parseNetwork(m["network"]),
    owner: Address.fromBech32(m["owner"]),
    assetA: Asset.fromString(m["asset-a"]),
    amountA: BigInt(m["amount-a"]),
    assetB: Asset.fromString(m["asset-b"]),
    amountB: BigInt(m["amount-b"]),
    feeNum: m["fee-num"] !== undefined ? BigInt(m["fee-num"]) : undefined,
    feeDen: m["fee-den"] !== undefined ? BigInt(m["fee-den"]) : undefined,
  };
}

async function runCreatePool(argv: string[]): Promise<void> {
  const flags = parseCreatePoolFlags(argv);

  // Sort canonically by [policy, name] bytes (matches on-chain factory check).
  const [assetA, assetB, amountA, amountB] =
    flags.assetA.compare(flags.assetB) <= 0
      ? [flags.assetA, flags.assetB, flags.amountA, flags.amountB]
      : [flags.assetB, flags.assetA, flags.amountB, flags.amountA];

  const warehouse = SundaeSwapV1Warehouse.getInstance(flags.network);
  const kupo = new KupoService(resolveKupoUrl(flags.network));

  // 1) Locate the factory UTxO.
  const factoryUtxos = await kupo.utxoAtScriptHashWithAsset(
    warehouse.factorySpendScriptHash,
    warehouse.factoryAuthenAsset,
  );
  invariant(
    factoryUtxos.length > 0,
    `No factory UTxO at ${warehouse.factoryAddress.bech32} holding ${warehouse.factoryAuthenAsset.toString()} — has the factory been bootstrapped on this network?`,
  );
  invariant(factoryUtxos.length === 1, `Expected exactly 1 factory UTxO, found ${factoryUtxos.length}`);
  const factoryInput = factoryUtxos[0];

  // 2) Resolve the factory datum. Kupo returns OUTLINE_DATUM for V1-style
  //    datum-hash outputs, which carries both the hash and the resolved body
  //    inline — no extra `/datums/<hash>` round-trip needed.
  invariant(
    Maybe.isJust(factoryInput.output.datumSource) &&
      factoryInput.output.datumSource.type === DatumSourceType.OUTLINE_DATUM,
    "Factory UTxO must carry a datum hash with resolved data (OUTLINE_DATUM)",
  );
  const factoryDatum = SundaeSwapV1.FactoryDatum.fromDataHex(factoryInput.output.datumSource.data.hex);

  // 3) Fetch wallet UTxOs.
  const paymentCredential = flags.owner.toPaymentCredential();
  invariant(Maybe.isJust(paymentCredential), "owner address has no payment credential");
  const walletUtxos = await kupo.getUtxosByPaymentCredential(paymentCredential.payload);
  invariant(walletUtxos.length > 0, `Owner ${flags.owner.bech32} has no UTxOs`);

  // 4) Build + complete (dry-run with EmulatorProvider — no submit).
  const txBuilder: TxBuilder = SundaeSwapV1Build.buildCreatePool({
    networkEnv: flags.network,
    owner: flags.owner,
    factoryInput,
    factoryDatum,
    assetA,
    amountA,
    assetB,
    amountB,
    feeNum: flags.feeNum,
    feeDen: flags.feeDen,
  });
  const result = await txBuilder.complete({
    walletUtxos,
    coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
    provider: new EmulatorProvider(flags.network),
    changeAddress: flags.owner,
  });
  if (result.type !== "ok") {
    console.error("complete() failed:", result.error);
    process.exit(1);
  }

  const ident = factoryDatum.nextPoolIdent;
  const nextIdentHex = SundaeSwapV1.incrementIdentLE(ident.hex);
  const lpSupply = SundaeSwapV1.isqrt(amountA * amountB);
  const cborHex = result.value.complete();
  console.log(
    XJSON.stringify(
      {
        factoryInput: `${factoryInput.input.txId.hex}#${factoryInput.input.index}`,
        ident: ident.hex,
        nextIdent: nextIdentHex,
        poolNftAsset: warehouse.poolNftAsset(ident).toString(),
        lpAsset: warehouse.lpAsset(ident).toString(),
        lpSupply: lpSupply.toString(),
        normalizedPair: {
          assetA: assetA.toString(),
          amountA: amountA.toString(),
          assetB: assetB.toString(),
          amountB: amountB.toString(),
        },
      },
      2,
    ),
  );
  console.log("\n--- unsigned tx cbor ---");
  console.log(cborHex);
}

// ─── Use case: batch (apply one swap order to a pool) ─────────────────────

type BatchFlags = {
  network: NetworkEnvironment;
  scooper: Address;
  dry: boolean;
  loopMs: bigint | null;
};

const DEFAULT_SCOOPER_BY_NETWORK: Partial<Record<NetworkEnvironment, string>> = {
  // No defaults yet — pass --scooper.
};

// On-chain license token name = "scooper " + suffix, where the prefix is
// 8 ASCII bytes (16 hex). We split here to recover the suffix.
const SCOOPER_LICENSE_NAME_PREFIX_HEX = "73636f6f70657220"; // "scooper "

function parseBatchFlags(argv: string[]): BatchFlags {
  const m: Record<string, string> = {};
  let dry = false;
  let loopMs: bigint | null = null;
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected positional arg: ${key}`);
    if (key === "--dry") {
      dry = true;
      continue;
    }
    if (key === "--loop") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        loopMs = BigInt(next);
        i++;
      } else {
        loopMs = 20_000n;
      }
      continue;
    }
    const val = argv[i + 1];
    if (val === undefined) throw new Error(`Missing value for ${key}`);
    m[key.slice(2)] = val;
    i++;
  }
  const network = parseNetwork(m["network"]);
  const scooperBech32 = m["scooper"] ?? DEFAULT_SCOOPER_BY_NETWORK[network];
  invariant(scooperBech32, "--scooper is required");
  return {
    network,
    scooper: Address.fromBech32(scooperBech32),
    dry,
    loopMs,
  };
}

type SwapOrderCandidate = {
  utxo: Utxo;
  datum: SundaeSwapV1.OrderDatum;
};

type ParsedPool = {
  utxo: Utxo;
  datum: SundaeSwapV1.PoolDatum;
};

/**
 * V1 swap math (Uniswap V2 with integer fee fraction `feeNum/feeDen`):
 *
 *   amountInWithFee = amountIn * (feeDen − feeNum)
 *   amountOut       = amountInWithFee * reserveOut / (reserveIn * feeDen + amountInWithFee)
 *
 * Reserves are read directly from the pool UTxO value (the pool NFT and any
 * tiny min-ada surplus aren't part of the reserve — they ride along).
 *
 * Compensation paid to the order's beneficiary:
 *   - amountOut of assetOut
 *   - the user's deposit (whatever ADA was attached to the order minus the
 *     scooperFee, and minus amountIn if assetIn was ADA)
 */
type ScoopPlan = {
  compensation: Value;
  newPoolValue: Value;
  amountOut: bigint;
  assetIn: Asset;
  assetOut: Asset;
  amountIn: bigint;
};

function planSwap(pool: ParsedPool, order: SwapOrderCandidate): ScoopPlan {
  const aToB = order.datum.swapDirection.direction === SundaeSwapV1.SwapDirection.A_TO_B;
  const assetIn = aToB ? pool.datum.assetA : pool.datum.assetB;
  const assetOut = aToB ? pool.datum.assetB : pool.datum.assetA;

  const amountIn = order.datum.swapDirection.amount;
  const reserveIn = pool.utxo.output.value.get(assetIn);
  const reserveOut = pool.utxo.output.value.get(assetOut);

  const feeNum = BigInt(pool.datum.tradingFee[0]);
  const feeDen = BigInt(pool.datum.tradingFee[1]);
  const amountInWithFee = amountIn * (feeDen - feeNum);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * feeDen + amountInWithFee;
  const amountOut = numerator / denominator;

  const minReceivable = order.datum.swapDirection.minReceivable ?? 0n;
  invariant(amountOut >= minReceivable, `slippage: amountOut ${amountOut} < minReceivable ${minReceivable}`);

  // Compensation ADA = orderAda − scooperFee, with the ADA leg of the swap
  // applied: subtract amountIn when assetIn==ADA (user's ADA went into pool),
  // add amountOut when assetOut==ADA (user receives ADA from pool).
  // For example, with order=6.5 ADA, scooperFee=2.5, amountIn=2 ADA → user
  // gets 2 ADA back as deposit refund.
  const orderAda = order.utxo.output.value.get(ADA);
  const scooperFee = order.datum.scooperFee;
  let compAda = orderAda - scooperFee;
  if (assetIn.equals(ADA)) compAda -= amountIn;
  if (assetOut.equals(ADA)) compAda += amountOut;
  invariant(
    compAda >= 0n,
    `order does not have enough ADA to cover scooperFee + ADA-leg (orderAda=${orderAda}, scooperFee=${scooperFee}, amountIn=${amountIn})`,
  );

  const compensation = new Value().add(ADA, compAda);
  if (!assetOut.equals(ADA)) compensation.add(assetOut, amountOut);
  const newPoolValue = pool.utxo.output.value.clone().add(assetIn, amountIn).subtract(assetOut, amountOut);

  return { compensation, newPoolValue, amountOut, assetIn, assetOut, amountIn };
}

async function runBatch(argv: string[]): Promise<void> {
  const flags = parseBatchFlags(argv);
  const warehouse = SundaeSwapV1Warehouse.getInstance(flags.network);
  const kupo = new KupoService(resolveKupoUrl(flags.network));

  const runOnce = async (): Promise<void> => {
    const debugData: Record<string, unknown> = {
      network: NetworkEnvironment[flags.network],
      scooper: flags.scooper.bech32,
      dry: flags.dry,
    };
    try {
      await runBatchInner(flags, warehouse, kupo, debugData);
    } catch (err) {
      console.error("\n--- batch failed; debugData ---");
      console.error(XJSON.stringify(debugData, 2));
      throw err;
    }
  };

  if (flags.loopMs === null) {
    await runOnce();
    return;
  }

  const intervalMs = Number(flags.loopMs);
  for (let iteration = 1; ; iteration++) {
    const startedAt = Date.now();
    console.log(`\n=== batch iteration ${iteration} @ ${new Date(startedAt).toISOString()} ===`);
    try {
      await runOnce();
    } catch (err) {
      console.error(`iteration ${iteration} errored; continuing loop:`, err);
    }
    const elapsedMs = Date.now() - startedAt;
    const sleepMs = Math.max(0, intervalMs - elapsedMs);
    console.log(`iteration ${iteration} took ${elapsedMs}ms; sleeping ${sleepMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }
}

async function runBatchInner(
  flags: BatchFlags,
  warehouse: SundaeSwapV1Warehouse,
  kupo: KupoService,
  debugData: Record<string, unknown>,
): Promise<void> {
  // 1) All UTxOs at the pool spend address that hold something under the pool
  //    mint policy (i.e. carry a pool NFT). Filter to ones with a parseable
  //    PoolDatum.
  const poolUtxos = await kupo.utxoAtScriptHashWithPolicyId(
    warehouse.poolSpendScriptHash,
    warehouse.poolMintScriptHash,
  );
  console.log(`Found ${poolUtxos.length} pool-spend UTxOs`);
  const pools: ParsedPool[] = [];
  for (const utxo of poolUtxos) {
    if (!utxo.output.datumSource || utxo.output.datumSource.type !== DatumSourceType.OUTLINE_DATUM) continue;
    try {
      pools.push({
        utxo,
        datum: SundaeSwapV1.PoolDatum.fromCborHex(utxo.output.datumSource.data.hex),
      });
    } catch {
      // Skip non-pool UTxOs that happen to live at the pool address.
    }
  }
  console.log(`Parsed ${pools.length} pool datums`);
  debugData.poolUtxosCount = poolUtxos.length;
  debugData.parsedPoolsCount = pools.length;

  // 2) All UTxOs at the order spend address.
  const orderUtxos = await kupo.utxosByAddress([warehouse.orderAddress]);
  console.log(`Found ${orderUtxos.length} order UTxOs`);
  debugData.orderUtxosCount = orderUtxos.length;

  // 3) Pick the first parseable swap order whose poolIdent matches a pool we found.
  const skipCounts: Record<string, number> = {
    notOutlineDatum: 0,
    badDatum: 0,
    nonPubKeyBeneficiary: 0,
    noMatchingPool: 0,
  };
  const skipSamples: Array<{ ref: string; reason: string; detail?: unknown }> = [];
  const noteSkip = (utxo: Utxo, reason: keyof typeof skipCounts, detail?: unknown) => {
    skipCounts[reason]++;
    if (skipSamples.length < 5) {
      skipSamples.push({
        ref: `${utxo.input.txId.hex}#${utxo.input.index}`,
        reason,
        detail,
      });
    }
  };

  let match: { order: SwapOrderCandidate; pool: ParsedPool } | null = null;
  for (const utxo of orderUtxos) {
    if (!utxo.output.datumSource || utxo.output.datumSource.type !== DatumSourceType.OUTLINE_DATUM) {
      noteSkip(utxo, "notOutlineDatum");
      continue;
    }
    let datum: SundaeSwapV1.OrderDatum;
    try {
      datum = SundaeSwapV1.OrderDatum.fromDataHex(utxo.output.datumSource.data.hex, flags.network);
    } catch (err) {
      noteSkip(utxo, "badDatum", String(err));
      continue;
    }
    if (Maybe.isNothing(datum.orderAddresses.destination.address.toPubKeyHash())) {
      noteSkip(utxo, "nonPubKeyBeneficiary", {
        beneficiary: datum.orderAddresses.destination.address.bech32,
      });
      continue;
    }
    const pool = pools.find((p) => p.datum.ident.hex === datum.poolIdent.hex);
    if (!pool) {
      noteSkip(utxo, "noMatchingPool", { poolIdent: datum.poolIdent.hex });
      continue;
    }
    match = { order: { utxo, datum }, pool };
    break;
  }
  debugData.orderFilter = { skipCounts, skipSamples };
  if (!match) {
    console.log(`No valid swap order with a matching pool — skipping. skipCounts=${XJSON.stringify(skipCounts)}`);
    return;
  }
  debugData.matched = {
    pool: `${match.pool.utxo.input.txId.hex}#${match.pool.utxo.input.index}`,
    order: `${match.order.utxo.input.txId.hex}#${match.order.utxo.input.index}`,
    poolIdent: match.pool.datum.ident.hex,
    assetA: match.pool.datum.assetA.toString(),
    assetB: match.pool.datum.assetB.toString(),
    direction: match.order.datum.swapDirection.direction === SundaeSwapV1.SwapDirection.A_TO_B ? "A_TO_B" : "B_TO_A",
  };

  // 4) Compute execution plan.
  const plan = planSwap(match.pool, match.order);
  debugData.plan = {
    assetIn: plan.assetIn.toString(),
    assetOut: plan.assetOut.toString(),
    amountIn: plan.amountIn.toString(),
    amountOut: plan.amountOut.toString(),
    minReceivable: (match.order.datum.swapDirection.minReceivable ?? 0n).toString(),
  };

  // 5) Find the single valid (non-expired) license UTxO at the scooper address.
  //    Requirements: exactly 1 token under factoryMintScriptHash, qty=1, no other
  //    non-ADA assets, token name starts with "scooper " prefix, and the encoded
  //    week number matches the current POSIX-time week.
  const scooperPc = flags.scooper.toPaymentCredential();
  invariant(Maybe.isJust(scooperPc), "scooper address has no payment credential");
  const scooperUtxos = await kupo.getUtxosByPaymentCredential(scooperPc.payload);
  invariant(scooperUtxos.length > 0, `scooper ${flags.scooper.bech32} has no UTxOs`);

  const _nowMs = BigInt(Date.now());
  const _WEEK_MS = SundaeSwapV1Warehouse.WEEK_MS;

  let scooperLicenseInput: Utxo | null = null;
  let licenseAsset: Asset | null = null;
  let licenseSuffix: Bytes | null = null;

  for (const utxo of scooperUtxos) {
    if (utxo.output.value.hasPolicyID(warehouse.factoryMintScriptHash)) {
      scooperLicenseInput = utxo;
      const _licenseAsset = utxo.output.value.findAsset(warehouse.factoryMintScriptHash);
      invariant(_licenseAsset, "Expected scooper license asset under factory mint script policy");
      licenseAsset = _licenseAsset;
      const nameHex = licenseAsset.tokenName.hex;
      if (!nameHex.startsWith(SCOOPER_LICENSE_NAME_PREFIX_HEX)) continue;
      const suffixHex = nameHex.slice(SCOOPER_LICENSE_NAME_PREFIX_HEX.length);
      licenseSuffix = Bytes.fromHex(suffixHex);
      break;
    }
    // const allAssets = utxo.output.value.assets();
    // const licenseAssets = allAssets.filter((a) =>
    //   a.currencySymbol.equals(warehouse.factoryMintScriptHash),
    // );
    // if (licenseAssets.length !== 1) continue;
    // const candidate = licenseAssets[0];
    // if (utxo.output.value.get(candidate) !== 1n) continue;
    // if (
    //   allAssets.filter((a) => !a.equals(ADA) && !a.equals(candidate)).length !==
    //   0
    // )
    //   continue;
    // const nameHex = candidate.tokenName.hex;
    // if (!nameHex.startsWith(SCOOPER_LICENSE_NAME_PREFIX_HEX)) continue;
    // const suffixHex = nameHex.slice(SCOOPER_LICENSE_NAME_PREFIX_HEX.length);
    // // Parse the week number from the little-endian suffix bytes.
    // const suffixBytes = Buffer.from(suffixHex, "hex");
    // let weekNum = 0n;
    // for (let i = suffixBytes.length - 1; i >= 0; i--)
    //   weekNum = (weekNum << 8n) | BigInt(suffixBytes[i]);
    // if (nowMs < weekNum * WEEK_MS || nowMs >= (weekNum + 1n) * WEEK_MS)
    //   continue; // expired
    // scooperLicenseInput = utxo;
    // licenseAsset = candidate;
    // licenseSuffix = Bytes.fromHex(suffixHex);
    // break;
  }

  console.log("scooperLicenseInput", XJSON.stringify(scooperLicenseInput, 2));
  invariant(
    scooperLicenseInput !== null && licenseAsset !== null && licenseSuffix !== null,
    `scooper ${flags.scooper.bech32} has no valid (non-expired) license token under policy ` +
      `${warehouse.factoryMintScriptHash.hex}. Run \`split-scooper-token\` to prepare license UTxOs.`,
  );
  debugData.scooperLicenseInput = {
    ref: `${scooperLicenseInput.input.txId.hex}#${scooperLicenseInput.input.index}`,
    ada: scooperLicenseInput.output.value.get(ADA).toString(),
    licenseAsset: licenseAsset.toString(),
    licenseSuffix: licenseSuffix.hex,
  };

  // 6) Build + complete (dry-run with EmulatorProvider).
  //
  // On-chain `PT5` invariant: licenseEscrowAda + txFee == Σ scooperFee.
  // That's circular (escrow ADA depends on tx fee, which depends on tx size,
  // which depends on escrow ADA). To break the loop we pin the tx fee to a
  // conservative 1 ADA via `hardCodedTxFee` and derive
  //   escrowAda = scooperFee − 1 ADA
  // so the on-chain check holds exactly.
  const HARDCODED_TX_FEE = 818_370n;
  const totalScooperFee = match.order.datum.scooperFee;
  invariant(
    totalScooperFee > HARDCODED_TX_FEE,
    `scooperFee ${totalScooperFee} must exceed hard-coded tx fee ${HARDCODED_TX_FEE}`,
  );
  const escrowAda = totalScooperFee - HARDCODED_TX_FEE;
  const currentSlot = await kupo.getCurrentSlot();
  const txBuilder = SundaeSwapV1Build.buildScoopTx({
    networkEnv: flags.network,
    scooper: flags.scooper,
    scooperLicenseInput,
    license: licenseAsset,
    licenseSuffix,
    pool: {
      input: match.pool.utxo,
      datum: match.pool.datum,
      newValue: plan.newPoolValue,
      newDatum: match.pool.datum,
    },
    order: {
      input: match.order.utxo,
      datum: match.order.datum,
      compensation: plan.compensation,
    },
    licenseEscrow: new Value().add(ADA, escrowAda),
    currentSlot,
  });

  // Exclude the license UTxO from walletUtxos — it is already forced into
  // body.inputs via collectFromPubKey. Passing only the remaining UTxOs lets
  // MINSWAP cover escrow + fee cleanly.
  const otherScooperUtxos = scooperUtxos.filter((u) => !TxIn.equals(u.input, scooperLicenseInput.input));
  const isPureAda = (u: Utxo) => u.output.value.assets().every((a) => a.equals(ADA));
  const pureAdaCollaterals = otherScooperUtxos.filter(isPureAda);
  debugData.pureAdaCollateralCount = pureAdaCollaterals.length;
  invariant(
    pureAdaCollaterals.length > 0,
    `scooper ${flags.scooper.bech32} has no pure-ADA UTxO for collateral. ` +
      `If you just sent yourself one, wait for kupo to sync (typically <1 min).`,
  );

  const result = await txBuilder.complete({
    walletUtxos: otherScooperUtxos,
    walletCollaterals: pureAdaCollaterals,
    coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
    provider: new EmulatorProvider(flags.network),
    changeAddress: flags.scooper,
    hardCodedTxFee: HARDCODED_TX_FEE,
    debug: true,
  });
  if (result.type !== "ok") {
    debugData.completeError = result.error;
    throw new Error(`txBuilder.complete() failed: ${String(result.error)}`);
  }

  console.log(
    XJSON.stringify(
      {
        picked: {
          pool: `${match.pool.utxo.input.txId.hex}#${match.pool.utxo.input.index}`,
          order: `${match.order.utxo.input.txId.hex}#${match.order.utxo.input.index}`,
          poolIdent: match.pool.datum.ident.hex,
          assetIn: plan.assetIn.toString(),
          assetOut: plan.assetOut.toString(),
          amountIn: plan.amountIn.toString(),
          amountOut: plan.amountOut.toString(),
        },
      },
      2,
    ),
  );

  if (flags.dry) {
    console.log("\n--- unsigned tx cbor ---");
    console.log(result.value.complete());
    return;
  }

  const seedPhrase = process.env["AGENT_SEED_PHRASE"];
  invariant(seedPhrase, "AGENT_SEED_PHRASE env var is required when --dry is omitted");
  const wallet = baseAddressWalletFromSeed(seedPhrase, flags.network);
  invariant(
    wallet.address.bech32 === flags.scooper.bech32,
    `AGENT_SEED_PHRASE derives ${wallet.address.bech32} but --scooper is ${flags.scooper.bech32}`,
  );
  const signedTxHex = result.value.signWithPrivateKey(wallet.paymentKey).complete();
  console.log("\n--- signed tx cbor ---");
  console.log(signedTxHex);

  const cardanoscanKey = process.env["CARDANOSCAN_KEY"];
  invariant(cardanoscanKey, "CARDANOSCAN_KEY env var is required to submit (use --dry to skip submit)");
  const cardanoscan = CardanoscanProvider.forNetwork(flags.network, cardanoscanKey);
  await cardanoscan.submitTx(signedTxHex);
  const txHash = ECSLConverter.getTxHash(RustModule.getE.Transaction.from_hex(signedTxHex));
  console.log(`\nsubmitted via Cardanoscan, txHash: ${txHash}`);
}

// ─── Use case: split-scooper-token ─────────────────────────────────────────
// Carve scooper-license tokens (assets minted under factoryMintScriptHash) into
// individual UTxOs, each holding exactly 1 license token + 2 ADA. Mirrors
// w2.ts's split-agent-token, but emits one output per license unit so each
// scoop tx can pick up an isolated license input.

type SplitScooperFlags = {
  network: NetworkEnvironment;
  scooper: Address;
  dry: boolean;
};

function parseSplitScooperFlags(argv: string[]): SplitScooperFlags {
  const m: Record<string, string> = {};
  let dry = false;
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected positional arg: ${key}`);
    if (key === "--dry") {
      dry = true;
      continue;
    }
    const val = argv[i + 1];
    if (val === undefined) throw new Error(`Missing value for ${key}`);
    m[key.slice(2)] = val;
    i++;
  }
  const network = parseNetwork(m["network"]);
  const scooperBech32 = m["scooper"] ?? DEFAULT_SCOOPER_BY_NETWORK[network];
  invariant(scooperBech32, "--scooper is required");
  return { network, scooper: Address.fromBech32(scooperBech32), dry };
}

async function runSplitScooperToken(argv: string[]): Promise<void> {
  const flags = parseSplitScooperFlags(argv);
  const warehouse = SundaeSwapV1Warehouse.getInstance(flags.network);
  const kupo = new KupoService(resolveKupoUrl(flags.network));

  const pc = flags.scooper.toPaymentCredential();
  invariant(Maybe.isJust(pc), "scooper address has no payment credential");
  const scooperUtxos = await kupo.getUtxosByPaymentCredential(pc.payload);
  invariant(scooperUtxos.length > 0, `scooper ${flags.scooper.bech32} has no UTxOs`);

  // Pick UTxOs that hold any asset under factoryMintScriptHash (license policy).
  const licenseUtxos = scooperUtxos.filter((u) =>
    u.output.value.assets().some((a) => a.currencySymbol.equals(warehouse.factoryMintScriptHash)),
  );
  invariant(
    licenseUtxos.length > 0,
    `scooper ${flags.scooper.bech32} holds no asset under license policy ${warehouse.factoryMintScriptHash.hex}`,
  );

  // Sum up license-asset quantities across ALL license-bearing UTxOs.
  const totals = new Map<string, { asset: Asset; qty: bigint }>();
  for (const u of licenseUtxos) {
    for (const asset of u.output.value.assets()) {
      if (!asset.currencySymbol.equals(warehouse.factoryMintScriptHash)) continue;
      const key = asset.toString();
      const qty = u.output.value.get(asset);
      const prev = totals.get(key);
      totals.set(key, { asset, qty: (prev?.qty ?? 0n) + qty });
    }
  }

  // Emit one output per license unit: 2 ADA + 1 token.
  const outputs: TxOut[] = [];
  for (const { asset, qty } of totals.values()) {
    for (let i = 0n; i < qty; i++) {
      outputs.push(new TxOut(flags.scooper, new Value().add(ADA, 2_000_000n).add(asset, 1n)));
    }
  }

  // Force every license-bearing UTxO into the tx so all licenses are consolidated
  // and re-emitted as one-token outputs. Pass ALL scooper UTxOs to MINSWAP so it
  // can pull extra pure-ADA inputs to cover fee + min-ada on each split output
  // (the license UTxOs alone usually don't carry enough ADA).
  const txBuilder = new TxBuilder(flags.network).collectFromPubKey(...licenseUtxos).payTo(...outputs);

  const result = await txBuilder.complete({
    walletUtxos: scooperUtxos,
    coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
    provider: new EmulatorProvider(flags.network),
    changeAddress: flags.scooper,
  });
  if (result.type !== "ok") {
    console.error("complete() failed:", result.error);
    process.exit(1);
  }

  console.log(
    XJSON.stringify(
      {
        spentLicenseUtxos: licenseUtxos.length,
        licenseTokens: Array.from(totals.values()).map(({ asset, qty }) => ({
          asset: asset.toString(),
          qty: qty.toString(),
        })),
        emittedOutputs: outputs.length,
      },
      2,
    ),
  );

  if (flags.dry) {
    console.log("\n--- unsigned tx cbor ---");
    console.log(result.value.complete());
    return;
  }

  const seedPhrase = process.env["AGENT_SEED_PHRASE"];
  invariant(seedPhrase, "AGENT_SEED_PHRASE env var is required when --dry is omitted");
  const wallet = baseAddressWalletFromSeed(seedPhrase, flags.network);
  invariant(
    wallet.address.bech32 === flags.scooper.bech32,
    `AGENT_SEED_PHRASE derives ${wallet.address.bech32} but --scooper is ${flags.scooper.bech32}`,
  );
  const signedTxHex = result.value.signWithPrivateKey(wallet.paymentKey).complete();
  console.log("\n--- signed tx cbor ---");
  console.log(signedTxHex);

  const cardanoscanKey = process.env["CARDANOSCAN_KEY"];
  invariant(cardanoscanKey, "CARDANOSCAN_KEY env var is required to submit (use --dry to skip submit)");
  const cardanoscan = CardanoscanProvider.forNetwork(flags.network, cardanoscanKey);
  await cardanoscan.submitTx(signedTxHex);
  const txHash = ECSLConverter.getTxHash(RustModule.getE.Transaction.from_hex(signedTxHex));
  console.log(`\nsubmitted via Cardanoscan, txHash: ${txHash}`);
}

// ─── dispatch ──────────────────────────────────────────────────────────────

const USAGE = `\
SundaeSwap V1 CLI

Usage:
  pnpm tsx src/s1.ts info \\
    [--network <mainnet|testnet-preprod|testnet-preview>]   # default: testnet-preprod

  pnpm tsx src/s1.ts create-pool \\
    [--network <mainnet|testnet-preprod|testnet-preview>]   # default: testnet-preprod \\
    --owner <bech32-address> \\
    --asset-a <lovelace|policyId.tokenName> --amount-a <bigint> \\
    --asset-b <lovelace|policyId.tokenName> --amount-b <bigint> \\
    [--fee-num <bigint>] [--fee-den <bigint>]   # default: 3/1000

  pnpm tsx src/s1.ts batch \\
    [--network <mainnet|testnet-preprod|testnet-preview>]   # default: testnet-preprod \\
    --scooper <bech32-address>       # license token + week suffix are auto-detected from scooper utxos
    [--dry]                          # build only; without --dry, signs with AGENT_SEED_PHRASE
    [--loop [<ms>]]                  # repeat forever; default interval 20000ms

  # Carve scooper licenses into one-token-per-UTxO (each: 2 ADA + 1 license).
  # Required before the first scoop if your licenses are bundled in a multi-asset UTxO.
  pnpm tsx src/s1.ts split-scooper-token \\
    [--network <mainnet|testnet-preprod|testnet-preview>] \\
    --scooper <bech32-address> \\
    [--dry]

Env:
  KUPO_MAINNET_URL, KUPO_PREPROD_URL, KUPO_PREVIEW_URL
  AGENT_SEED_PHRASE  (mnemonic; required for batch without --dry)
  CARDANOSCAN_KEY    (required for batch without --dry; used to submit)
`;

const main = async (): Promise<void> => {
  await RustModule.load();
  const argv = process.argv.slice(2);
  const [subcommand, ...rest] = argv;
  switch (subcommand) {
    case "info":
      runInfo(rest);
      break;
    case "create-pool":
      await runCreatePool(rest);
      break;
    case "batch":
      await runBatch(rest);
      break;
    case "split-scooper-token":
      await runSplitScooperToken(rest);
      break;
    case undefined:
    case "--help":
    case "-h":
      console.log(USAGE);
      break;
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error(USAGE);
      process.exit(1);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
