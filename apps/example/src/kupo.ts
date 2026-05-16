/**
 * Kupo CLI — query a Kupo indexer for UTxOs, datums, and health.
 *
 * Usage:
 *   pnpm tsx src/kupo.ts <query> --network <mainnet|testnet-preprod|testnet-preview> [targets...] [--raw]
 *
 * Queries (pick one):
 *   --health                                  Ping the Kupo instance.
 *   --datum --datum-hash <hash> [...]         Resolve one or more datum hashes.
 *   --utxo <target flags...>                  Fetch UTxOs matching any of the targets.
 *   --inspect-utxo <hex>                      Parse a raw hex-encoded UTxO and print it (offline, no Kupo call).
 *
 * Targets for --utxo (repeatable, combined as a union):
 *   --tx-in <txId#index>                      UTxO at a specific output reference.
 *   --address <bech32>                        All UTxOs at an address.
 *   --payment-credential <hex>                All UTxOs at a payment credential hash.
 *   --asset <policyId.tokenName|lovelace>     UTxOs containing the asset.
 *   --policy-id <hex>                         UTxOs containing any asset under the policy.
 *
 * Output:
 *   Default: pretty XJSON (BigInt-safe).
 *   --raw    Print one hex-encoded UTxO per line (only with --utxo).
 *   --sum    Print the summed Value of all matching UTxOs (only with --utxo).
 *   --count  Print each UTxO as { txIn, coin (ADA), assets (token count) } (only with --utxo).
 *
 * Env:
 *   KUPO_MAINNET_URL, KUPO_PREPROD_URL, KUPO_PREVIEW_URL override defaults.
 *
 * Examples:
 *   pnpm tsx src/kupo.ts --health --network mainnet
 *   pnpm tsx src/kupo.ts --utxo --network testnet-preprod --address addr_test1...
 *   pnpm tsx src/kupo.ts --utxo --network mainnet --tx-in abcd...#0 --raw
 *   pnpm tsx src/kupo.ts --datum --network mainnet --datum-hash <hash>
 *   pnpm tsx src/kupo.ts --inspect-utxo 82825820...
 */
import { ADA, Address, Asset, Bytes, NetworkEnvironment, TxIn, Utxo, XJSON } from "@minswap/felis-ledger-core";
import { RustModule } from "@minswap/felis-ledger-utils";
import { KupoService } from "@minswap/felis-provider";

type Flags = {
  // Query kind
  utxo: boolean;
  health: boolean;
  datum: boolean;
  inspectUtxo?: string;
  // Output
  raw: boolean;
  sum: boolean;
  count: boolean;
  // Target
  network?: string;
  txIns: string[];
  addresses: string[];
  paymentCredentials: string[];
  assets: string[];
  policyIds: string[];
  datumHashes: string[];
};

