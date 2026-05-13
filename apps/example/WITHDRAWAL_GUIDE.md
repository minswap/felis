# Complete USDCx Withdrawal Guide: Cardano Testnet → Ethereum Testnet

This guide walks through a **complete withdrawal** of USDCx from Cardano Testnet (Preprod) to USDC on Ethereum Testnet (Sepolia).

## Prerequisites

✅ **Have ready:**
- USDCx tokens on Cardano Testnet Preprod
- ADA for transaction fees (~2-5 ADA)
- A Cardano wallet with signing capability (e.g., CIP-30 compatible, or CLI tools)
- An Ethereum Testnet wallet to receive USDC on Sepolia
- This monorepo built: `pnpm build`

✅ **Network Details:**
- **Cardano**: Testnet Preprod
- **Ethereum**: Testnet Sepolia
- **USDCx Policy**: `31dde3db98ad05feb688d4dbb146b3b6054e1246cbcef98c79b0bf66`
- **USDCx Token Name**: `5553444378` (hex for "USDCx")

---

## Step 1: Check USDCx Configuration

Verify the testnet configuration:

```bash
cd apps/example
pnpm usdcx info --network testnet-preprod
```

**Expected output:**
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

## Step 2: Prepare Withdrawal (Get Burn Intent from Circle)

Call the Circle xReserve API to get a **burn intent** — this is the authorization payload you'll embed in your Cardano burn transaction.

```bash
pnpm usdcx prepare-withdrawal \
  --network testnet-preprod \
  --cardano-address "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp" \
  --eth-address "0x1234567890abcdef1234567890abcdef12345678" \
  --amount 100
```

**Replace with your addresses:**
- `--cardano-address`: Your Cardano Testnet Preprod address (starts with `addr_test1q`)
- `--eth-address`: Your Ethereum Sepolia address (starts with `0x`)
- `--amount`: Amount of USDC to receive on Ethereum (e.g., `100` for 100 USDC)

**Expected output:**
```json
{
  "burnIntentHex": "070afbc2a1b2c3d4e5f6...",
  "messageHashToSign": "abc123def456..."
}
```

**Save the `burnIntentHex`** — you'll need it in the next step.

---

## Step 3: Build, Sign, and Submit Burn Transaction on Cardano

This is where you construct and submit the actual Cardano transaction that **burns USDCx**.

### Option A: Using Cardano CLI (Most Direct)

#### 3A.1 Fetch Protocol Parameters UTxO

The protocol parameters NFT must be a reference input in your transaction. Find it on-chain:

```bash
# Using Kupo (if you have it running locally)
curl "http://localhost:1442/matches?addresses=addr_test1wz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer9d3jd7?unspent&order_by=created_at.desc&limit=1" | jq
```

Or use **Blockfrost API**:
```bash
curl -H "project_id: YOUR_BLOCKFROST_KEY" \
  "https://cardano-preprod.blockfrost.io/api/v0/addresses/addr_test1wz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer9d3jd7/utxos" | jq
```

Look for the UTxO with the **USDCXProtocolParameters NFT**:
- Policy: `31dde3db98ad05feb688d4dbb146b3b6054e1246cbcef98c79b0bf66`
- Token Name: `USDCXProtocolParameters`

Save as `protocol-params.utxo` in CBOR format.

#### 3A.2 Query Your UTxOs

Find your USDCx and ADA UTxOs:

```bash
cardano-cli query utxo \
  --address "addr_test1qz2..." \
  --testnet-magic 1 \
  --out-file my-utxos.json
```

**Identify:**
- USDCx UTXO(s) to spend
- ADA UTXO(s) for fees and change

#### 3A.3 Build the Burn Transaction

Create `burn-tx.json`:

```json
{
  "txIn": [
    {
      "txId": "<your-usdcx-utxo-hash>",
      "index": 0
    },
    {
      "txId": "<your-ada-utxo-hash>",
      "index": 0
    }
  ],
  "txOut": [
    {
      "address": "addr_test1qz2...",
      "amount": {
        "lovelace": 5000000
      }
    }
  ],
  "mint": {
    "31dde3db98ad05feb688d4dbb146b3b6054e1246cbcef98c79b0bf66.5553444378": -100000000
  },
  "withdrawal": {
    "addr_test1uy2z0d9n88kh0kqw4f95jt6k39ghd4vf3g5v0aypjffg2qy8kzhg9": 0
  },
  "requiredSigners": [
    "<your-payment-key-hash>"
  ],
  "witnessCount": 2
}
```

