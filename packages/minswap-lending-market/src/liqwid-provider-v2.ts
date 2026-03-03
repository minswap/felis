import { NetworkEnvironment, type PrivateKey, XJSON } from "@minswap/felis-ledger-core";
import { blake2b256, Result, RustModule } from "@minswap/felis-ledger-utils";
import * as cbor from "cbor";

/**
 * Liqwid Protocol Provider V2
 *
 * A cleaner, more type-safe implementation for interacting with the Liqwid Finance API.
 * Based on the Liqwid GraphQL schema.
 */
export namespace LiqwidProviderV2 {
  // ============================================================================
  // Common Types
  // ============================================================================

  export type Currency = "EUR" | "USD" | "GBP" | "CAD" | "BRL" | "JPY" | "VND" | "CZK" | "AUD" | "SGD" | "CHF";

  export type SupportedWallet = "ETERNL" | "BEGIN";

  export type Network = "MAINNET" | "PREVIEW";

  /** Market IDs for different assets */
  export type MarketId = "Ada" | "MIN" | "DJED" | "iUSD" | "SHEN" | "LQ" | "HUNT" | "WMT" | "LENFI" | "NIGHT";

  /** Collateral market identifiers (format: MarketId.PolicyId) */
  export type CollateralId = `${MarketId}.${string}`;

  // ============================================================================
  // API Configuration
  // ============================================================================

  const API_URLS: Record<NetworkEnvironment, string> = {
    [NetworkEnvironment.MAINNET]: "https://v2.api.liqwid.finance/graphql",
    [NetworkEnvironment.TESTNET_PREPROD]: "https://v2.api.preprod.liqwid.dev/graphql",
    [NetworkEnvironment.TESTNET_PREVIEW]: "https://v2.api.preview.liqwid.dev/graphql",
  };

  export type ApiConfig = {
    networkEnv: NetworkEnvironment;
    /** Optional client-side endpoint override (for browser proxying) */
    clientEndpoint?: string;
  };

  // ============================================================================
  // GraphQL Types - Inputs
  // ============================================================================

  export type UserAddressInput = {
    address: string;
    changeAddress?: string;
    otherAddresses?: string[];
    utxos: string[];
  };

  export type CustomOutput = {
    address: string;
    inlineDatum?: string;
  };

  export type InCurrencyInput = {
    currency?: Currency;
  };

  // Transaction Inputs
  export type SupplyTransactionInput = UserAddressInput & {
    marketId: MarketId;
    amount: number;
    wallet?: SupportedWallet;
    mintedQTokensDestination?: CustomOutput;
  };

  export type WithdrawTransactionInput = UserAddressInput & {
    marketId: MarketId;
    amount: number;
    wallet?: SupportedWallet;
    withdrawnUnderlyingDestination?: CustomOutput;
  };

  export type BorrowCollateralInput = {
    id: string;
    tokenName?: string;
    amount: number;
  };

  export type BorrowTransactionInput = UserAddressInput & {
    marketId: MarketId;
    amount: number;
    collaterals: BorrowCollateralInput[];
    principalDestination?: CustomOutput;
  };

  export type ModifyBorrowTransactionInput = UserAddressInput & {
    txId: string;
    amount: number;
    collaterals: BorrowCollateralInput[];
    redeemCollateral?: boolean;
    loanPrincipalAndCollateralDeltasDestination?: CustomOutput;
  };

  /**
   * Input for repaying a loan (full repay)
   * Based on Liqwid's GetRepayTransactionInput
   */
  export type RepayLoanTransactionInput = UserAddressInput & {
    /** Loan transaction ID with output index, format: "{txHash}-{outputIndex}" */
    loanUtxoId: string;
    /** Collaterals to redeem after repaying, format: [{id: "MarketId.policyId", amount: qTokenAmount}] */
    collaterals: BorrowCollateralInput[];
  };

  export type SubmitTransactionInput = {
    transaction: string;
    signature: string;
  };

  // Calculation Inputs
  export type LoanCalculationCollateralInput = {
    id: string;
    amount: number;
  };

