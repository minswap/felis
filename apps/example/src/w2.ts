import { WingridersV2 as WRV2Build } from "@minswap/felis-build-tx";
import { baseAddressWalletFromSeed } from "@minswap/felis-cip";
import {
  ADA,
  Address,
  Asset,
  type Bytes,
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
import { CoinSelectionAlgorithm, ECSLConverter, EmulatorProvider, TxBuilder } from "@minswap/felis-tx-builder";
import { normalizePair, WingridersV2, WingridersV2Warehouse } from "@minswap/felis-wingriders-v2";
import invariant from "@minswap/tiny-invariant";

// ─── CLI plumbing ──────────────────────────────────────────────────────────

type CreatePoolFlags = {
  network: NetworkEnvironment;
  owner: Address;
  assetA: Asset;
  amountA: bigint;
  assetB: Asset;
  amountB: bigint;
};

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
      return process.env["KUPO_PREPROD_URL"] ?? "http://testnet-preprod.tail2feb3.ts.net:1442";
    case NetworkEnvironment.TESTNET_PREVIEW:
      return process.env["KUPO_PREVIEW_URL"] ?? "http://dev-3:1442";
  }
}

function parseCreatePoolFlags(argv: string[]): CreatePoolFlags {
  const m: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected positional arg: ${key}`);
    const val = argv[i + 1];
    if (val === undefined) throw new Error(`Missing value for ${key}`);
    m[key.slice(2)] = val;
    i++;
  }
  const required = ["owner", "asset-a", "amount-a", "asset-b", "amount-b"];
  for (const r of required) invariant(m[r] !== undefined, `--${r} is required`);
  return {
    network: parseNetwork(m["network"]),
    owner: Address.fromBech32(m["owner"]),
    assetA: Asset.fromString(m["asset-a"]),
    amountA: BigInt(m["amount-a"]),
    assetB: Asset.fromString(m["asset-b"]),
    amountB: BigInt(m["amount-b"]),
  };
}

// ─── Use case: create pool ─────────────────────────────────────────────────

async function runCreatePool(argv: string[]): Promise<void> {
  const flags = parseCreatePoolFlags(argv);
  const [assetA, assetB] = normalizePair([flags.assetA, flags.assetB]);
  // Rotate amounts if the pair was reordered.
  const [amountA, amountB] = assetA.equals(flags.assetA)
    ? [flags.amountA, flags.amountB]
    : [flags.amountB, flags.amountA];

  const warehouse = WingridersV2Warehouse.getInstance(flags.network);
  const kupo = new KupoService(resolveKupoUrl(flags.network));

  const factoryAsset = warehouse.factoryAsset;
  console.log(factoryAsset.toString());
  console.log(warehouse.factoryAddress.bech32);
  const factoryUtxos = await kupo.utxoAtScriptHashWithAsset(warehouse.factoryScriptHash, factoryAsset);
  console.log(XJSON.stringify(factoryUtxos, 2));

  const lpAsset = WingridersV2.computeLpAsset(warehouse.dexSymbolHash, assetA, assetB);
  const shareTokenName = lpAsset.tokenName;
  const factoryInput = pickFactoryCoveringShare(factoryUtxos, shareTokenName);
  invariant(
    factoryInput !== null,
    `No factory UTxO covers shareTokenName ${shareTokenName.hex} — has this pool already been created?`,
  );

  // 2) Fetch wallet UTxOs (owner's payment credential).
  const paymentCredential = flags.owner.toPaymentCredential();
  invariant(paymentCredential, "owner address has no payment credential");
  const walletUtxos = await kupo.getUtxosByPaymentCredential(paymentCredential.payload);
  invariant(walletUtxos.length > 0, `Owner ${flags.owner.bech32} has no UTxOs`);

  // 3) Build + complete (dry-run with EmulatorProvider — no submit).
  const txBuilder = WRV2Build.buildCreatePool({
    networkEnv: flags.network,
    owner: flags.owner,
    factoryInput,
    assetA,
    amountA,
    assetB,
    amountB,
  });
  const result = await txBuilder.complete({
    walletUtxos,
    coinSelectionAlgorithm: CoinSelectionAlgorithm.SPEND_ALL,
    provider: new EmulatorProvider(flags.network),
    changeAddress: flags.owner,
  });
  if (result.type !== "ok") {
    console.error("complete() failed:", result.error);
    process.exit(1);
  }

  const cborHex = result.value.complete();
  console.log(
    XJSON.stringify(
      {
        lpAsset: lpAsset.toString(),
        factoryInput: {
          txIn: `${factoryInput.input.txId.hex}#${factoryInput.input.index}`,
        },
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