**Key points:**
- `mint`: Negative quantity = burn. Must be exactly 100000000 for 100 USDCX
- `withdrawal`: Reference the USDCx minting logic stake address with 0 lovelace
- `redeemer`: Must be `BurnUSDCX(burnIntentHex)` in CBOR format

#### 3A.4 Encode the Redeemer

The redeemer is a Plutus data structure:
- Constructor 1 (Burn)
- Field: BuiltinByteString of the burn intent hex

Using `cardano-cli`:

```bash
# First, convert hex to CBOR
echo "070afbc2a1b2c3d4e5f6..." | xxd -r -p > burn-intent.bin

# Encode redeemer (constructor 1 with bytestring field)
# Use cborenc or similar tool, or manually construct:
# D8799F <hex-of-bytestring-field> FF
```

Or use a script to encode via the felis library:

```typescript
import { PlutusBytes, PlutusData } from "@minswap/felis-ledger-core";
import { Bytes } from "@minswap/felis-ledger-core";

const burnIntentHex = "070afbc2...";
const redeemer = {
  constructor: 1,
  fields: [PlutusBytes.wrap(Bytes.fromHex(burnIntentHex))],
};
const redeemerHex = PlutusData.toDataHex(redeemer);
console.log(redeemerHex);
```

#### 3A.5 Complete and Submit

```bash
cardano-cli transaction build \
  --testnet-magic 1 \
  --tx-in <utxo-hash>#<index> \
  --tx-out addr_test1qz2...:5000000 \
  --mint "-100000000 31dde3db98ad05feb688d4dbb146b3b6054e1246cbcef98c79b0bf66.5553444378" \
  --withdrawal "addr_test1uy2z0d9n88kh0kqw4f95jt6k39ghd4vf3g5v0aypjffg2qy8kzhg9:0" \
  --read-only-tx-in-reference <protocol-params-utxo> \
  --required-signer <payment-key-hash> \
  --protocol-params-file protocol.json \
  --out-file burn-tx.unsigned

cardano-cli transaction sign \
  --testnet-magic 1 \
  --tx-body-file burn-tx.unsigned \
  --signing-key-file payment.skey \
  --out-file burn-tx.signed

cardano-cli transaction submit \
  --testnet-magic 1 \
  --tx-file burn-tx.signed
```

**Save the transaction hash** — you'll need it in Step 4.

### Option B: Using lucid-evolution (Recommended for Dapps)

```typescript
import { Lucid, Blockfrost } from "lucid-evolution";

const lucid = await Lucid.new(
  new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", "YOUR_KEY"),
  "Preprod"
);

lucid.selectWallet.fromSeed(seed);

const utxos = await lucid.wallet.getUtxos();
const usdcxUtxos = utxos.filter(u =>
  u.assets["31dde3db98ad05feb688d4dbb146b3b6054e1246cbcef98c79b0bf66.5553444378"]
);

// Build burn transaction
const tx = await lucid
  .newTx()
  .collectFrom(usdcxUtxos)
  .collectFrom([adaUtxo]) // for fees
  .addSigner(address)
  .mintAssets({
    "31dde3db98ad05feb688d4dbb146b3b6054e1246cbcef98c79b0bf66.5553444378": -100000000n,
  }, redeemer)
  .withdraw(stakeAddress, 0n, burnRedeemer)
  .addReferenceInput(protocolParamsUtxo)
  .complete();

const signed = await tx.sign.withWallet().complete();
const txHash = await signed.submit();
console.log("Burn tx submitted:", txHash);
```

### Option C: Using the Felis TxBuilder (Programmatic)

