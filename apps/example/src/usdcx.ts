import { Address, NetworkEnvironment, XJSON } from "@minswap/felis-ledger-core";
import { RustModule } from "@minswap/felis-ledger-utils";
import { KupoService } from "@minswap/felis-provider";
import { EthDeposit, USDCx, USDCxSdkApi, XReserveApi } from "@minswap/felis-usdcx";
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

// ─── Use case: prepare-withdrawal ──────────────────────────────────────────

async function runPrepareWithdrawal(argv: string[]): Promise<void> {
  const m = parseFlags(argv);
  const network = parseNetwork(m["network"]);
  const cardanoAddr = m["cardano-address"];
  const ethAddr = m["eth-address"];
  const amount = m["amount"] ?? "100"; // 100 USDC

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

// ─── Use case: build-burn-tx ──────────────────────────────────────────────

async function runBuildBurnTx(argv: string[]): Promise<void> {
  const m = parseFlags(argv);
  const network = parseNetwork(m["network"]);
  const cardanoAddrBech32 = m["cardano-address"];
  const burnIntentHex = m["burn-intent"];
  const burnAmount = BigInt(m["burn-amount"] ?? "100000000");

  invariant(cardanoAddrBech32, "--cardano-address required");
  invariant(burnIntentHex, "--burn-intent required");

  console.log("Loading RustModule...");
  await RustModule.load();

  const kupoUrl = resolveKupoUrl(network);
  const kupo = new KupoService(kupoUrl);

  const senderAddress = Address.fromBech32(cardanoAddrBech32);
  console.log(`Fetching UTxOs for ${cardanoAddrBech32} from Kupo...`);
  const utxos = await kupo.utxosByAddress([senderAddress]);
  invariant(utxos.length > 0, `No UTxOs found at ${cardanoAddrBech32}`);

  const config = USDCx.getConfig(network);

  // Separate USDCx and ADA UTxOs
  const usdcxUtxos = utxos.filter((u) => u.output.value.get(config.usdcxAsset));
  const adaUtxos = utxos.filter((u) => !u.output.value.get(config.usdcxAsset));

  invariant(usdcxUtxos.length > 0, `No USDCx UTxOs found at ${cardanoAddrBech32}`);
  invariant(adaUtxos.length > 0, `No ADA UTxOs found at ${cardanoAddrBech32} (needed for fees)`);

  console.log(`Found ${usdcxUtxos.length} USDCx UTxOs and ${adaUtxos.length} ADA UTxOs`);

  // Demo: shows how to use USDCxBurnTx.build() to construct the transaction
  // In production, you would fetch the protocol params UTxO from on-chain and pass it here
  console.log(
    XJSON.stringify(
      {
        note: "Build Burn TX example - use USDCxBurnTx.build() to construct transaction",
        usage: "Fetch protocol params UTxO on-chain, then call USDCxBurnTx.build()",
        parameters: {
          txb: "TxBuilder instance",
          networkEnv: network,
          senderAddress: senderAddress.bech32,
          walletUtxos: `${adaUtxos.length} ADA UTxO(s)`,
          usdcxUtxos: `${usdcxUtxos.length} USDCX UTxO(s)`,
          protocolParamsUtxo: "Fetch from on-chain",
          burnIntentHex: `${burnIntentHex.slice(0, 20)}...`,
          burnAmount: burnAmount.toString(),
        },
      },
      2,
    ),
  );
}

// ─── Use case: register-withdrawal ────────────────────────────────────────

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

// ─── Use case: full-withdraw ──────────────────────────────────────────────

async function runFullWithdraw(argv: string[]): Promise<void> {
  const m = parseFlags(argv);
  const network = parseNetwork(m["network"]);
  const cardanoAddr = m["cardano-address"];
  const ethAddr = m["eth-address"];
  const amount = m["amount"] ?? "100"; // 100 USDC
  const burnIntentHex = m["burn-intent"];
  const txHash = m["tx-hash"];
  const seedPhrase = m["seed-phrase"] ?? process.env["CARDANO_SEED_PHRASE"];
  const kupoUrl = m["kupo-url"] ?? resolveKupoUrl(network);

  invariant(cardanoAddr, "--cardano-address required");
  invariant(ethAddr, "--eth-address required");

  const config = USDCx.getConfig(network);

  console.log("\n=== USDCx Full Withdrawal Flow ===\n");
  console.log(`Network: ${NetworkEnvironment[network]}`);
  console.log(`Cardano Address: ${cardanoAddr}`);
  console.log(`Ethereum Address: ${ethAddr}`);
  console.log(`Amount: ${amount} USDC\n`);

  let actualBurnIntentHex = burnIntentHex;
  const actualTxHash = txHash;

  // Step 1: Prepare withdrawal (get burn intent)
  if (!actualBurnIntentHex) {
    console.log("Step 1: Preparing withdrawal with Circle xReserve API...");
    try {
      const prepareResult = await XReserveApi.prepareWithdrawal({
        xReserveApiUrl: config.xReserveApiUrl,
        cardanoSenderAddress: cardanoAddr,
        ethRecipientAddress: ethAddr,
        valueExcludingFees: amount,
      });
      actualBurnIntentHex = prepareResult.burnIntentHex;
      console.log(`✓ Got burn intent: ${actualBurnIntentHex.slice(0, 20)}...\n`);
    } catch (err) {
      console.error(`API error: ${String(err)}\n`);
      console.log("Tip: The Circle API may be unavailable or the addresses invalid.");
      console.log("Use --burn-intent <hex> to skip this step.\n");
      process.exit(1);
    }
  } else {
    console.log("Step 1: Using provided burn intent\n");
  }

  // Step 2: Build burn transaction (needs seed phrase + on-chain protocol params)
  if (!actualTxHash) {
    if (seedPhrase) {
      console.log("Step 2: Building Cardano burn transaction...");

      await RustModule.load();
      const kupo = new KupoService(kupoUrl);

      const senderAddress = Address.fromBech32(cardanoAddr);
      console.log(`  Fetching UTxOs from ${kupoUrl}...`);
      const utxos = await kupo.utxosByAddress([senderAddress]);
      invariant(utxos.length > 0, `No UTxOs found at ${cardanoAddr}`);

      const usdcxConfig = USDCx.getConfig(network);
      const usdcxUtxos = utxos.filter((u) => u.output.value.get(usdcxConfig.usdcxAsset));
      const adaUtxos = utxos.filter((u) => !u.output.value.get(usdcxConfig.usdcxAsset));

      invariant(usdcxUtxos.length > 0, `No USDCx UTxOs found at ${cardanoAddr}`);
      invariant(adaUtxos.length > 0, `No ADA UTxOs found at ${cardanoAddr}`);

      console.log(`  Found ${usdcxUtxos.length} USDCx UTxOs and ${adaUtxos.length} ADA UTxOs`);
      console.log(`  Note: Build requires protocol params UTxO (from on-chain)\n`);
      console.log(
        "  To complete the burn transaction, you need the protocol params UTxO.\n" +
          "  See WITHDRAWAL_GUIDE.md for implementation options (CLI, lucid, Felis TxBuilder).\n",
      );
    } else {
      console.log(
        "Step 2: Build & sign burn transaction\n" +
          "  (skipped — provide --seed-phrase or CARDANO_SEED_PHRASE env to build)\n" +
          "  (see WITHDRAWAL_GUIDE.md for implementation options)\n",
      );
    }
  } else {
    console.log("Step 2: Using provided transaction hash\n");
  }

  // Step 3: Register withdrawal
  if (actualTxHash) {
    console.log("Step 3: Registering withdrawal with SDK API...");
    const registerResult = await USDCxSdkApi.registerWithdrawal({
      sdkApiUrl: config.sdkApiUrl,
      transactionHash: actualTxHash,
      localAddress: cardanoAddr,
    });
    console.log(`✓ Withdrawal status: ${registerResult.status}\n`);

    // Step 4: Timeline
    console.log("Step 4: Timeline");
    console.log("  → Operators observe the burn transaction on Cardano (~5 min)");
    console.log("  → Operators collect signatures (~5-10 min)");
    console.log("  → USDC released on Ethereum Sepolia (~20-30 min total)\n");

    console.log("Summary:");
    console.log(
      XJSON.stringify(
        {
          network: NetworkEnvironment[network],
          cardanoAddress: cardanoAddr,
          ethAddress: ethAddr,
          amount: `${amount} USDC`,
          burnIntentHex: `${actualBurnIntentHex.slice(0, 20)}...`,
          txHash: actualTxHash,
          status: registerResult.status,
        },
        2,
      ),
    );
  } else {
    console.log(
      "Summary: Build & sign transaction first, then rerun with --tx-hash <hash> to register.\n" +
        "See WITHDRAWAL_GUIDE.md for step-by-step implementation.",
    );
  }
}

// ─── Main dispatcher ───────────────────────────────────────────────────────

const USAGE = `
Usage: pnpm tsx src/usdcx.ts <command> [options]

Commands:
  info                  Print USDCx config for a network
  deposit-args          Convert Cardano address to deposit arguments
  prepare-withdrawal    Call Circle API to prepare withdrawal (get burn intent)
  build-burn-tx         Build a Cardano burn transaction
  register-withdrawal   Register burn tx with SDK API
  full-withdraw         Orchestrate complete withdrawal: prepare → (build) → register

Options:
  --network <name>      Network: mainnet, testnet-preprod, testnet-preview (default: testnet-preprod)
  --cardano-address     Cardano bech32 address
  --eth-address         Ethereum address (0x...)
  --amount              Amount for withdrawal (decimal string, default: "100")
  --burn-intent         Hex-encoded burn intent from prepare-withdrawal
  --tx-hash             Burn transaction hash (hex)
  --seed-phrase         Cardano seed phrase for signing (or CARDANO_SEED_PHRASE env)
  --kupo-url            Kupo service URL for fetching UTxOs
  --amount-usdc         USDC amount for deposit (6-decimal, default: 100000000)
  --max-fee-usdc        Max fee (6-decimal, default: 10000000)
  --burn-amount         Amount to burn in lovelace (default: 100000000)
  --datum-hash          Datum hash for deposit (32-byte hex)

Examples:
  # Show config
  pnpm tsx src/usdcx.ts info --network testnet-preprod

  # Full withdrawal (orchestrated)
  pnpm tsx src/usdcx.ts full-withdraw \\
    --network testnet-preprod \\
    --cardano-address addr_test1qz2... \\
    --eth-address 0x1234... \\
    --amount 100

  # Get deposit args for Ethereum deposit
  pnpm tsx src/usdcx.ts deposit-args \\
    --cardano-address addr_test1qz2... \\
    --eth-address 0x1234...

  # Step-by-step withdrawal
  # 1. Prepare withdrawal
  pnpm tsx src/usdcx.ts prepare-withdrawal \\
    --network testnet-preprod \\
    --cardano-address addr_test1qz2... \\
    --eth-address 0x1234... \\
    --amount 100

  # 2. Build burn tx (see WITHDRAWAL_GUIDE.md for implementation)
  # 3. Register after on-chain confirmation
  pnpm tsx src/usdcx.ts register-withdrawal \\
    --network testnet-preprod \\
    --tx-hash abc123... \\
    --cardano-address addr_test1qz2...
`;

const main = async () => {
  const [_node, _script, command, ...args] = process.argv;

  switch (command) {
    case "info":
      return runInfo(args);
    case "deposit-args":
      return runDepositArgs(args);
    case "prepare-withdrawal":
      return runPrepareWithdrawal(args);
    case "build-burn-tx":
      return runBuildBurnTx(args);
    case "register-withdrawal":
      return runRegisterWithdrawal(args);
    case "full-withdraw":
      return runFullWithdraw(args);
    default:
      console.error(`\n${USAGE}`);
      process.exit(1);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