function pickFactoryCoveringShare(factories: Utxo[], shareTokenName: Bytes): Utxo | null {
  for (const utxo of factories) {
    if (!utxo.output.datumSource || utxo.output.datumSource.type !== DatumSourceType.INLINE_DATUM) continue;
    try {
      const datum = WingridersV2.FactoryDatum.fromDataHex(utxo.output.datumSource.data.hex);
      // head < shareTokenName <= tail (byte-lexicographic)
      if (datum.head.compare(shareTokenName) < 0 && shareTokenName.compare(datum.tail) <= 0) {
        return utxo;
      }
    } catch {
      // not a FactoryDatum — skip
    }
  }
  return null;
}

// ─── Use case: batch (apply one order to a pool) ───────────────────────────

type BatchFlags = {
  network: NetworkEnvironment;
  agent: Address;
  dry: boolean;
  loopMs: bigint | null;
};

const DEFAULT_AGENT_BY_NETWORK: Partial<Record<NetworkEnvironment, string>> = {
  [NetworkEnvironment.MAINNET]:
    "addr1qy95vag5yter2lw5anh94p9j3zuc9vsrwks9q0x8anw6t2j8w4y93hwj09d2hztp04ed05jq40xdqdh6fdmplguhs73szf602s",
  [NetworkEnvironment.TESTNET_PREPROD]:
    "addr_test1qz427uy6zgxycqxmvetz2vejxx0ccagrfwwjyjjejdmgqkn8t7n238qksqw6w3sntsy9xarjh895hwlwcly92zf6gj8sq9u6hw",
};

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
  const agentBech32 = m["agent"] ?? DEFAULT_AGENT_BY_NETWORK[network];
  invariant(agentBech32, `--agent is required (no default for network ${m["network"]})`);
  return {
    network,
    agent: Address.fromBech32(agentBech32),
    dry,
    loopMs,
  };
}

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

type OrderCandidate = {
  utxo: Utxo;
  datum: Extract<WingridersV2.OrderDatum, { type: WingridersV2.OrderType.Swap }>;
};

type SwapPlan = {
  compensation: Value;
  newPoolValue: Value;
  newDatum: WingridersV2.PoolDatum;
};