```typescript
import { TxBuilder, EmulatorProvider, CoinSelectionAlgorithm } from "@minswap/felis-tx-builder";
import { USDCxBurnTx, USDCXProtocolParams } from "@minswap/felis-usdcx";
import { KupoService } from "@minswap/felis-provider";
import { Address, NetworkEnvironment } from "@minswap/felis-ledger-core";

const network = NetworkEnvironment.TESTNET_PREPROD;
const kupo = new KupoService("http://localhost:1442");
const senderAddress = Address.fromBech32("addr_test1qz2...");

// Fetch UTxOs
const utxos = await kupo.utxosByAddress([senderAddress]);
const usdcxUtxos = utxos.filter(u => u.output.value.get(config.usdcxAsset));
const adaUtxos = utxos.filter(u => !u.output.value.get(config.usdcxAsset));

// Fetch protocol params
const protocolParamsUtxo = utxos.find(u =>
  u.output.value.get(USDCxAsset)?.eq("USDCXProtocolParameters")
);
const protocolParams = USDCXProtocolParams.fromUtxo(protocolParamsUtxo, network);

// Build transaction
const txb = new TxBuilder(network);
const tx = USDCxBurnTx.build({
  txb,
  networkEnv: network,
  senderAddress,
  walletUtxos: adaUtxos,
  usdcxUtxos,
  protocolParamsUtxo,
  burnIntentHex: "070afbc2...", // from Step 2
  burnAmount: 100000000n,
});

// Complete, sign, and submit
const provider = new BlockfrostProvider("YOUR_KEY");
const completedTx = await tx
  .changeAddress(senderAddress)
  .select(CoinSelectionAlgorithm.MINSWAP)
  .build(provider);

const signedTx = await wallet.signTx(completedTx);
const txHash = await provider.submitTx(signedTx);
console.log("Burn tx hash:", txHash);
```

---

## Step 4: Register Withdrawal with SDK API

Once your burn transaction is **confirmed on-chain** (wait 1-2 minutes), register it with the USDCx SDK:

```bash
pnpm usdcx register-withdrawal \
  --network testnet-preprod \
  --tx-hash "abc123def456..." \
  --cardano-address "addr_test1qz2..."
```

**Replace with:**
- `--tx-hash`: Your burn transaction hash from Step 3
- `--cardano-address`: Your Cardano address

**Expected output:**
```json
{
  "transactionHash": "abc123def456...",
  "status": "AWAITING_FINALITY"
}
```

**Status progression:**
```
AWAITING_FINALITY
  ↓
AWAITING_ASSIGNED_SIGNER
  ↓
AWAITING_ADDITIONAL_SIGNER
  ↓
READY_FOR_CIRCLE_WITHDRAWAL
  ↓
CIRCLE_WITHDRAWAL_SUBMITTED
  ↓
CIRCLE_WITHDRAWAL_CONFIRMED
  ↓
CIRCLE_WITHDRAWAL_FINALIZED  ← USDC arrives on Sepolia!
```

You can check status by calling the SDK API directly:

```bash
curl https://a2-docker.preprod.usdcx.aws.iohkdev.io/register-withdrawal \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "transactionHash": "abc123...",
    "localAddress": "addr_test1qz2..."
  }'
```

---

## Step 5: Wait for USDC to Arrive on Sepolia

The full flow takes approximately **20-30 minutes**:

1. **Cardano finality**: ~2 minutes (1 confirmation)
2. **Operator processing**: ~5-10 minutes
3. **Circle withdrawal**: ~10-15 minutes

**Monitor the Ethereum side:**

```bash
# Check USDC balance on Sepolia
etherscan.io/address/0x1234...?chain=sepolia
```

Or via Web3:
```typescript
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

const client = createPublicClient({
  chain: sepolia,
  transport: http(),
});

const balance = await client.readContract({
  address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC on Sepolia
  abi: ERC20_ABI,
  functionName: "balanceOf",
  args: ["0x1234..."],
});

console.log("USDC balance:", balance);
```

---

## Troubleshooting

### Burn Transaction Fails

**Problem**: Transaction doesn't execute on-chain
- **Check**: Protocol params UTxO exists and is correctly referenced
- **Check**: Burn amount matches exactly (no off-by-one errors)
- **Check**: Witness redeemer is valid CBOR format
- **Check**: Required signers list includes your payment key hash

**Solution**: Use Kupo or Blockfrost to fetch fresh protocol params:
```bash
curl -H "project_id: KEY" \
  "https://cardano-preprod.blockfrost.io/api/v0/addresses/addr_test1wz2.../utxos" | jq '.[0] | @base64'
```

### Register-Withdrawal Returns 404

