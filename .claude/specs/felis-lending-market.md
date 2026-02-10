# @minswap/felis-lending-market

Liqwid Finance lending protocol integration. Depends on `felis-ledger-core`, `felis-ledger-utils`.

**Location:** `packages/minswap-lending-market`

## LiqwidProviderV2 — Liqwid GraphQL API Client

Type-safe namespace wrapping the Liqwid Finance V2 GraphQL API. All functions return `Result<T, Error>`.

### Configuration
```typescript
type ApiConfig = {
  networkEnv: NetworkEnvironment;
  clientEndpoint?: string;  // Browser proxy override
}

// API endpoints:
// MAINNET:  "https://v2.api.liqwid.finance/graphql"
// PREPROD:  "https://v2.api.preprod.liqwid.dev/graphql"
// PREVIEW:  "https://v2.api.preview.liqwid.dev/graphql"

const config = LiqwidProviderV2.createConfig(NetworkEnvironment.MAINNET);
```

### Common Types
```typescript
type MarketId = "Ada" | "MIN" | "DJED" | "iUSD" | "SHEN" | "LQ" | "HUNT" | "WMT" | "LENFI" | "NIGHT"
type CollateralId = `${MarketId}.${string}`  // e.g. "Ada.policyId..."
type Currency = "EUR" | "USD" | "GBP" | "CAD" | "BRL" | "JPY" | "VND" | "CZK" | "AUD" | "SGD" | "CHF"
type SupportedWallet = "ETERNL" | "BEGIN"

type UserAddressInput = {
  address: string; changeAddress?: string;
  otherAddresses?: string[]; utxos: string[];
}

type BorrowCollateralInput = { id: string; tokenName?: string; amount: number }

type Pagination<T> = {
  page: number; perPage: number;
  pagesCount: number; totalCount: number;
  results: T[];
}
```

### Transactions Namespace
Builds unsigned transaction CBOR via GraphQL. Returns `Result<string, Error>` (CBOR hex).

```typescript
namespace Transactions {
  // Supply tokens to a lending market
  supply(config, input: SupplyTransactionInput): Promise<Result<string, Error>>
  // SupplyTransactionInput = UserAddressInput & { marketId, amount, wallet?, mintedQTokensDestination? }

  // Withdraw tokens from a lending market
  withdraw(config, input: WithdrawTransactionInput): Promise<Result<string, Error>>
  // WithdrawTransactionInput = UserAddressInput & { marketId, amount, wallet?, withdrawnUnderlyingDestination? }

  // Borrow against collateral (creates new loan)
  borrow(config, input: BorrowTransactionInput): Promise<Result<string, Error>>
  // BorrowTransactionInput = UserAddressInput & { marketId, amount, collaterals[], principalDestination? }

  // Modify existing loan (borrow more or partial repay)
  modifyBorrow(config, input: ModifyBorrowTransactionInput): Promise<Result<string, Error>>
  // ModifyBorrowTransactionInput = UserAddressInput & { txId, amount, collaterals[], redeemCollateral? }

  // Full repay loan (internally calls modifyBorrow with amount=0)
  repayLoan(config, input: RepayLoanTransactionInput): Promise<Result<string, Error>>
  // RepayLoanTransactionInput = UserAddressInput & { loanUtxoId: "{txHash}-{outputIndex}", collaterals[] }

  // Submit signed transaction to Liqwid
  submit(config, input: { transaction: string; signature: string }): Promise<Result<string, Error>>
}
```

### Calculations Namespace
Pre-flight calculations for fee estimation and health factors.

```typescript
namespace Calculations {
  loan(config, input: LoanCalculationInput, currency?): Promise<Result<LoanCalculationResult, Error>>
  // Input: { market: MarketId, debt: number, collaterals: [{id, amount}] }
  // Result: { healthFactor, maxBorrow, maxBorrowCap, batchingFee, protocolFee,
  //           protocolFeePercentage, collateral, collaterals: [{id, amount, LTV, healthFactor}] }

  supply(config, input: SupplyCalculationInput): Promise<Result<SupplyCalculationResult, Error>>
  // Input: { marketId, amount, wallet? }
  // Result: { batchingFee, supplyCap, walletFee }

  withdraw(config, input: WithdrawCalculationInput): Promise<Result<WithdrawCalculationResult, Error>>
  // Input: { marketId, amount, wallet? }
  // Result: { batchingFee, walletFee, withdrawCap }

  netApy(config, input: NetApyInput): Promise<Result<NetApyResult, Error>>
  // Input: { paymentKeys[], supplies: [{marketId, amount}], currency? }
  // Result: { netApy, netApyLqRewards, borrowApy, totalBorrow, supplyApy, totalSupply }
}
```

### Data Namespace
Query market and loan data.

```typescript
namespace Data {
  markets(config, input?: MarketsInput, currency?): Promise<Result<Pagination<Market>, Error>>
  // Market: { id, displayName, symbol, supply, borrow, liquidity, supplyAPY, borrowAPY,
  //           lqSupplyAPY, utilization, exchangeRate, batching, frozen, private, delisting,
  //           prime, loanOriginationFeePercentage, asset: Asset, receiptAsset: Asset }

  loans(config, input: LoansInput, currency?): Promise<Result<Pagination<Loan>, Error>>
  // Loan: { id, transactionId, transactionIndex, marketId, publicKey, amount,
  //         adjustedAmount, collateral, interest, APY, LTV, healthFactor, time,
  //         collaterals: LoanCollateral[], market: Market, asset: Asset }

  yieldEarned(config, input: YieldEarnedInput, currency?): Promise<Result<YieldEarnedResult, Error>>
  // Input: { addresses[], date?: { startTime, endTime } }

  market(config, marketId: MarketId, currency?): Promise<Result<Market | null, Error>>
  loansForUser(config, paymentKeys: string[], currency?): Promise<Result<Loan[], Error>>
}
```

### Utilities
```typescript
// Get tx hash from CBOR-encoded transaction (blake2b256 of body)
getTxHash(txCborHex: string): string

// Sign Liqwid transaction with private key, returns witness set hex
signTx(txCborHex: string, privateKey: PrivateKey): string

// Create API config helper
createConfig(networkEnv: NetworkEnvironment, clientEndpoint?: string): ApiConfig
```

## Usage Example
```typescript
import { LiqwidProviderV2 } from "@minswap/felis-lending-market";

const config = LiqwidProviderV2.createConfig(NetworkEnvironment.MAINNET);

// Supply ADA to lending market
const txResult = await LiqwidProviderV2.Transactions.supply(config, {
  address: "addr1...",
  utxos: ["utxoCbor1", "utxoCbor2"],
  marketId: "Ada",
  amount: 100_000_000,
});

if (txResult.type === "ok") {
  const txCbor = txResult.value;
  const signature = LiqwidProviderV2.signTx(txCbor, privateKey);
  await LiqwidProviderV2.Transactions.submit(config, { transaction: txCbor, signature });
}

// Query user loans
const loansResult = await LiqwidProviderV2.Data.loansForUser(config, [paymentKeyHash]);

// Calculate borrow health factor
const calcResult = await LiqwidProviderV2.Calculations.loan(config, {
  market: "Ada",
  debt: 50_000_000,
  collaterals: [{ id: "Ada.policyId...", amount: 100 }],
});
```
