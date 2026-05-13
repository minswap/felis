# USDCx Bridge CLI

Demonstrates the full USDCx bridge flow: ETH ↔ ADA via Circle's xReserve protocol.

## Commands

### `info` — Print USDCx Configuration

Shows the USDCx asset details and API URLs for a given network.

```bash
pnpm usdcx info [--network <name>]
```

**Example:**
```bash
pnpm usdcx info --network testnet-preprod
```

**Output:**
```json
{
  "network": 1,
  "usdcx": {
    "policyId": "31dde3db98ad05feb688d4dbb146b3b6054e1246cbcef98c79b0bf66",
    "tokenName": "5553444378",
    "asset": "31dde3db98ad05feb688d4dbb146b3b6054e1246cbcef98c79b0bf66.5553444378"
  },
  "apis": {
    "sdkApiUrl": "https://a2-docker.preprod.usdcx.aws.iohkdev.io",
    "xReserveApiUrl": "https://xreserve-api-testnet.circle.com"
  }
}
```

---

### `deposit-args` — Convert Cardano Address to Deposit Arguments

Converts a Cardano bech32 address to viem `depositToRemote` arguments. Formats the remoteRecipient and hookData hex fields needed for xReserve.

```bash
pnpm usdcx deposit-args \
  --cardano-address <addr> \
  --eth-address <addr> \
  [--amount-usdc <amount>] \
  [--max-fee-usdc <amount>] \
  [--datum-hash <hash>] \
  [--local-token <address>]
```

**Parameters:**
- `--cardano-address`: Bech32 address (e.g., `addr_test1qz2...`)
- `--eth-address`: Ethereum recipient (e.g., `0x1234...`)
- `--amount-usdc`: Deposit amount in 6-decimal units (default: `100000000` = 100 USDC)
- `--max-fee-usdc`: Max fee in 6-decimal units (default: `10000000` = 10 USDC)
- `--datum-hash`: Optional 32-byte datum hash from `/store-datum` API
- `--local-token`: USDC contract address (default: testnet USDC)

**Example:**
```bash
pnpm usdcx deposit-args \
  --cardano-address "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp" \
  --eth-address "0x1234567890abcdef1234567890abcdef12345678"
```

**Output:**
```json
{
  "value": "100000000",
  "remoteDomain": 10004,
  "remoteRecipient": "0x000000019493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e",
  "localToken": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "maxFee": "10000000",
  "hookData": "0x0000...00"
}
```

Use these args with viem:
```typescript
const hash = await walletClient.writeContract({
  address: XRESERVE_ADDRESS,
  abi: XRESERVE_ABI,
  functionName: "depositToRemote",
  args: [
    depositArgs.value,
    depositArgs.remoteDomain,
    depositArgs.remoteRecipient,
    depositArgs.localToken,
    depositArgs.maxFee,
    depositArgs.hookData,
  ],
});
```

---

### `prepare-withdrawal` — Call Circle API for Burn Intent

Calls Circle's xReserve API to get a burn intent. This is a Circle-signed payload that authorizes withdrawing USDC on Ethereum after USDCx is burned on Cardano.

```bash
pnpm usdcx prepare-withdrawal \
  --network <name> \
  --cardano-address <addr> \
  --eth-address <addr> \
  [--amount <decimal>]
```

**Parameters:**
- `--network`: Network name (mainnet, testnet-preprod, testnet-preview; default: testnet-preprod)
- `--cardano-address`: Bech32 address that will burn USDCx
- `--eth-address`: Ethereum address to receive USDC
- `--amount`: Amount to withdraw in decimal USDC (default: `"100"`)

**Example:**
```bash
pnpm usdcx prepare-withdrawal \
  --network testnet-preprod \
  --cardano-address "addr_test1qz2..." \
  --eth-address "0x1234..." \
  --amount 100
```

**Output:**
```json
{
  "burnIntentHex": "070afbc2...",
  "messageHashToSign": "abc123..."
}
```

The `burnIntentHex` is then embedded as the redeemer in your Cardano burn transaction.

---

### `build-burn-tx` — Build Cardano Burn Transaction