function planSwap(
  pool: Utxo,
  poolDatum: WingridersV2.PoolDatum,
  order: OrderCandidate,
  lastInteractionMs: bigint,
): SwapPlan {
  const aToB = order.datum.direction === WingridersV2.SwapDirection.A_TO_B;
  const assetIn = aToB ? poolDatum.assetA : poolDatum.assetB;
  const assetOut = aToB ? poolDatum.assetB : poolDatum.assetA;

  // Amount of assetIn the caller is locking: total value of assetIn in the
  // order UTxO, minus oil and agent fee when assetIn is ADA (both paid in ADA).
  const oil = order.datum.oil;
  const agentFee = poolDatum.agentFeeAda;
  const rawIn = order.utxo.output.value.get(assetIn);
  const lockX = assetIn.equals(ADA) ? rawIn - oil - agentFee : rawIn;
  invariant(
    lockX > 0n,
    `order lockX must be positive | lockX | ${lockX}| rawIn | ${rawIn} | oil | ${oil} | agentFee | ${agentFee} | ${assetIn.toString()}`,
  );

  // Effective reserves as seen by the curve: UTxO value minus treasuries
  // (and minPoolAda on the ADA side).
  const valueA = pool.output.value.get(poolDatum.assetA);
  const valueB = pool.output.value.get(poolDatum.assetB);
  const adaIsA = poolDatum.assetA.equals(ADA);
  const reserveA =
    valueA -
    poolDatum.treasuryA -
    poolDatum.projectTreasuryA -
    poolDatum.reserveTreasuryA -
    (adaIsA ? WingridersV2Warehouse.MIN_POOL_ADA : 0n);
  const reserveB =
    valueB -
    poolDatum.treasuryB -
    poolDatum.projectTreasuryB -
    poolDatum.reserveTreasuryB -
    (!adaIsA && poolDatum.assetB.equals(ADA) ? WingridersV2Warehouse.MIN_POOL_ADA : 0n);

  const rIn = aToB ? reserveA : reserveB;
  const rOut = aToB ? reserveB : reserveA;

  const fb = poolDatum.feeBasis;
  const swapFee = ceilDiv(lockX * poolDatum.swapFeeInBasis, fb);
  const protocolFee = (lockX * poolDatum.protocolFeeInBasis) / fb;
  const projectFee = (lockX * poolDatum.projectFeeInBasis) / fb;
  const reserveFee = (lockX * poolDatum.reserveFeeInBasis) / fb;

  const effectiveIn = rIn + lockX - swapFee - protocolFee - projectFee - reserveFee;
  const newOutReserve = ceilDiv(rIn * rOut, effectiveIn);
  const amountOut = rOut - newOutReserve;
  invariant(
    amountOut >= order.datum.minWanted,
    `slippage: amountOut ${amountOut} < minWanted ${order.datum.minWanted}`,
  );

  const compensation = new Value().add(ADA, oil);
  compensation.add(assetOut, amountOut);

  const newPoolValue = pool.output.value.clone();
  newPoolValue.add(assetIn, lockX);
  newPoolValue.subtract(assetOut, amountOut);

  const newDatum: WingridersV2.PoolDatum = {
    ...poolDatum,
    lastInteraction: lastInteractionMs,
    treasuryA: poolDatum.treasuryA + (aToB ? protocolFee : 0n),
    treasuryB: poolDatum.treasuryB + (aToB ? 0n : protocolFee),
    projectTreasuryA: poolDatum.projectTreasuryA + (aToB ? projectFee : 0n),
    projectTreasuryB: poolDatum.projectTreasuryB + (aToB ? 0n : projectFee),
    reserveTreasuryA: poolDatum.reserveTreasuryA + (aToB ? reserveFee : 0n),
    reserveTreasuryB: poolDatum.reserveTreasuryB + (aToB ? 0n : reserveFee),
  };

  return { compensation, newPoolValue, newDatum };
}