**Problem**: SDK API can't find your burn tx
- **Reason**: Tx hasn't confirmed yet (wait 1-2 minutes)
- **Reason**: Tx hash format is wrong (must be hex without `0x`)

**Solution**: Wait longer, verify hash:
```bash
cardano-cli query tx-body --tx-body-file burn-tx.signed | jq '.id'
```

### USDC Never Arrives

**Problem**: Withdrawal status stuck on `AWAITING_ASSIGNED_SIGNER`
- **Reason**: Circle operators haven't picked up the withdrawal yet
- **Reason**: Burn intent is invalid or expired

**Solution**: Wait 1-2 hours, then check Circle's status:
```bash
curl https://a2-docker.preprod.usdcx.aws.iohkdev.io/register-withdrawal \
  -X POST \
  -d '{"transactionHash":"...","localAddress":"..."}'
```

If `status` is `CIRCLE_WITHDRAWAL_FAILED`:
- Get a new burn intent and retry with same Cardano UTxOs
- Contact Circle support with tx hash

---

## Complete Example Script

```bash
#!/bin/bash

# Configuration
CARDANO_ADDR="addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp"
ETH_ADDR="0x1234567890abcdef1234567890abcdef12345678"
AMOUNT="100"
NETWORK="testnet-preprod"

echo "=== Step 1: Check config ==="
pnpm usdcx info --network $NETWORK

echo ""
echo "=== Step 2: Prepare withdrawal ==="
RESULT=$(pnpm usdcx prepare-withdrawal \
  --network $NETWORK \
  --cardano-address "$CARDANO_ADDR" \
  --eth-address "$ETH_ADDR" \
  --amount "$AMOUNT")

BURN_INTENT=$(echo $RESULT | jq -r '.burnIntentHex')
echo "Burn intent: $BURN_INTENT"

echo ""
echo "=== Step 3: Build and submit burn tx ==="
echo "Use cardano-cli or lucid with burn intent: $BURN_INTENT"
echo "Save the tx hash"

read -p "Enter burn tx hash: " TX_HASH

echo ""
echo "=== Step 4: Wait for on-chain confirmation ==="
echo "Waiting 2 minutes..."
sleep 120

echo ""
echo "=== Step 5: Register withdrawal ==="
pnpm usdcx register-withdrawal \
  --network $NETWORK \
  --tx-hash "$TX_HASH" \
  --cardano-address "$CARDANO_ADDR"

echo ""
echo "=== Step 6: Wait for USDC ==="
echo "Checking every 60 seconds..."
for i in {1..30}; do
  STATUS=$(pnpm usdcx register-withdrawal \
    --network $NETWORK \
    --tx-hash "$TX_HASH" \
    --cardano-address "$CARDANO_ADDR" | jq -r '.status')
  
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "CIRCLE_WITHDRAWAL_FINALIZED" ]; then
    echo "✅ USDC transferred! Check your Sepolia wallet"
    exit 0
  fi
  
  if [[ "$STATUS" == *"FAILED"* ]] || [[ "$STATUS" == *"EXPIRED"* ]]; then
    echo "❌ Withdrawal failed: $STATUS"
    exit 1
  fi
  
  sleep 60
done

echo "⏱️  Withdrawal still processing. Check status manually or wait longer."
```

---

## FAQ

**Q: How long does a withdrawal take?**
A: 20-30 minutes total. Cardano finality (2 min) + operator processing (5-10 min) + Circle (10-15 min).

**Q: Can I cancel a withdrawal in progress?**
A: No. Once the burn tx is submitted, it can't be reverted. You must complete the withdrawal flow.

**Q: What if the burn intent expires?**
A: Burn intents are valid for ~1 hour. If you exceed that, get a new one from Step 2 and rebuild the transaction.

**Q: Do I need to pay twice (Cardano + Ethereum fees)?**
A: Yes. You pay ADA fees for the burn tx on Cardano, and Circle deducts the `maxFee` from your withdrawal on Ethereum.

**Q: What's the minimum withdrawal amount?**
A: Protocol minimum is stored on-chain. Typically 1-10 USDC depending on configuration.

---

## See Also

- [USDCx CLI Documentation](./USDCX_CLI.md)
- [Integration Guide](../../contracts/usdcx-contracts/IntegrationGuide.md)
- [USDCx Package Docs](../../packages/usdcx/)