  export type LoanCalculationInput = {
    market: MarketId;
    debt: number;
    collaterals: LoanCalculationCollateralInput[];
  };

  export type SupplyCalculationInput = {
    marketId: MarketId;
    amount: number;
    wallet?: SupportedWallet;
  };

  export type WithdrawCalculationInput = {
    marketId: MarketId;
    amount: number;
    wallet?: SupportedWallet;
  };

  export type NetApySupplyInput = {
    marketId: MarketId;
    amount: number;
  };

  export type NetApyInput = {
    paymentKeys: string[];
    supplies: NetApySupplyInput[];
    currency?: Currency;
  };

  // Query Inputs
  export type LoansInput = {
    paymentKeys?: string[];
    marketIds?: string[];
    sorts?: LoanSort[];
    filters?: LoanFilter[];
    page?: number;
    perPage?: number;
    search?: string;
  };

  export type MarketsInput = {
    ids?: string[];
    sorts?: MarketSort[];
    filters?: MarketFilter[];
    page?: number;
    perPage?: number;
    search?: string;
  };

  export type YieldEarnedInput = {
    addresses: string[];
    date?: {
      startTime: string;
      endTime: string;
    };
  };

  // ============================================================================
  // GraphQL Types - Enums
  // ============================================================================

  export type LoanSort =
    | "MARKET_ID"
    | "MARKET_ID_DESC"
    | "DEBT"
    | "DEBT_DESC"
    | "COLLATERAL_IN_CURRENCY"
    | "COLLATERAL_IN_CURRENCY_DESC"
    | "HEALTH_FACTOR"
    | "HEALTH_FACTOR_DESC"
    | "APY"
    | "APY_DESC";

  export type LoanFilter =
    | "STABLECOIN"
    | "CNT"
    | "BRIDGED"
    | "PRIME"
    | "HAS_DEBT"
    | "NO_DEBT"
    | "HAS_COLLATERAL"
    | "NO_COLLATERAL"
    | "CAN_BE_LIQUIDATED";

  export type MarketSort =
    | "ID"
    | "ID_DESC"
    | "SUPPLY"
    | "SUPPLY_DESC"
    | "SUPPLY_IN_CURRENCY"
    | "SUPPLY_IN_CURRENCY_DESC"
    | "BORROW"
    | "BORROW_DESC"
    | "BORROW_IN_CURRENCY"
    | "BORROW_IN_CURRENCY_DESC"
    | "LIQUIDITY"
    | "LIQUIDITY_DESC"
    | "LIQUIDITY_IN_CURRENCY"
    | "LIQUIDITY_IN_CURRENCY_DESC"
    | "SUPPLY_APY"
    | "SUPPLY_APY_DESC"
    | "BORROW_APY"
    | "BORROW_APY_DESC";

  export type MarketFilter = "STABLECOIN" | "CNT" | "BRIDGED" | "PRIME" | "PUBLIC" | "PRIVATE";

  // ============================================================================
  // GraphQL Types - Outputs
  // ============================================================================

  export type Transaction = {
    cbor: string;
  };

  // Calculation Results
  export type LoanCalculationResult = {
    healthFactor: number;
    maxBorrow: number;
    maxBorrowCap: number | null;
    batchingFee: number;
    protocolFee: number;
    protocolFeePercentage: number;
    collateral: number;
    collaterals: Array<{
      id: string;
      amount: number;
      LTV: number;
      healthFactor: number;
    }>;
  };

  export type SupplyCalculationResult = {
    batchingFee: number;
    supplyCap: number | null;
    walletFee: number;
  };

  export type WithdrawCalculationResult = {
    batchingFee: number;
    walletFee: number;
    withdrawCap: number;
  };

  export type NetApyResult = {
    netApy: number;
    netApyLqRewards: number;
    borrowApy: number;
    totalBorrow: number;
    supplyApy: number;
    totalSupply: number;
  };

  // Data Types
  export type Asset = {
    id: string;
    name: string;
    symbol: string;
    displayName: string;
    decimals: number;
    currencySymbol: string;
    policyId: string;
    hexName: string;
    logo: string | null;
    price: number;
    priceUpdatedAt: string;
  };