async function runBatch(argv: string[]): Promise<void> {
  const flags = parseBatchFlags(argv);
  const warehouse = WingridersV2Warehouse.getInstance(flags.network);
  const kupo = new KupoService(resolveKupoUrl(flags.network));

  const runOnce = async (): Promise<void> => {
    const debugData: Record<string, unknown> = {
      network: NetworkEnvironment[flags.network],
      agent: flags.agent.bech32,
      dry: flags.dry,
      kupoBaseUrl: kupo.kupoBaseUrl,
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
  warehouse: WingridersV2Warehouse,
  kupo: KupoService,
  debugData: Record<string, unknown>,
): Promise<void> {
  // 1) All active CP pools (at poolScriptHashCP, carrying the validity token)
  const poolUtxos = await kupo.utxoAtScriptHashWithAsset(warehouse.poolScriptHashCP, warehouse.validityAsset);
  console.log(`Found ${poolUtxos.length} pool UTxOs`);
  const pools: Array<{ utxo: Utxo; datum: WingridersV2.PoolDatum }> = [];
  for (const utxo of poolUtxos) {
    if (!utxo.output.datumSource || utxo.output.datumSource.type !== DatumSourceType.INLINE_DATUM) continue;
    try {
      pools.push({ utxo, datum: WingridersV2.PoolDatum.fromCborHex(utxo.output.datumSource.data.hex, flags.network) });
    } catch {
      // skip non-CP / malformed
    }
  }
  console.log(`Parsed ${pools.length} CP pool datums`);
  debugData.poolUtxosCount = poolUtxos.length;
  debugData.parsedPoolsCount = pools.length;

  // 2) All request UTxOs at the CP request validator
  const orderUtxos = await kupo.utxosByAddress([warehouse.requestAddressCP]);
  console.log(`Found ${orderUtxos.length} order UTxOs`);
  debugData.orderUtxosCount = orderUtxos.length;

  // 3) Collect ALL valid swap orders that have a matching pool. We try them
  // one at a time below; if planning/building/completing fails for one,
  // we fall through to the next candidate instead of bailing out.
  const nowMs = BigInt(Date.now());
  type Candidate = { order: OrderCandidate; pool: { utxo: Utxo; datum: WingridersV2.PoolDatum } };
  const candidates: Candidate[] = [];
  const skipCounts: Record<string, number> = {
    notInlineDatum: 0,
    badDatum: 0,
    notSwap: 0,
    nonPubKeyBeneficiary: 0,
    deadlineSoon: 0,
    noMatchingPool: 0,
  };
  const skipSamples: Array<{ ref: string; reason: string; detail?: unknown }> = [];
  const noteSkip = (utxo: Utxo, reason: keyof typeof skipCounts, detail?: unknown) => {
    skipCounts[reason]++;
    if (skipSamples.length < 5) {
      skipSamples.push({ ref: `${utxo.input.txId.hex}#${utxo.input.index}`, reason, detail });
    }
  };

  for (const utxo of orderUtxos) {
    if (!utxo.output.datumSource || utxo.output.datumSource.type !== DatumSourceType.INLINE_DATUM) {
      noteSkip(utxo, "notInlineDatum");
      continue;
    }
    let datum: WingridersV2.OrderDatum;
    try {
      datum = WingridersV2.OrderDatum.fromDataHex(utxo.output.datumSource.data.hex, flags.network);
    } catch (err) {
      noteSkip(utxo, "badDatum", String(err));
      continue;
    }
    if (datum.type !== WingridersV2.OrderType.Swap) {
      noteSkip(utxo, "notSwap", { type: datum.type });
      continue;
    }
    // Pubkey-only check applies only to datumType=No. With datumType=Inline/Hash the
    // beneficiary may be a script address (the compensation datum is the script's datum).
    if (datum.datumType === WingridersV2.DatumType.No && Maybe.isNothing(datum.beneficiary.toPubKeyHash())) {
      noteSkip(utxo, "nonPubKeyBeneficiary", { beneficiary: datum.beneficiary.bech32 });
      continue;
    }
    if (datum.deadline <= nowMs + 60_000n) {
      noteSkip(utxo, "deadlineSoon", { deadline: datum.deadline.toString(), nowMs: nowMs.toString() });
      continue;
    }

    const pool = pools.find((p) => p.datum.assetA.equals(datum.assetA) && p.datum.assetB.equals(datum.assetB));
    if (!pool) {
      noteSkip(utxo, "noMatchingPool", {
        assetA: datum.assetA.toString(),
        assetB: datum.assetB.toString(),
      });
      continue;
    }

    candidates.push({ order: { utxo, datum: datum as OrderCandidate["datum"] }, pool });
  }
  debugData.orderFilter = { skipCounts, skipSamples };
  debugData.candidatesCount = candidates.length;
  if (candidates.length === 0) {
    console.log(`No valid swap orders with a matching CP pool — skipping. skipCounts=${XJSON.stringify(skipCounts)}`);
    return;
  }

  // 4) Fetch agent UTxOs from kupo. The pool's evolve redeemer enforces
  // (pAT) that the agent input carries EXACTLY 1 of warehouse.agentAsset
  // (see DEX/Pool.hs: `pvalueOf # agentInput.value # agentSymbol # agentToken #== 1`).
  // So we must find a UTxO holding qty == 1n, not just any UTxO that has the token.
  const agentPaymentCredential = flags.agent.toPaymentCredential();
  invariant(agentPaymentCredential, "agent address has no payment credential");
  const agentUtxos = await kupo.getUtxosByPaymentCredential(agentPaymentCredential.payload);
  invariant(agentUtxos.length > 0, `agent ${flags.agent.bech32} has no UTxOs`);

  const agentAssetQty = (u: Utxo) => u.output.value.get(warehouse.agentAsset);
  const exactOneTokenUtxos = agentUtxos.filter((u) => agentAssetQty(u) === 1n);
  const anyTokenUtxos = agentUtxos.filter((u) => agentAssetQty(u) > 0n);
  debugData.agentAsset = warehouse.agentAsset.toString();
  debugData.agentTokenUtxos = anyTokenUtxos.map((u) => ({
    ref: `${u.input.txId.hex}#${u.input.index}`,
    qty: agentAssetQty(u).toString(),
    ada: u.output.value.get(ADA).toString(),
  }));
  invariant(
    exactOneTokenUtxos.length > 0,
    `agent ${flags.agent.bech32} has no UTxO holding EXACTLY 1 ${warehouse.agentAsset.toString()}. ` +
      `Pool 'pAT' check requires qty == 1. ` +
      `Found ${anyTokenUtxos.length} bulk UTxO(s) (qty != 1). Split one first by sending 1 ${warehouse.agentAsset.toString()} back to the agent in its own output.`,
  );
  // Among single-token UTxOs prefer the one with the most ADA (helps cover fee + change min-ada).
  const agentInput = exactOneTokenUtxos.reduce((best, u) =>
    u.output.value.get(ADA) > best.output.value.get(ADA) ? u : best,
  );
  debugData.agentInput = {
    ref: `${agentInput.input.txId.hex}#${agentInput.input.index}`,
    ada: agentInput.output.value.get(ADA).toString(),
    agentTokenQty: agentAssetQty(agentInput).toString(),
    walletUtxoCount: agentUtxos.length,
  };

  // Conway requires collateral inputs to be ADA-only (or carry a `collateral_return`).
  // tx-builder's first-branch fast path returns no collateralReturn when walletCollaterals
  // covers >=5 ADA, so we MUST pass pure-ADA UTxOs only — never the bulk-tokens UTxO.
  const isPureAda = (u: Utxo) => u.output.value.assets().every((a) => a.equals(ADA));
  const otherAgentUtxos = agentUtxos.filter((u) => !TxIn.equals(u.input, agentInput.input));
  const pureAdaCollaterals = otherAgentUtxos.filter(isPureAda);
  debugData.allAgentUtxos = agentUtxos.map((u) => ({
    ref: `${u.input.txId.hex}#${u.input.index}`,
    ada: u.output.value.get(ADA).toString(),
    assets: u.output.value.assets().map((a) => a.toString()),
  }));
  invariant(
    pureAdaCollaterals.length > 0,
    `agent ${flags.agent.bech32} has no pure-ADA UTxO for collateral. ` +
      `agent has ${agentUtxos.length} UTxO(s); see debugData.allAgentUtxos. ` +
      `If split-agent-token was just submitted, wait for kupo to sync (typically <1 min).`,
  );
  const walletCollaterals = pureAdaCollaterals;
  debugData.walletCollateralCandidates = walletCollaterals.map((u) => ({
    ref: `${u.input.txId.hex}#${u.input.index}`,
    ada: u.output.value.get(ADA).toString(),
  }));

  // 5) Try each candidate; on plan/build/complete failure, fall through to the next.
  const SLOT_MS = 1000n;
  const validFromMs = ((nowMs - 60_000n) / SLOT_MS) * SLOT_MS;
  const validToMs = validFromMs + 30n * 60_000n;

  // IMPORTANT: pass only [agentInput] as walletUtxos. The pool redeemer encodes
  // input indexes computed from sorting [pool, agent, order], and the contract
  // also enforces inputCount == 2 + numRequests (3 here) — so we cannot add any
  // extra agent UTxOs to body.inputs.
  const tryCandidate = async (cand: Candidate) => {
    invariant(validToMs < cand.order.datum.deadline, "order deadline too close");
    const plan = planSwap(cand.pool.utxo, cand.pool.datum, cand.order, validFromMs);
    const txBuilder = WRV2Build.buildBatchTx({
      networkEnv: flags.network,
      agent: flags.agent,
      agentInput,
      pool: { input: cand.pool.utxo, newValue: plan.newPoolValue, newDatum: plan.newDatum },
      order: { input: cand.order.utxo, compensation: plan.compensation },
      validFromMs,
      validToMs,
    });
    const completeResult = await txBuilder.complete({
      walletUtxos: [agentInput],
      walletCollaterals,
      coinSelectionAlgorithm: CoinSelectionAlgorithm.MINWALLET_SEND_ALL,
      provider: new EmulatorProvider(flags.network),
      changeAddress: flags.agent,
    });
    if (completeResult.type !== "ok") {
      throw new Error(`txBuilder.complete() failed: ${String(completeResult.error)}`);
    }
    return { match: cand, plan, completed: completeResult.value };
  };

  const attemptErrors: Array<{ order: string; error: string }> = [];
  let chosen: Awaited<ReturnType<typeof tryCandidate>> | null = null;
  for (const cand of candidates) {
    const orderRef = `${cand.order.utxo.input.txId.hex}#${cand.order.utxo.input.index}`;
    try {
      chosen = await tryCandidate(cand);
      console.log(`Order ${orderRef} planned successfully (skipped ${attemptErrors.length} prior)`);
      break;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      attemptErrors.push({ order: orderRef, error: errMsg });
      console.log(`Order ${orderRef} failed: ${errMsg}; trying next candidate...`);
    }
  }
  debugData.attemptErrors = attemptErrors;
  if (!chosen) {
    console.log(`All ${candidates.length} candidate order(s) failed; nothing to submit.`);
    return;
  }

  const { match, plan, completed } = chosen;
  debugData.matched = {
    pool: `${match.pool.utxo.input.txId.hex}#${match.pool.utxo.input.index}`,
    order: `${match.order.utxo.input.txId.hex}#${match.order.utxo.input.index}`,
    assetA: match.pool.datum.assetA.toString(),
    assetB: match.pool.datum.assetB.toString(),
    direction: match.order.datum.direction === WingridersV2.SwapDirection.A_TO_B ? "A_TO_B" : "B_TO_A",
  };
  debugData.plan = {
    validFromMs: validFromMs.toString(),
    validToMs: validToMs.toString(),
    deadline: match.order.datum.deadline.toString(),
    minWanted: match.order.datum.minWanted.toString(),
    compensation: plan.compensation.toJSON?.() ?? null,
    newDatum: {
      treasuryA: plan.newDatum.treasuryA.toString(),
      treasuryB: plan.newDatum.treasuryB.toString(),
      lastInteraction: plan.newDatum.lastInteraction.toString(),
    },
  };
  debugData.unsignedTxCbor = completed.complete();

  console.log(
    XJSON.stringify(
      {
        picked: {
          pool: `${match.pool.utxo.input.txId.hex}#${match.pool.utxo.input.index}`,
          order: `${match.order.utxo.input.txId.hex}#${match.order.utxo.input.index}`,
          assetA: match.pool.datum.assetA.toString(),
          assetB: match.pool.datum.assetB.toString(),
          direction: match.order.datum.direction === WingridersV2.SwapDirection.A_TO_B ? "A_TO_B" : "B_TO_A",
          compensation: {
            assetOut: (match.order.datum.direction === WingridersV2.SwapDirection.A_TO_B
              ? match.pool.datum.assetB
              : match.pool.datum.assetA
            ).toString(),
            amountOut: plan.compensation
              .get(
                match.order.datum.direction === WingridersV2.SwapDirection.A_TO_B
                  ? match.pool.datum.assetB
                  : match.pool.datum.assetA,
              )
              .toString(),
            minWanted: match.order.datum.minWanted.toString(),
          },
        },
        validity: { validFromMs: validFromMs.toString(), validToMs: validToMs.toString() },
      },
      2,
    ),
  );
  if (flags.dry) {
    console.log("\n--- unsigned tx cbor ---");
    console.log(completed.complete());
    return;
  }

  const seedPhrase = process.env["AGENT_SEED_PHRASE"];
  invariant(seedPhrase, "AGENT_SEED_PHRASE env var is required when --dry is omitted");
  const wallet = baseAddressWalletFromSeed(seedPhrase, flags.network);
  invariant(
    wallet.address.bech32 === flags.agent.bech32,
    `AGENT_SEED_PHRASE derives ${wallet.address.bech32} but --agent is ${flags.agent.bech32}`,
  );

  const signedTxHex = completed.signWithPrivateKey(wallet.paymentKey).complete();
  debugData.signedTxCbor = signedTxHex;
  console.log("\n--- signed tx cbor ---");
  console.log(signedTxHex);

  const cardanoscanKey = process.env["CARDANOSCAN_KEY"];
  invariant(cardanoscanKey, "CARDANOSCAN_KEY env var is required to submit (use --dry to skip submit)");
  const cardanoscan = CardanoscanProvider.forNetwork(flags.network, cardanoscanKey);
  await cardanoscan.submitTx(signedTxHex);
  const txHash = ECSLConverter.getTxHash(RustModule.getE.Transaction.from_hex(signedTxHex));
  debugData.submitted = true;
  debugData.txHash = txHash;
  console.log(`\nsubmitted via Cardanoscan, txHash: ${txHash}`);
}

// ─── Use case: split-agent-token ───────────────────────────────────────────
// Carve off a UTxO holding EXACTLY 1 agent token from a bulk UTxO. The pool's
// `pAT` check requires `pvalueOf agentInput agentSymbol agentToken == 1`.

type SplitAgentFlags = {
  network: NetworkEnvironment;
  agent: Address;
  dry: boolean;
};

function parseSplitAgentFlags(argv: string[]): SplitAgentFlags {
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
  const agentBech32 = m["agent"] ?? DEFAULT_AGENT_BY_NETWORK[network];
  invariant(agentBech32, `--agent is required (no default for network ${m["network"]})`);
  return { network, agent: Address.fromBech32(agentBech32), dry };
}

async function runSplitAgentToken(argv: string[]): Promise<void> {
  const flags = parseSplitAgentFlags(argv);
  const warehouse = WingridersV2Warehouse.getInstance(flags.network);
  const kupo = new KupoService(resolveKupoUrl(flags.network));

  const pc = flags.agent.toPaymentCredential();
  invariant(pc, "agent address has no payment credential");
  const agentUtxos = await kupo.getUtxosByPaymentCredential(pc.payload);
  invariant(agentUtxos.length > 0, `agent ${flags.agent.bech32} has no UTxOs`);
  invariant(
    agentUtxos.some((u) => u.output.value.get(warehouse.agentAsset) > 0n),
    `agent ${flags.agent.bech32} holds no ${warehouse.agentAsset.toString()}`,
  );

  // Spend ALL agent UTxOs and emit one fresh output: 5 ADA + 1 X token.
  // MINWALLET_SEND_ALL pushes every wallet UTxO into inputs and sends the remainder
  // back to changeAddress.
  const splitOut = new TxOut(flags.agent, new Value().add(ADA, 5_000_000n).add(warehouse.agentAsset, 1n));
  const collateral = new TxOut(flags.agent, new Value().add(ADA, 5_000_000n));

  const txBuilder = new TxBuilder(flags.network).payTo(splitOut, collateral);

  const result = await txBuilder.complete({
    walletUtxos: agentUtxos,
    coinSelectionAlgorithm: CoinSelectionAlgorithm.MINWALLET_SEND_ALL,
    provider: new EmulatorProvider(flags.network),
    changeAddress: flags.agent,
  });
  if (result.type !== "ok") {
    console.error("complete() failed:", result.error);
    process.exit(1);
  }

  console.log(
    XJSON.stringify(
      {
        spentAgentUtxos: agentUtxos.length,
        agentInputOut: { ada: "5000000", agentTokenQty: "1" },
        collateralOut: { ada: "5000000" },
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
    wallet.address.bech32 === flags.agent.bech32,
    `AGENT_SEED_PHRASE derives ${wallet.address.bech32} but --agent is ${flags.agent.bech32}`,
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

// ─── Use case: show info ───────────────────────────────────────────────────

type InfoFlags = {
  network: NetworkEnvironment;
};

function parseInfoFlags(argv: string[]): InfoFlags {
  const m: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected positional arg: ${key}`);
    const val = argv[i + 1];
    if (val === undefined) throw new Error(`Missing value for ${key}`);
    m[key.slice(2)] = val;
    i++;
  }
  return { network: parseNetwork(m["network"]) };
}

function runInfo(argv: string[]): void {
  const flags = parseInfoFlags(argv);
  const w = WingridersV2Warehouse.getInstance(flags.network);

  console.log(
    XJSON.stringify(
      {
        network: flags.network,
        factory: {
          scriptHash: w.factoryScriptHash.hex,
          address: w.factoryAddress.bech32,
          refInput: `${w.factoryRefInput.input.txId.hex}#${w.factoryRefInput.input.index}`,
        },
        dexSymbol: {
          hash: w.dexSymbolHash.hex,
          refInput: `${w.dexSymbolRefInput.input.txId.hex}#${w.dexSymbolRefInput.input.index}`,
        },
        pool: {
          scriptHashCP: w.poolScriptHashCP.hex,
          scriptHashSS: w.poolScriptHashSS.hex,
          addressCP: w.poolAddressCP.bech32,
          addressSS: w.poolAddressSS.bech32,
        },
        request: {
          validatorHashCP: w.requestValidatorHashCP.hex,
          validatorHashSS: w.requestValidatorHashSS.hex,
          addressCP: w.requestAddressCP.bech32,
          orderRefInput: `${w.orderRefInput.input.txId.hex}#${w.orderRefInput.input.index}`,
          poolCpRefInput: `${w.poolCpRefInput.input.txId.hex}#${w.poolCpRefInput.input.index}`,
        },
        assets: {
          factoryAsset: w.factoryAsset.toString(),
          validityAsset: w.validityAsset.toString(),
        },
        constants: {
          MIN_POOL_ADA: WingridersV2Warehouse.MIN_POOL_ADA.toString(),
          MAX_LP_TOKENS: WingridersV2Warehouse.MAX_LP_TOKENS.toString(),
          BURNED_SHARE_TOKENS: WingridersV2Warehouse.BURNED_SHARE_TOKENS.toString(),
          DEFAULT_SWAP_FEE_IN_BASIS: WingridersV2Warehouse.DEFAULT_SWAP_FEE_IN_BASIS.toString(),
          DEFAULT_PROTOCOL_FEE_IN_BASIS: WingridersV2Warehouse.DEFAULT_PROTOCOL_FEE_IN_BASIS.toString(),
          DEFAULT_FEE_BASIS: WingridersV2Warehouse.DEFAULT_FEE_BASIS.toString(),
          DEFAULT_AGENT_FEE_ADA: WingridersV2Warehouse.DEFAULT_AGENT_FEE_ADA.toString(),
          MAX_TX_VALIDITY_RANGE_MS: WingridersV2Warehouse.MAX_TX_VALIDITY_RANGE_MS.toString(),
        },
      },
      2,
    ),
  );
}

// ─── dispatch ──────────────────────────────────────────────────────────────

const USAGE = `\
WingRiders V2 CLI

Usage:
  pnpm tsx src/w2.ts create-pool \\
    [--network <mainnet|testnet-preprod|testnet-preview>]   # default: testnet-preprod \\
    --owner <bech32-address> \\
    --asset-a <lovelace|policyId.tokenName> --amount-a <bigint> \\
    --asset-b <lovelace|policyId.tokenName> --amount-b <bigint>

  pnpm tsx src/w2.ts info \\
    [--network <mainnet|testnet-preprod|testnet-preview>]   # default: testnet-preprod

  pnpm tsx src/w2.ts batch \\
    [--network <mainnet|testnet-preprod|testnet-preview>]   # default: testnet-preprod \\
    [--agent <bech32-address>]   # defaults per network for mainnet / testnet-preprod
    [--dry]                      # build only; without --dry, signs with AGENT_SEED_PHRASE
    [--loop [<ms>]]              # repeat forever; default interval 20000ms; errors are logged, loop continues

  # If your agent UTxO holds >1 X (agent token), the pool's pAT check fails. Split first:
  pnpm tsx src/w2.ts split-agent-token \\
    [--network <mainnet|testnet-preprod|testnet-preview>] \\
    [--agent <bech32-address>] \\
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
    case "create-pool":
      await runCreatePool(rest);
      break;
    case "info":
      runInfo(rest);
      break;
    case "batch":
      await runBatch(rest);
      break;
    case "split-agent-token":
      await runSplitAgentToken(rest);
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
