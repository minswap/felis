---
description: Fetch a Cardano transaction CBOR from Maestro and print the parsed ECSL JSON
argument-hint: <mainnet|testnet-preprod|testnet-preview> <txHash>
allowed-tools: [Bash]
---

# /tx-info

Runs the script at [apps/example/src/tx-info.ts](apps/example/src/tx-info.ts) to fetch a transaction from Maestro and print its decoded JSON.

## Arguments

`$ARGUMENTS` = `<network> <txHash>`, e.g. `mainnet 1867a29bf1243f5850ccebdeaf58466325c3c8a13be7a057f3063edc1ff0c144`

Valid networks: `mainnet`, `testnet-preprod`, `testnet-preview`.

## Instructions

Run exactly this command from the repo root, passing `$ARGUMENTS` through verbatim:

```bash
cd apps/example && pnpm tsx src/tx-info.ts $ARGUMENTS
```

The script reads `MAESTRO_MAINNET_KEY` / `MAESTRO_PREPROD_KEY` / `MAESTRO_PREVIEW_KEY` from the environment depending on the network. If the corresponding env var is missing, the Maestro fetch returns `{"message": "..."}` rather than `{"data": "..."}` and `ECSL.Transaction.from_hex` will throw — surface that error to the user and suggest setting the right env var.

Do not modify or re-interpret the arguments. Print the command's stdout back to the user.
