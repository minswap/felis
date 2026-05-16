---
description: Fetch a Cardano transaction CBOR from Cardanoscan and print the parsed ECSL JSON
argument-hint: <mainnet|testnet-preprod|testnet-preview> <txHash>
allowed-tools: [Bash]
---

# /tx-info

Runs the script at [apps/example/src/tx-info.ts](apps/example/src/tx-info.ts) to fetch a transaction from Cardanoscan and print its decoded JSON.

## Arguments

`$ARGUMENTS` = `<network> <txHash>`, e.g. `mainnet 1867a29bf1243f5850ccebdeaf58466325c3c8a13be7a057f3063edc1ff0c144`

Valid networks: `mainnet`, `testnet-preprod`, `testnet-preview`.

## Instructions

Run exactly this command from the repo root, passing `$ARGUMENTS` through verbatim:

```bash
cd apps/example && pnpm tsx src/tx-info.ts $ARGUMENTS
```

The script reads `CARDANOSCAN_API_KEY` from the environment. If it's missing, the script throws an invariant error — surface that to the user and suggest setting `CARDANOSCAN_API_KEY`. Cardanoscan sits behind Cloudflare and can return HTTP 403 from unfamiliar networks; if you see a Cloudflare HTML response, tell the user the request was blocked and that they may need to retry from a different network.

Do not modify or re-interpret the arguments. Print the command's stdout back to the user.