  export type Market = {
    id: string;
    displayName: string;
    symbol: string;
    supply: number;
    borrow: number;
    liquidity: number;
    supplyAPY: number;
    borrowAPY: number;
    lqSupplyAPY: number;
    utilization: number;
    exchangeRate: number;
    batching: boolean;
    batchExpired: boolean;
    frozen: boolean;
    private: boolean;
    delisting: boolean;
    prime: boolean;
    loanOriginationFeePercentage: number;
    parameters: MarketParameters;
    asset: Asset;
    receiptAsset: Asset;
  };

  export type LoanCollateral = {
    id: string;
    tokenName: string | null;
    qTokenName: string | null;
    amount: number;
    qTokenAmount: number;
    LTV: number;
    healthFactor: number;
    market: {
      id: string;
      displayName: string;
      exchangeRate: number;
      delisting: boolean;
    } | null;
    asset: Asset;
  };

  export type Loan = {
    id: string;
    transactionId: string;
    transactionIndex: number;
    marketId: string;
    publicKey: string;
    amount: number;
    adjustedAmount: number;
    collateral: number;
    interest: number;
    APY: number;
    LTV: number;
    healthFactor: number;
    time: number;
    collaterals: LoanCollateral[];
    market: Market;
    asset: Asset;
  };

  export type MarketCollateralParameter = {
    id: string;
    maxLoanToValue: number;
    weightedMaxLoanToValue: number;
    liquidationThreshold: number;
    weightedLiquidationThreshold: number;
    liquidationPenalty: number | null;
    liquidationProfitability: number | null;
    collateralWeight: number | null;
    collateral: {
      id: string;
      displayName: string;
      symbol: string;
      name: string;
    };
  };

  export type MarketIncomeParameters = {
    /** Protocol reserve share */
    reserve: number;
    supplier: number;
    staker: number;
    /** DAO treasury share */
    treasury: number;
  };

  export type MarketInterestModelParameters = {
    baseRate: number | null;
    kinkRate: number | null;
    utilMultiplier: number | null;
    utilMultiplierJump: number | null;
  };

  export type MarketParameters = {
    id: string;
    borrowCap: number | null;
    supplyCap: number | null;
    /** Minimum amount required for each action (supply/borrow/withdraw) */
    minValue: number;
    minHealthFactor: number;
    actionCount: number;
    maxCollateralCount: number;
    maxBatchTime: number;
    minBatchSize: number;
    minBatchTime: number;
    collateralParameters: MarketCollateralParameter[] | null;
    incomeParameters: MarketIncomeParameters;
    interestModelParameters: MarketInterestModelParameters;
  };

  export type YieldEarnedMarket = {
    id: string;
    displayName: string;
    currencySymbol: string;
    hexName: string;
    amount: number;
    amountInCurrency: number;
  };

  export type YieldEarnedResult = {
    totalYieldEarned: number;
    markets: YieldEarnedMarket[];
  };

  // Pagination
  export type Pagination<T> = {
    page: number;
    perPage: number;
    pagesCount: number;
    totalCount: number;
    results: T[];
  };

  // ============================================================================
  // API Client
  // ============================================================================