Demonstrates how to use `USDCxBurnTx.build()` to construct a Cardano burn transaction. Fetches UTxOs from Kupo.

```bash
pnpm usdcx build-burn-tx \
  --network <name> \
  --cardano-address <addr> \
  --burn-intent <hex> \
  [--burn-amount <lovelace>]
```

**Parameters:**
- `--network`: Network name (default: testnet-preprod)
- `--cardano-address`: Bech32 address to burn from
- `--burn-intent`: Hex-encoded burn intent from `prepare-withdrawal`
- `--burn-amount`: Amount to burn (default: `100000000`)

**Example:**
```bash
pnpm usdcx build-burn-tx \
  --cardano-address "addr_test1qz2..." \
  --burn-intent "070afbc2..."
```

**Output:**
```json
{
  "note": "Build Burn TX example - use USDCxBurnTx.build() to construct transaction",
  "usage": "Fetch protocol params UTxO on-chain, then call USDCxBurnTx.build()",
  "parameters": {
    ...
  }
}
```

**To implement in your application:**

1. Fetch the USDCx protocol params UTxO from on-chain
2. Parse it with `USDCXProtocolParams.fromUtxo(utxo, networkEnv)`
3. Call `USDCxBurnTx.build(options)` with:
   - `txb`: TxBuilder instance
   - `networkEnv`: NetworkEnvironment
   - `senderAddress`: Address
   - `walletUtxos`: ADA UTxOs for fees
   - `usdcxUtxos`: UTxOs holding USDCx
   - `protocolParamsUtxo`: Protocol params NFT UTxO
   - `burnIntentHex`: From `prepare-withdrawal`
   - `burnAmount`: Total to burn

---

### `register-withdrawal` — Register Burn TX with SDK API

Calls the USDCx SDK API to register the burn transaction. This step is required for operators to know which burn tx to process and to release USDC on Ethereum.

```bash
pnpm usdcx register-withdrawal \
  --network <name> \
  --tx-hash <hash> \
  --cardano-address <addr>
```

**Parameters:**
- `--network`: Network name (default: testnet-preprod)
- `--tx-hash`: Hex-encoded Cardano burn transaction hash
- `--cardano-address`: Bech32 address that performed the burn

**Example:**
```bash
pnpm usdcx register-withdrawal \
  --network testnet-preprod \
  --tx-hash "abc123def456..." \
  --cardano-address "addr_test1qz2..."
```

**Output:**
```json
{
  "transactionHash": "abc123def456...",
  "status": "AWAITING_FINALITY"
}
```

---

## Full Withdrawal Flow

1. **Prepare withdrawal** (Circle API):
   ```bash
   pnpm usdcx prepare-withdrawal --cardano-address ... --eth-address ... --amount 100
   ```
   → Returns `burnIntentHex`

2. **Build and sign burn tx** (your wallet):
   - Use `USDCxBurnTx.build()` to construct the transaction
   - Sign with your payment key
   - Submit to Cardano network
   → Get `txHash`

3. **Register withdrawal** (SDK API):
   ```bash
   pnpm usdcx register-withdrawal --tx-hash ... --cardano-address ...
   ```
   → Withdrawal enters operator queue

4. **Wait for finality**:
   - Operators observe the burn
   - Collect signatures
   - USDC released on Ethereum (~20 minutes)

---

## Network Configuration

| Network | Preprod | Mainnet |
|---------|---------|---------|
| USDCx Policy | `31dde3db...` | `1f3aec8b...` |
| SDK API | `https://a2-docker.preprod.usdcx.aws.iohkdev.io` | `https://sdk.usdcx.aws.iohkdev.io` |
| xReserve API | `https://xreserve-api-testnet.circle.com` | `https://xreserve-api.circle.com` |

---

## Dependencies

The CLI uses:
- `@minswap/felis-usdcx` — Address conversion, API clients, transaction builder
- `@minswap/felis-provider` — Kupo service for fetching UTxOs
- `@minswap/felis-tx-builder` — Transaction building
- `@minswap/felis-ledger-core` — Core Cardano types
