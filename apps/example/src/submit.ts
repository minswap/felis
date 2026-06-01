/**
 * Build and optionally submit two self-send Cardano transactions from one seed phrase.
 *
 * The wallet is derived from the BIP-39 mnemonic in SEED. The script fetches
 * UTxOs at the derived address, selects two different ADA-only inputs, then
 * prepares two signed transactions that each send 5 ADA back to the same wallet.
 *
 * Usage:
 *   SEED="word1 word2 ..." pnpm --filter @apps/example tsx src/submit-chain.ts \
 *     --network <mainnet|testnet-preprod|testnet-preview> [--dry]
 *
 * Env:
 *   SEED                Required BIP-39 mnemonic.
 *   KUPO_MAINNET_URL    Optional Kupo URL override for mainnet.
 *   KUPO_PREPROD_URL    Optional Kupo URL override for preprod.
 *   KUPO_PREVIEW_URL    Optional Kupo URL override for preview.
 *   OGMIOS_MAINNET_URL  Optional Ogmios URL override for mainnet.
 *   OGMIOS_PREPROD_URL  Optional Ogmios URL override for preprod.
 *   OGMIOS_PREVIEW_URL  Optional Ogmios URL override for preview.
 *   CARDANOSCAN_KEY     Required when --dry is omitted.
 *
 * Output:
 *   Always prints wallet address, selected inputs, tx IDs, signed CBORs, and
 *   the Cardanoscan chain CBOR payload.
 *   With --dry, transactions are not submitted.
 */

import { baseAddressWalletFromSeed } from "@minswap/felis-cip";
import { ADA, NetworkEnvironment, TxIn, TxOut, type Utxo, Value, XJSON } from "@minswap/felis-ledger-core";
import { RustModule } from "@minswap/felis-ledger-utils";
import { CardanoscanProvider, KupoService, OgmiosApi } from "@minswap/felis-provider";
import { CoinSelectionAlgorithm, ECSLConverter, TxBuilder } from "@minswap/felis-tx-builder";
import invariant from "@minswap/tiny-invariant";
import * as cbor from "cbor";

const DEFAULT_NETWORK = "testnet-preprod";
const SELF_SEND_AMOUNT = 5_000_000n;
const MIN_INPUT_AMOUNT = 6_000_000n;

type Flags = {
  network: NetworkEnvironment;
  dry: boolean;
};

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

function resolveOgmiosUrl(network: NetworkEnvironment): string {
  switch (network) {
    case NetworkEnvironment.MAINNET:
      return process.env["OGMIOS_MAINNET_URL"] ?? "http://mainnet-staging:1337";
    case NetworkEnvironment.TESTNET_PREPROD:
      return process.env["OGMIOS_PREPROD_URL"] ?? "http://testnet-preprod.tail2feb3.ts.net:1337";
    case NetworkEnvironment.TESTNET_PREVIEW:
      return process.env["OGMIOS_PREVIEW_URL"] ?? "http://dev-3:1337";
  }
}

function parseOgmiosUrl(url: string): { host: string; port: number } {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || (u.protocol === "https:" ? 443 : 80)) };
}

function parseFlags(argv: string[]): Flags {
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

  return {
    network: parseNetwork(m["network"]),
    dry,
  };
}

function pickInputs(utxos: Utxo[]): [Utxo, Utxo] {
  const candidates = utxos
    .filter((utxo) => utxo.output.value.isAdaOnly() && utxo.output.value.coin() >= MIN_INPUT_AMOUNT)
    .sort((a, b) => {
      const diff = b.output.value.coin() - a.output.value.coin();
      if (diff > 0n) return 1;
      if (diff < 0n) return -1;
      return TxIn.compare(a.input, b.input);
    });

  invariant(
    candidates.length >= 2,
    `need at least 2 ADA-only UTxOs with at least ${MIN_INPUT_AMOUNT.toString()} lovelace`,
  );

  return [candidates[0], candidates[1]];
}

function encodeTxChainCbor(txs: { signedTxHex: string }[]): string {
  const txBuffers = txs.map((tx) => Buffer.from(tx.signedTxHex, "hex"));
  return Buffer.from(cbor.encode(txBuffers)).toString("hex");
}

async function buildSelfSendTx({
  network,
  provider,
  input,
  wallet,
}: {
  network: NetworkEnvironment;
  provider: OgmiosApi;
  input: Utxo;
  wallet: ReturnType<typeof baseAddressWalletFromSeed>;
}): Promise<{ txId: string; signedTxHex: string; input: string }> {
  const txb = new TxBuilder(network)
    .collectFromPubKey(input)
    .payTo(TxOut.newPubKeyOut({ address: wallet.address, value: new Value().add(ADA, SELF_SEND_AMOUNT) }));

  const result = await txb.completeForTxChaining({
    walletUtxos: [],
    coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
    provider,
    changeAddress: wallet.address,
  });
  if (result.type !== "ok") {
    throw new Error(`completeForTxChaining failed: ${String(result.error)}`);
  }

  const signedTxHex = result.value.txComplete.signWithPrivateKey(wallet.paymentKey).complete();
  const txId = ECSLConverter.getTxHash(RustModule.getE.Transaction.from_hex(signedTxHex));
  return {
    txId,
    signedTxHex,
    input: TxIn.toString(input.input),
  };
}

async function main(): Promise<void> {
  await RustModule.load();
  const flags = parseFlags(process.argv.slice(2));
  console.log(XJSON.stringify(flags, 2));
  const seed = process.env["SEED"];
  invariant(seed, "SEED env var is required");

  const wallet = baseAddressWalletFromSeed(seed, flags.network);
  const kupo = new KupoService(resolveKupoUrl(flags.network));
  const ogmios = await OgmiosApi.new(parseOgmiosUrl(resolveOgmiosUrl(flags.network)));

  const paymentCredential = wallet.address.toPaymentCredential();
  invariant(paymentCredential, `wallet address has no payment credential: ${wallet.address.bech32}`);

  const walletUtxos = await kupo.getUtxosByPaymentCredential(paymentCredential.payload);
  const inputs = pickInputs(walletUtxos);
  const tx = await buildSelfSendTx({ network: flags.network, provider: ogmios, input: inputs[0], wallet });
  const cardanoscanKey = process.env["CARDANOSCAN_KEY"];
  invariant(cardanoscanKey, "CARDANOSCAN_KEY env var is required to submit (use --dry to skip submit)");
  const cardanoscan = CardanoscanProvider.forNetwork(flags.network, cardanoscanKey);
  const result = await cardanoscan.submitTx(tx.signedTxHex);
  console.log("Submitted transaction:", result, tx.txId);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
