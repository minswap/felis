import { NetworkEnvironment } from "@minswap/felis-ledger-core";
import { RustModule } from "@minswap/felis-ledger-utils";
import invariant from "@minswap/tiny-invariant";

export function parseEnvironment(s: string): NetworkEnvironment {
  switch (s) {
    case "mainnet":
      return NetworkEnvironment.MAINNET;
    case "testnet-preview":
      return NetworkEnvironment.TESTNET_PREVIEW;
    case "testnet-preprod":
      return NetworkEnvironment.TESTNET_PREPROD;
    default:
      throw new Error(`Unexpected environment ${s}`);
  }
}

function cardanoscanBaseUrl(networkEnv: NetworkEnvironment): string {
  switch (networkEnv) {
    case NetworkEnvironment.MAINNET:
      return "https://api.cardanoscan.io/api/v1";
    case NetworkEnvironment.TESTNET_PREPROD:
      return "https://preprod.cardanoscan.io/api/v1";
    case NetworkEnvironment.TESTNET_PREVIEW:
      return "https://preview.cardanoscan.io/api/v1";
  }
}

const main = async () => {
  await RustModule.load();
  const ECSL = RustModule.getE;
  const networkEnv: NetworkEnvironment = parseEnvironment(process.argv[2]);
  const txHash: string = process.argv[3];
  const apiKey = process.env["CARDANOSCAN_API_KEY"];
  invariant(apiKey, "CARDANOSCAN_API_KEY env var is required");

  const baseUrl = cardanoscanBaseUrl(networkEnv);
  const res = await fetch(`${baseUrl}/transaction/cbor?hash=${txHash}`, {
    method: "GET",
    headers: { apiKey },
  });
  if (!res.ok) throw new Error(`Cardanoscan ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { cbor: string };
  const eTx = ECSL.Transaction.from_hex(body.cbor);
  console.log(eTx.to_json());
};

main();