const parseArgs = (argv: string[]): Flags => {
  const flags: Flags = {
    utxo: false,
    health: false,
    datum: false,
    raw: false,
    sum: false,
    count: false,
    txIns: [],
    addresses: [],
    paymentCredentials: [],
    assets: [],
    policyIds: [],
    datumHashes: [],
  };
  const take = (i: number): string => {
    const v = argv[i + 1];
    if (!v) throw new Error(`Missing value for ${argv[i]}`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--utxo":
        flags.utxo = true;
        break;
      case "--health":
        flags.health = true;
        break;
      case "--datum":
        flags.datum = true;
        break;
      case "--inspect-utxo":
        flags.inspectUtxo = take(i);
        i++;
        break;
      case "--raw":
        flags.raw = true;
        break;
      case "--sum":
        flags.sum = true;
        break;
      case "--count":
        flags.count = true;
        break;
      case "--network":
        flags.network = take(i);
        i++;
        break;
      case "--tx-in":
        flags.txIns.push(take(i));
        i++;
        break;
      case "--address":
        flags.addresses.push(take(i));
        i++;
        break;
      case "--payment-credential":
        flags.paymentCredentials.push(take(i));
        i++;
        break;
      case "--asset":
        flags.assets.push(take(i));
        i++;
        break;
      case "--policy-id":
        flags.policyIds.push(take(i));
        i++;
        break;
      case "--datum-hash":
        flags.datumHashes.push(take(i));
        i++;
        break;
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  return flags;
};

const parseNetwork = (s?: string): NetworkEnvironment => {
  switch (s) {
    case "mainnet":
      return NetworkEnvironment.MAINNET;
    case "testnet-preview":
      return NetworkEnvironment.TESTNET_PREVIEW;
    case "testnet-preprod":
      return NetworkEnvironment.TESTNET_PREPROD;
    default:
      throw new Error(`--network must be one of mainnet|testnet-preprod|testnet-preview (got ${s})`);
  }
};

const resolveKupoUrl = (network: NetworkEnvironment): string => {
  switch (network) {
    case NetworkEnvironment.MAINNET:
      return process.env["KUPO_MAINNET_URL"] ?? "http://mainnet-staging:1442";
    case NetworkEnvironment.TESTNET_PREPROD:
      return process.env["KUPO_PREPROD_URL"] ?? "http://testnet-preprod:1442";
    case NetworkEnvironment.TESTNET_PREVIEW:
      return process.env["KUPO_PREVIEW_URL"] ?? "http://dev-3:1442";
  }
};

const printJson = (v: unknown) => {
  console.log(XJSON.stringify(v, 2));
};

const main = async () => {
  await RustModule.load();
  const flags = parseArgs(process.argv.slice(2));

  if (flags.inspectUtxo !== undefined) {
    printJson(Utxo.fromHex(flags.inspectUtxo));
    return;
  }

  const network = parseNetwork(flags.network);
  const kupo = new KupoService(resolveKupoUrl(network));

  if (flags.health) {
    printJson(await kupo.health());
    return;
  }

  if (flags.datum) {
    if (flags.datumHashes.length === 0) throw new Error("--datum requires --datum-hash <hash>");
    const mapDatum = await kupo.getDatums(flags.datumHashes);
    printJson(mapDatum);
    return;
  }

  if (!flags.utxo) throw new Error("Specify a query: --utxo | --health | --datum");
  const utxos: Utxo[] = [];
  if (flags.txIns.length > 0) {
    const txIns = flags.txIns.map((s) => TxIn.fromString(s));
    utxos.push(...(await kupo.utxosByTxIn(...txIns)));
  }
  if (flags.addresses.length > 0) {
    const addresses = flags.addresses.map((s) => Address.fromBech32(s));
    utxos.push(...(await kupo.utxosByAddress(addresses)));
  }
  for (const pc of flags.paymentCredentials) {
    utxos.push(...(await kupo.getUtxosByPaymentCredential(Bytes.fromHex(pc))));
  }
  for (const asset of flags.assets) {
    const kupoUtxos = await kupo.kupoUtxosByAsset(Asset.fromString(asset));
    for (const u of kupoUtxos) utxos.push(Utxo.fromKupo(u));
  }
  for (const policyId of flags.policyIds) {
    const kupoUtxos = await kupo.kupoUtxosByPolicyID(Bytes.fromHex(policyId));
    for (const u of kupoUtxos) utxos.push(Utxo.fromKupo(u));
  }

  if (utxos.length === 0) {
    console.error("No UTXOs found");
    return;
  }

  if (flags.count) {
    printJson(
      utxos.map((u) => ({
        txIn: TxIn.toString(u.input),
        coin: Number(u.output.value.coin()) / 1_000_000,
        assets: u.output.value.assets().filter((a) => !a.equals(ADA)).length,
      })),
    );
  } else if (flags.sum) {
    printJson(Utxo.sumValue(utxos));
  } else if (flags.raw) {
    for (const u of utxos) console.log(Utxo.toHex(u));
  } else {
    printJson(utxos);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
