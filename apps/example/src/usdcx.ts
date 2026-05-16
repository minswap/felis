import { baseAddressWalletFromSeed } from "@minswap/felis-cip";
import {
  Address,
  type Asset,
  Bytes,
  NetworkEnvironment,
  type TxIn,
  type Utxo,
  XJSON,
} from "@minswap/felis-ledger-core";
import { RustModule } from "@minswap/felis-ledger-utils";
import { CardanoscanProvider, KupoService } from "@minswap/felis-provider";
import { CoinSelectionAlgorithm, ECSLConverter, EmulatorProvider, TxBuilder } from "@minswap/felis-tx-builder";
import { EthDeposit, USDCx, USDCxBurnTx, USDCxSdkApi, XReserveApi } from "@minswap/felis-usdcx";
import invariant from "@minswap/tiny-invariant";

// ─── CLI Plumbing ──────────────────────────────────────────────────────────

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
  const config = USDCx.getConfig(network);

  console.log(
    XJSON.stringify(
      {
        network,
        usdcx: {
          policyId: config.usdcxAsset.currencySymbol.hex,
          tokenName: config.usdcxAsset.tokenName.hex,
          asset: config.usdcxAsset.toString(),
        },
        protocolParamsAsset: config.protocolParamsAsset.toString(),
        mintingRefScriptTxIn: `${config.mintingRefScriptTxIn.txId.hex}#${config.mintingRefScriptTxIn.index}`,
        mintingLogicRefScriptTxIn: `${config.mintingLogicRefScriptTxIn.txId.hex}#${config.mintingLogicRefScriptTxIn.index}`,
        apis: {
          sdkApiUrl: config.sdkApiUrl,
          xReserveApiUrl: config.xReserveApiUrl,
        },
      },
      2,
    ),
  );
}

// ─── Use case: deposit-args ────────────────────────────────────────────────