  type GraphQLResponse<T> = {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  const getApiUrl = (config: ApiConfig): string => {
    if (typeof window !== "undefined" && config.clientEndpoint) {
      return config.clientEndpoint;
    }
    return API_URLS[config.networkEnv];
  };

  const executeQuery = async <TData, TVariables>(
    config: ApiConfig,
    operationName: string,
    query: string,
    variables: TVariables,
  ): Promise<Result<TData, Error>> => {
    try {
      const requestBody = JSON.stringify({ operationName, query, variables });
      console.log(
        `[LiqwidProviderV2] ${operationName} curl:\ncurl '${getApiUrl(config)}' \\\n  -H 'content-type: application/json' \\\n  --data-raw '${requestBody}'`,
      );

      const response = await fetch(getApiUrl(config), {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: requestBody,
      });

      if (!response.ok) {
        return Result.err(new Error(`Liqwid API error: ${response.status} ${response.statusText}`));
      }

      const json = (await response.json()) as GraphQLResponse<TData>;
      // console.log(`[LiqwidProviderV2] ${operationName} response:`, JSON.stringify(json));

      if (json.errors?.length) {
        return Result.err(new Error(`GraphQL error: ${XJSON.stringify(json.errors)}`));
      }

      if (!json.data) {
        return Result.err(new Error("No data returned from Liqwid API"));
      }

      return Result.ok(json.data);
    } catch (error) {
      return Result.err(
        new Error(`${operationName} failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  };

  // ============================================================================
  // Transactions API
  // ============================================================================

  export namespace Transactions {
    const SUPPLY_QUERY = `
      query Supply($input: SupplyTransactionInput!) {
        liqwid { transactions { supply(input: $input) { cbor } } }
      }
    `;

    const WITHDRAW_QUERY = `
      query Withdraw($input: WithdrawTransactionInput!) {
        liqwid { transactions { withdraw(input: $input) { cbor } } }
      }
    `;

    const BORROW_QUERY = `
      query Borrow($input: BorrowTransactionInput!) {
        liqwid { transactions { borrow(input: $input) { cbor } } }
      }
    `;

    const MODIFY_BORROW_QUERY = `
      query ModifyBorrow($input: ModifyBorrowTransactionInput!) {
        liqwid { transactions { modifyBorrow(input: $input) { cbor } } }
      }
    `;

    const SUBMIT_MUTATION = `
      mutation Submit($input: SubmitTransactionInput!) {
        submitTransaction(input: $input)
      }
    `;

    type SupplyResponse = { liqwid: { transactions: { supply: Transaction } } };
    type WithdrawResponse = { liqwid: { transactions: { withdraw: Transaction } } };
    type BorrowResponse = { liqwid: { transactions: { borrow: Transaction } } };
    type ModifyBorrowResponse = { liqwid: { transactions: { modifyBorrow: Transaction } } };
    type SubmitResponse = { submitTransaction: string };

    /** Build a supply transaction */
    export const supply = async (config: ApiConfig, input: SupplyTransactionInput): Promise<Result<string, Error>> => {
      const result = await executeQuery<SupplyResponse, { input: SupplyTransactionInput }>(
        config,
        "Supply",
        SUPPLY_QUERY,
        {
          input: {
            ...input,
            changeAddress: input.changeAddress ?? input.address,
            otherAddresses: input.otherAddresses ?? [input.address],
          },
        },
      );
      return result.type === "ok" ? Result.ok(result.value.liqwid.transactions.supply.cbor) : result;
    };

    /** Build a withdraw transaction */
    export const withdraw = async (
      config: ApiConfig,
      input: WithdrawTransactionInput,
    ): Promise<Result<string, Error>> => {
      const result = await executeQuery<WithdrawResponse, { input: WithdrawTransactionInput }>(
        config,
        "Withdraw",
        WITHDRAW_QUERY,
        {
          input: {
            ...input,
            changeAddress: input.changeAddress ?? input.address,
            otherAddresses: input.otherAddresses ?? [input.address],
          },
        },
      );
      return result.type === "ok" ? Result.ok(result.value.liqwid.transactions.withdraw.cbor) : result;
    };

    /** Build a borrow transaction */
    export const borrow = async (config: ApiConfig, input: BorrowTransactionInput): Promise<Result<string, Error>> => {
      const result = await executeQuery<BorrowResponse, { input: BorrowTransactionInput }>(
        config,
        "Borrow",
        BORROW_QUERY,
        {
          input: {
            ...input,
            changeAddress: input.changeAddress ?? input.address,
            otherAddresses: input.otherAddresses ?? [input.address],
          },
        },
      );
      return result.type === "ok" ? Result.ok(result.value.liqwid.transactions.borrow.cbor) : result;
    };

    /** Build a modify borrow (repay/borrow more) transaction */
    export const modifyBorrow = async (
      config: ApiConfig,
      input: ModifyBorrowTransactionInput,
    ): Promise<Result<string, Error>> => {
      const result = await executeQuery<ModifyBorrowResponse, { input: ModifyBorrowTransactionInput }>(
        config,
        "ModifyBorrow",
        MODIFY_BORROW_QUERY,
        {
          input: {
            ...input,
            changeAddress: input.changeAddress ?? input.address,
            otherAddresses: input.otherAddresses ?? [input.address],
          },
        },
      );
      return result.type === "ok" ? Result.ok(result.value.liqwid.transactions.modifyBorrow.cbor) : result;
    };

    /**
     * Build a repay loan transaction (full repay with collateral redemption)
     * Uses modifyBorrow internally with amount=0 to trigger full repay
     */
    export const repayLoan = async (
      config: ApiConfig,
      input: RepayLoanTransactionInput,
    ): Promise<Result<string, Error>> => {
      const modifyBorrowInput: ModifyBorrowTransactionInput = {
        address: input.address,
        changeAddress: input.changeAddress,
        otherAddresses: input.otherAddresses,
        utxos: input.utxos,
        txId: input.loanUtxoId,
        amount: 0, // Full repay
        collaterals: input.collaterals,
      };
      return modifyBorrow(config, modifyBorrowInput);
    };

    /**
     * Build a partial repay loan transaction (repay a fraction, not full repay)
     * Uses modifyBorrow internally with a specific amount (new desired debt level)
     */
    export const repayLoanFraction = async (
      config: ApiConfig,
      input: RepayLoanTransactionInput & { amount: number; redeemCollateral?: boolean },
    ): Promise<Result<string, Error>> => {
      const modifyBorrowInput: ModifyBorrowTransactionInput = {
        address: input.address,
        changeAddress: input.changeAddress,
        otherAddresses: input.otherAddresses,
        utxos: input.utxos,
        txId: input.loanUtxoId,
        amount: input.amount,
        collaterals: input.collaterals,
        redeemCollateral: input.redeemCollateral,
      };
      return modifyBorrow(config, modifyBorrowInput);
    };

    /** Submit a signed transaction */
    export const submit = async (config: ApiConfig, input: SubmitTransactionInput): Promise<Result<string, Error>> => {
      const result = await executeQuery<SubmitResponse, { input: SubmitTransactionInput }>(
        config,
        "Submit",
        SUBMIT_MUTATION,
        { input },
      );
      return result.type === "ok" ? Result.ok(result.value.submitTransaction) : result;
    };
  }

  // ============================================================================
  // Calculations API
  // ============================================================================

  export namespace Calculations {
    const LOAN_QUERY = `
      query LoanCalc($input: LoanCalculationInput!, $currency: InCurrencyInput) {
        liqwid {
          calculations {
            loan(input: $input) {
              healthFactor maxBorrow maxBorrowCap batchingFee
              protocolFee protocolFeePercentage
              collateral(input: $currency)
              collaterals { id amount LTV healthFactor }
            }
          }
        }
      }
    `;

    const SUPPLY_QUERY = `
      query SupplyCalc($input: SupplyCalculationInput!) {
        liqwid { calculations { supply(input: $input) { batchingFee supplyCap walletFee } } }
      }
    `;

    const WITHDRAW_QUERY = `
      query WithdrawCalc($input: WithdrawCalculationInput!) {
        liqwid { calculations { withdraw(input: $input) { batchingFee walletFee withdrawCap } } }
      }
    `;

    const NET_APY_QUERY = `
      query NetApy($input: NetApyInput!) {
        liqwid {
          calculations {
            netAPY(input: $input) {
              netApy netApyLqRewards borrowApy totalBorrow supplyApy totalSupply
            }
          }
        }
      }
    `;

    type LoanResponse = { liqwid: { calculations: { loan: LoanCalculationResult } } };
    type SupplyResponse = { liqwid: { calculations: { supply: SupplyCalculationResult } } };
    type WithdrawResponse = { liqwid: { calculations: { withdraw: WithdrawCalculationResult } } };
    type NetApyResponse = { liqwid: { calculations: { netAPY: NetApyResult } } };

    /** Calculate loan parameters (health factor, max borrow, fees) */
    export const loan = async (
      config: ApiConfig,
      input: LoanCalculationInput,
      currency: Currency = "USD",
    ): Promise<Result<LoanCalculationResult, Error>> => {
      const result = await executeQuery<LoanResponse, { input: LoanCalculationInput; currency: InCurrencyInput }>(
        config,
        "LoanCalc",
        LOAN_QUERY,
        { input, currency: { currency } },
      );
      return result.type === "ok" ? Result.ok(result.value.liqwid.calculations.loan) : result;
    };

    /** Calculate supply parameters */
    export const supply = async (
      config: ApiConfig,
      input: SupplyCalculationInput,
    ): Promise<Result<SupplyCalculationResult, Error>> => {
      const result = await executeQuery<SupplyResponse, { input: SupplyCalculationInput }>(
        config,
        "SupplyCalc",
        SUPPLY_QUERY,
        { input },
      );
      return result.type === "ok" ? Result.ok(result.value.liqwid.calculations.supply) : result;
    };

    /** Calculate withdraw parameters */
    export const withdraw = async (
      config: ApiConfig,
      input: WithdrawCalculationInput,
    ): Promise<Result<WithdrawCalculationResult, Error>> => {
      const result = await executeQuery<WithdrawResponse, { input: WithdrawCalculationInput }>(
        config,
        "WithdrawCalc",
        WITHDRAW_QUERY,
        { input },
      );
      return result.type === "ok" ? Result.ok(result.value.liqwid.calculations.withdraw) : result;
    };

    /** Calculate net APY for a portfolio */
    export const netApy = async (config: ApiConfig, input: NetApyInput): Promise<Result<NetApyResult, Error>> => {
      const result = await executeQuery<NetApyResponse, { input: NetApyInput }>(config, "NetApy", NET_APY_QUERY, {
        input,
      });
      return result.type === "ok" ? Result.ok(result.value.liqwid.calculations.netAPY) : result;
    };
  }

  // ============================================================================
  // Data API
  // ============================================================================

  export namespace Data {
    const MARKETS_QUERY = `
      query Markets($input: MarketsInput, $currency: InCurrencyInput) {
        liqwid {
          data {
            markets(input: $input) {
              page perPage pagesCount totalCount
              results {
                id displayName symbol
                supply(input: $currency) borrow(input: $currency) liquidity(input: $currency)
                supplyAPY borrowAPY lqSupplyAPY utilization exchangeRate
                batching batchExpired frozen private delisting prime
                loanOriginationFeePercentage
                parameters {
                  id borrowCap supplyCap minValue minHealthFactor actionCount maxCollateralCount maxBatchTime minBatchSize minBatchTime
                  collateralParameters { id maxLoanToValue weightedMaxLoanToValue liquidationThreshold weightedLiquidationThreshold liquidationPenalty liquidationProfitability collateralWeight collateral { id displayName symbol name } }
                  incomeParameters { reserve supplier staker treasury }
                  interestModelParameters { baseRate kinkRate utilMultiplier utilMultiplierJump }
                }
                asset { id name symbol displayName decimals currencySymbol policyId hexName logo price(input: $currency) priceUpdatedAt }
                receiptAsset { id name symbol displayName decimals currencySymbol policyId hexName logo price(input: $currency) priceUpdatedAt }
              }
            }
          }
        }
      }
    `;

    const LOANS_QUERY = `
      query Loans($input: LoansInput, $currency: InCurrencyInput) {
        liqwid {
          data {
            loans(input: $input) {
              page perPage pagesCount totalCount
              results {
                id transactionId transactionIndex marketId publicKey
                amount(input: $currency) adjustedAmount(input: $currency) collateral(input: $currency)
                interest APY LTV healthFactor time
                collaterals {
                  id tokenName qTokenName amount(input: $currency) qTokenAmount LTV healthFactor
                  market { id displayName exchangeRate delisting }
                  asset { id name symbol displayName decimals currencySymbol policyId hexName logo price(input: $currency) priceUpdatedAt }
                }
                market { id displayName symbol supplyAPY borrowAPY exchangeRate }
                asset { id name symbol displayName decimals currencySymbol policyId hexName logo price(input: $currency) priceUpdatedAt }
              }
            }
          }
        }
      }
    `;

    const YIELD_QUERY = `
      query Yield($input: YieldEarnedInput!, $currency: InCurrencyInput) {
        historical {
          yieldEarned(input: $input) {
            totalYieldEarned(input: $currency)
            markets { id displayName currencySymbol hexName amount amountInCurrency(input: $currency) }
          }
        }
      }
    `;

    type MarketsResponse = { liqwid: { data: { markets: Pagination<Market> } } };
    type LoansResponse = { liqwid: { data: { loans: Pagination<Loan> } } };
    type YieldResponse = { historical: { yieldEarned: YieldEarnedResult } };

    /** Get markets data */
    export const markets = async (
      config: ApiConfig,
      input?: MarketsInput,
      currency: Currency = "USD",
    ): Promise<Result<Pagination<Market>, Error>> => {
      const result = await executeQuery<MarketsResponse, { input?: MarketsInput; currency: InCurrencyInput }>(
        config,
        "Markets",
        MARKETS_QUERY,
        { input: input ?? { perPage: 50 }, currency: { currency } },
      );
      return result.type === "ok" ? Result.ok(result.value.liqwid.data.markets) : result;
    };

    /** Get loans (borrow positions) data */
    export const loans = async (config: ApiConfig, input: LoansInput): Promise<Result<Pagination<Loan>, Error>> => {
      const result = await executeQuery<LoansResponse, { input: LoansInput }>(config, "Loans", LOANS_QUERY, { input });
      return result.type === "ok" ? Result.ok(result.value.liqwid.data.loans) : result;
    };

    /** Get yield earned for addresses */
    export const yieldEarned = async (
      config: ApiConfig,
      input: YieldEarnedInput,
      currency: Currency = "USD",
    ): Promise<Result<YieldEarnedResult, Error>> => {
      const result = await executeQuery<YieldResponse, { input: YieldEarnedInput; currency: InCurrencyInput }>(
        config,
        "Yield",
        YIELD_QUERY,
        { input, currency: { currency } },
      );
      return result.type === "ok" ? Result.ok(result.value.historical.yieldEarned) : result;
    };

    /** Get a single market by ID */
    export const market = async (config: ApiConfig, marketId: MarketId): Promise<Result<Market | null, Error>> => {
      const result = await markets(config, { ids: [marketId], perPage: 1 });
      return result.type === "ok" ? Result.ok(result.value.results[0] ?? null) : result;
    };

    /** Get loans for specific payment keys */
    export const loansForUser = async (config: ApiConfig, paymentKeys: string[]): Promise<Result<Loan[], Error>> => {
      const result = await loans(config, { paymentKeys, perPage: 100 });
      return result.type === "ok" ? Result.ok(result.value.results) : result;
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /** Get the transaction hash from a CBOR-encoded transaction */
  export const getTxHash = (txCborHex: string): string => {
    const decoded = cbor.decode(Buffer.from(txCborHex, "hex"));
    const body = decoded[0];
    const bodyHex = Buffer.from(cbor.encode(body)).toString("hex");
    return blake2b256(Buffer.from(bodyHex, "hex"));
  };

  /** Sign a Liqwid transaction with a private key */
  export const signTx = (txCborHex: string, privateKey: PrivateKey): string => {
    const txHash = getTxHash(txCborHex);
    const ECSL = RustModule.getE;
    const witnessSet = ECSL.TransactionWitnessSet.new();
    const vkeyWitnesses = ECSL.Vkeywitnesses.new();
    const pKey = privateKey.toECSL();
    const cslTxHash = ECSL.TransactionHash.from_hex(txHash);
    const vKey = ECSL.make_vkey_witness(cslTxHash, pKey);
    vkeyWitnesses.add(vKey);
    witnessSet.set_vkeys(vkeyWitnesses);
    return witnessSet.to_hex();
  };

  /** Create an API config helper */
  export const createConfig = (networkEnv: NetworkEnvironment, clientEndpoint?: string): ApiConfig => ({
    networkEnv,
    clientEndpoint,
  });
}