function runDepositArgs(argv: string[]): void {
  const m = parseFlags(argv);
  const cardanoAddr = m["cardano-address"];
  const ethAddr = m["eth-address"];
  const amountUsdc = BigInt(m["amount-usdc"] ?? "100000000"); // 100 USDC in 6-decimal
  const maxFeeUsdc = BigInt(m["max-fee-usdc"] ?? "10000000"); // 10 USDC
  const datumHash = m["datum-hash"];
  const localToken = m["local-token"] ?? "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Testnet USDC

  invariant(cardanoAddr, "--cardano-address required");
  invariant(ethAddr, "--eth-address required");

  const depositArgs = EthDeposit.buildDepositArgs({
    cardanoRecipient: cardanoAddr,
    amountUsdc,
    maxFeeUsdc,
    localToken: localToken as `0x${string}`,
    datumHashHex: datumHash,
  });

  console.log("Deposit args for viem writeContract:");
  console.log(XJSON.stringify(depositArgs, 2));
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function fetchProtocolParamsUtxo(kupo: KupoService, protocolParamsAsset: Asset): Promise<Utxo> {
  const kupoUtxos = await kupo.kupoUtxosByAsset(protocolParamsAsset);
  invariant(
    kupoUtxos.length > 0,
    `Could not find protocol params UTxO carrying ${protocolParamsAsset.toString()}. Is Kupo synced and indexing this policy?`,
  );
  const k = kupoUtxos[0];
  const utxos = await kupo.utxosByTxIn({
    txId: Bytes.fromHex(k.transaction_id),
    index: k.output_index,
  });
  invariant(utxos.length > 0, "Failed to parse protocol params UTxO from Kupo");
  return utxos[0];
}

async function fetchUtxoByTxIn(kupo: KupoService, txIn: TxIn, label: string): Promise<Utxo> {
  const utxos = await kupo.utxosByTxIn(txIn);
  invariant(
    utxos.length > 0,
    `Could not find ${label} UTxO ${txIn.txId.hex}#${txIn.index}. Is Kupo synced and indexing this UTxO?`,
  );
  return utxos[0];
}

// ─── Use case: withdraw (seamless end-to-end) ─────────────────────────────

async function runWithdraw(argv: string[]): Promise<void> {
  const m = parseFlags(argv);
  const network = parseNetwork(m["network"]);
  const cardanoAddrBech32 = m["cardano-address"];
  const ethAddr = m["eth-address"];
  const seedPhrase = m["seed-phrase"] ?? process.env["CARDANO_SEED_PHRASE"];
  const amountUsdc = m["amount-usdc"]; // human USDC, e.g. "100"
  const kupoUrl = m["kupo-url"] ?? resolveKupoUrl(network);
  const cardanoscanKey = m["cardanoscan-key"] ?? process.env["CARDANOSCAN_KEY"];

  invariant(cardanoAddrBech32, "--cardano-address required");
  invariant(ethAddr, "--eth-address required");
  invariant(seedPhrase, "--seed-phrase (or CARDANO_SEED_PHRASE env) required");
  invariant(amountUsdc, "--amount-usdc required (e.g. 100 for 100 USDC)");
  invariant(cardanoscanKey, "--cardanoscan-key (or CARDANOSCAN_KEY env) required to submit");

  const config = USDCx.getConfig(network);
  const senderAddress = Address.fromBech32(cardanoAddrBech32);

  // Amount in 6-decimal smallest units (USDC has 6 decimals == USDCx).
  const burnAmount = BigInt(Math.round(Number(amountUsdc) * 1_000_000));
  invariant(burnAmount > 0n, "--amount-usdc must be > 0");

  console.log("\n=== USDCx seamless withdrawal ===\n");
  console.log(`Network:           ${NetworkEnvironment[network]}`);
  console.log(`Cardano address:   ${cardanoAddrBech32}`);
  console.log(`Ethereum address:  ${ethAddr}`);
  console.log(`Amount:            ${amountUsdc} USDC (${burnAmount} base units)\n`);

  // 1. Load WASM and derive wallet
  console.log("Step 1: deriving wallet from seed phrase…");
  await RustModule.load();
  const wallet = baseAddressWalletFromSeed(seedPhrase, network);
  invariant(
    wallet.address.bech32 === cardanoAddrBech32,
    `Seed phrase derives ${wallet.address.bech32} but --cardano-address is ${cardanoAddrBech32}`,
  );
  console.log(`  ✓ wallet matches --cardano-address\n`);

  // 2. Prepare withdrawal with Circle xReserve to get the burn intent
  console.log(`Step 2: calling Circle xReserve API (${config.xReserveApiUrl})…`);
  const prepared = await XReserveApi.prepareWithdrawal({
    xReserveApiUrl: config.xReserveApiUrl,
    cardanoSenderAddress: cardanoAddrBech32,
    ethRecipientAddress: ethAddr,
    valueExcludingFees: amountUsdc,
  });
  console.log(`  ✓ burnIntentHex:     ${prepared.burnIntentHex.slice(0, 32)}…`);
  console.log(`  ✓ messageHashToSign: ${prepared.messageHashToSign.slice(0, 32)}…\n`);

  // 3. Fetch UTxOs (wallet + protocol params)
  console.log(`Step 3: fetching UTxOs from Kupo (${kupoUrl})…`);
  const kupo = new KupoService(kupoUrl);
  const walletAllUtxos = await kupo.utxosByAddress([senderAddress]);
  invariant(walletAllUtxos.length > 0, `No UTxOs at ${cardanoAddrBech32}`);

  const usdcxUtxos = walletAllUtxos.filter((u) => u.output.value.get(config.usdcxAsset));
  const adaUtxos = walletAllUtxos.filter((u) => !u.output.value.get(config.usdcxAsset));
  invariant(usdcxUtxos.length > 0, `No USDCx UTxOs at ${cardanoAddrBech32}`);
  invariant(adaUtxos.length > 0, `No pure-ADA UTxOs at ${cardanoAddrBech32} (needed for fees)`);

  const heldUsdcx = usdcxUtxos.reduce((acc, u) => acc + (u.output.value.get(config.usdcxAsset) ?? 0n), 0n);
  invariant(heldUsdcx >= burnAmount, `Wallet holds ${heldUsdcx} USDCx base units but burn requires ${burnAmount}`);
  console.log(`  ✓ ${usdcxUtxos.length} USDCx UTxOs, ${adaUtxos.length} ADA UTxOs (balance ${heldUsdcx})\n`);

  console.log(`  fetching protocol params UTxO (${config.protocolParamsAsset.toString()})…`);
  const protocolParamsUtxo = await fetchProtocolParamsUtxo(kupo, config.protocolParamsAsset);
  console.log(`  ✓ protocol params at ${protocolParamsUtxo.input.txId.hex}#${protocolParamsUtxo.input.index}`);

  console.log(
    `  fetching minting-policy ref-script UTxO (${config.mintingRefScriptTxIn.txId.hex}#${config.mintingRefScriptTxIn.index})…`,
  );
  console.log(
    `  fetching minting-logic ref-script UTxO (${config.mintingLogicRefScriptTxIn.txId.hex}#${config.mintingLogicRefScriptTxIn.index})…`,
  );
  const [mintingRefScriptUtxo, mintingLogicRefScriptUtxo] = await Promise.all([
    fetchUtxoByTxIn(kupo, config.mintingRefScriptTxIn, "minting-policy ref-script"),
    fetchUtxoByTxIn(kupo, config.mintingLogicRefScriptTxIn, "minting-logic ref-script"),
  ]);
  console.log(`  ✓ both ref-script UTxOs ready\n`);

  // 4. Build, complete, sign, submit
  console.log("Step 4: building burn transaction…");
  const txb = USDCxBurnTx.build({
    txb: new TxBuilder(network),
    networkEnv: network,
    senderAddress,
    walletUtxos: adaUtxos,
    usdcxUtxos,
    protocolParamsUtxo,
    mintingRefScriptUtxo,
    mintingLogicRefScriptUtxo,
    burnIntentHex: prepared.burnIntentHex,
    burnAmount,
  });

  const completeResult = await txb.complete({
    changeAddress: senderAddress,
    walletUtxos: adaUtxos,
    coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
    provider: new EmulatorProvider(network),
  });
  if (completeResult.type !== "ok") {
    throw new Error(`txb.complete failed: ${String(completeResult.error)}`);
  }
  const signedTxHex = completeResult.value.signWithPrivateKey(wallet.paymentKey).complete();
  const txHash = ECSLConverter.getTxHash(RustModule.getE.Transaction.from_hex(signedTxHex));
  console.log(`  ✓ signed, txHash: ${txHash}\n`);

  console.log("Step 5: submitting via Cardanoscan…");
  const cardanoscan = CardanoscanProvider.forNetwork(network, cardanoscanKey);
  await cardanoscan.submitTx(signedTxHex);
  console.log(`  ✓ submitted\n`);

  // 6. Register withdrawal with SDK API
  console.log(`Step 6: registering withdrawal with SDK API (${config.sdkApiUrl})…`);
  const registered = await USDCxSdkApi.registerWithdrawal({
    sdkApiUrl: config.sdkApiUrl,
    transactionHash: txHash,
    localAddress: cardanoAddrBech32,
  });
  console.log(`  ✓ status: ${registered.status}\n`);

  console.log("=== Done ===");
  console.log(
    XJSON.stringify(
      {
        network: NetworkEnvironment[network],
        cardanoAddress: cardanoAddrBech32,
        ethAddress: ethAddr,
        amountUsdc,
        burnAmount: burnAmount.toString(),
        txHash,
        status: registered.status,
        burnIntentHex: prepared.burnIntentHex,
      },
      2,
    ),
  );
  console.log(
    "\nOperators will observe the burn (~5 min), collect signatures (~5-10 min),\n" +
      "and Circle will release USDC on Ethereum (~20-30 min total).",
  );
}

// ─── Use case: prepare-withdrawal (low-level) ─────────────────────────────

async function runPrepareWithdrawal(argv: string[]): Promise<void> {
  const m = parseFlags(argv);
  const network = parseNetwork(m["network"]);
  const cardanoAddr = m["cardano-address"];
  const ethAddr = m["eth-address"];
  const amount = m["amount"] ?? "100";

  invariant(cardanoAddr, "--cardano-address required");
  invariant(ethAddr, "--eth-address required");

  const config = USDCx.getConfig(network);
  console.log(`Calling xReserve API at ${config.xReserveApiUrl}...`);
  const result = await XReserveApi.prepareWithdrawal({
    xReserveApiUrl: config.xReserveApiUrl,
    cardanoSenderAddress: cardanoAddr,
    ethRecipientAddress: ethAddr,
    valueExcludingFees: amount,
  });

  console.log("Burn intent from Circle xReserve API:");
  console.log(XJSON.stringify(result, 2));
}

// ─── Use case: register-withdrawal (low-level) ────────────────────────────

async function runRegisterWithdrawal(argv: string[]): Promise<void> {
  const m = parseFlags(argv);
  const network = parseNetwork(m["network"]);
  const txHash = m["tx-hash"];
  const cardanoAddr = m["cardano-address"];

  invariant(txHash, "--tx-hash required");
  invariant(cardanoAddr, "--cardano-address required");

  const config = USDCx.getConfig(network);
  console.log(`Registering withdrawal with SDK API at ${config.sdkApiUrl}...`);
  const result = await USDCxSdkApi.registerWithdrawal({
    sdkApiUrl: config.sdkApiUrl,
    transactionHash: txHash,
    localAddress: cardanoAddr,
  });

  console.log("Withdrawal registered:");
  console.log(XJSON.stringify(result, 2));
}

// ─── Main dispatcher ───────────────────────────────────────────────────────

const USAGE = `
Usage: pnpm tsx src/usdcx.ts <command> [options]

Commands:
  info                  Print USDCx config for a network
  deposit-args          Convert Cardano address to deposit arguments
  withdraw              Seamless end-to-end USDCx → USDC withdrawal (prepare → build → sign → submit → register)
  prepare-withdrawal    [low-level] Call Circle API to get burn intent
  register-withdrawal   [low-level] Register an existing burn tx with the SDK API

Common options:
  --network <name>      mainnet | testnet-preprod | testnet-preview (default: testnet-preprod)

Withdraw options (all required unless from env):
  --cardano-address     Cardano bech32 address (must match seed phrase)
  --eth-address         Ethereum recipient (0x...)
  --seed-phrase         Cardano seed phrase (or CARDANO_SEED_PHRASE env)
  --amount-usdc         USDC amount, decimal (e.g. "100" = 100 USDC)
  --kupo-url            Kupo URL (default: per-network)
  --cardanoscan-key     Cardanoscan API key (or CARDANOSCAN_KEY env)

Examples:
  # Seamless withdrawal
  pnpm tsx src/usdcx.ts withdraw \\
    --network testnet-preprod \\
    --cardano-address addr_test1qz2... \\
    --eth-address 0x1234... \\
    --seed-phrase "word1 word2 ..." \\
    --amount-usdc 100

  # Or via env vars:
  CARDANO_SEED_PHRASE="…" CARDANOSCAN_KEY="…" pnpm tsx src/usdcx.ts withdraw \\
    --cardano-address addr_test1qz2... --eth-address 0x1234... --amount-usdc 100
`;

const main = async () => {
  const [_node, _script, command, ...args] = process.argv;

  switch (command) {
    case "info":
      return runInfo(args);
    case "deposit-args":
      return runDepositArgs(args);
    case "withdraw":
      return runWithdraw(args);
    case "prepare-withdrawal":
      return runPrepareWithdrawal(args);
    case "register-withdrawal":
      return runRegisterWithdrawal(args);
    default:
      console.error(`\n${USAGE}`);
      process.exit(1);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
