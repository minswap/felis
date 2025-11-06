import { NetworkEnvironment, type PrivateKey, XJSON } from "@repo/ledger-core";
import { blake2b256, Result, RustModule } from "@repo/ledger-utils";
import * as cbor from "cbor";

export namespace LiqwidProvider {
  export type MarketId = "MIN";
  export type CollateralMarket = "Ada.186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0";
  export type BorrowMarket = "Ada";

  export const getApiUrl = (networkEnv: NetworkEnvironment, clientEndpoint: string) => {
    const mapApiUrl: Record<NetworkEnvironment, string> = {
      [NetworkEnvironment.MAINNET]: "https://v2.api.liqwid.finance/graphql",
      [NetworkEnvironment.TESTNET_PREPROD]: "ff",
      [NetworkEnvironment.TESTNET_PREVIEW]: "https://v2.api.preview.liqwid.dev/graphql",
    };
    const isClient = typeof window !== "undefined";
    const apiUrl = isClient ? clientEndpoint : mapApiUrl[networkEnv];
    return apiUrl;
  };

  export const callApi = async (options: {
    clientEndpoint: string;
    networkEnv: NetworkEnvironment;
    operationName: string;
    // biome-ignore lint/suspicious/noExplicitAny: wide range
    variables: any;
    query: string;
    // biome-ignore lint/suspicious/noExplicitAny: wide range
  }): Promise<Result<any, Error>> => {
    try {
      const response = await fetch(getApiUrl(options.networkEnv, options.clientEndpoint), {
        method: "POST",
        headers: {
          accept: "*/*",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          operationName: options.operationName,
          variables: options.variables,
          query: options.query,
        }),
      });
      if (!response.ok) {
        return Result.err(new Error(`Liqwid API request failed: ${response.status} ${response.statusText}`));
      }
      const data = await response.json();
      if (data.errors) {
        return Result.err(new Error(`Liqwid GraphQL error: ${XJSON.stringify(data.errors)}`));
      }
      return Result.ok(data.data);
    } catch (error) {
      return Result.err(
        new Error(`Failed ${options.operationName}: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  };

  export const getSupplyTransaction = async (options: {
    marketId: MarketId;
    amount: number;
    address: string;
    utxos: string[];
    networkEnv: NetworkEnvironment;
  }): Promise<Result<string, Error>> => {
    const query = `
      query GetSupplyTransaction($input: SupplyTransactionInput!) {
        liqwid {
          transactions {
            supply(input: $input) {
              cbor
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `;
    const variables = {
      input: {
        marketId: options.marketId,
        amount: options.amount,
        address: options.address,
        changeAddress: options.address,
        otherAddresses: [options.address],
        utxos: options.utxos,
      },
    };
    const data = await callApi({
      clientEndpoint: "/api/liqwid/supply",
      networkEnv: options.networkEnv,
      operationName: "GetSupplyTransaction",
      variables,
      query,
    });
    if (data.type === "ok") {
      const txCbor: string | undefined = data.value.liqwid?.transactions?.supply?.cbor;
      if (!txCbor) {
        return Result.err(new Error("No transaction CBOR returned from Liqwid API"));
      }
      return Result.ok(txCbor);
    } else {
      return data;
    }
  };

  export const getWithdrawTransaction = async (options: {
    marketId: "MIN";
    amount: number;
    address: string;
    utxos: string[];
    networkEnv: NetworkEnvironment;
  }): Promise<Result<string, Error>> => {
    const query = `
      query GetWithdrawTransaction($input: WithdrawTransactionInput!) {
        liqwid {
          transactions {
            withdraw(input: $input) {
              cbor
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `;
    const variables = {
      input: {
        marketId: options.marketId,
        amount: options.amount,
        address: options.address,
        changeAddress: options.address,
        otherAddresses: [options.address],
        utxos: options.utxos,
      },
    };
    const data = await callApi({
      clientEndpoint: "/api/liqwid/graphql",
      networkEnv: options.networkEnv,
      operationName: "GetWithdrawTransaction",
      variables,
      query,
    });
    if (data.type === "ok") {
      const txCbor: string | undefined = data.value.liqwid?.transactions?.withdraw?.cbor;
      if (!txCbor) {
        return Result.err(new Error("No transaction CBOR returned from Liqwid API"));
      }
      return Result.ok(txCbor);
    } else {
      return data;
    }
  };

  // id: qMIN, amount: raw number(lovelace)
  export type BorrowCollateral = { id: "qMIN"; amount: number };
  export const getBorrowTransaction = async (options: {
    marketId: BorrowMarket;
    amount: number; // raw number (e.g lovelace)
    address: string;
    utxos: string[];
    collaterals: BorrowCollateral[];
    networkEnv: NetworkEnvironment;
  }): Promise<Result<string, Error>> => {
    const query = `
      query GetBorrowTransactionInput($input: BorrowTransactionInput!) {
        liqwid {
          transactions {
            borrow(input: $input) {
              cbor
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `;
    const variables = {
      input: {
        marketId: options.marketId,
        amount: options.amount,
        address: options.address,
        changeAddress: options.address,
        otherAddresses: [options.address],
        utxos: options.utxos,
        collaterals: options.collaterals,
      },
    };
    const data = await callApi({
      clientEndpoint: "/api/liqwid/graphql",
      networkEnv: options.networkEnv,
      operationName: "GetBorrowTransactionInput",
      variables,
      query,
    });
    if (data.type === "ok") {
      const txCbor: string | undefined = data.value.liqwid?.transactions?.borrow?.cbor;
      if (!txCbor) {
        return Result.err(new Error("No transaction CBOR returned from Liqwid API"));
      }
      return Result.ok(txCbor);
    } else {
      return data;
    }
  };

  // amount: raw number qToken (lovelace mode)
  export type RepayCollateral = { id: CollateralMarket; amount: number };
  export type GetRepayTransactionInput = {
    txId: string; // GetLoansBorrow -> results -> 0 -> id
    amount: number; // raw number (e.g lovelace), 0 to repay full debt
    address: string; // owner of borrow position
    utxos: string[];
    collaterals: RepayCollateral[];
    networkEnv: NetworkEnvironment;
  };
  export const getRepayTransaction = async (options: GetRepayTransactionInput): Promise<Result<string, Error>> => {
    const query = `
      query GetRepayTransactionInput($input: ModifyBorrowTransactionInput!) {
        liqwid {
          transactions {
            modifyBorrow(input: $input) {
              cbor
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `;
    const variables = {
      input: {
        txId: options.txId,
        amount: options.amount,
        address: options.address,
        changeAddress: options.address,
        otherAddresses: [options.address],
        utxos: options.utxos,
        collaterals: options.collaterals,
      },
    };
    const data = await callApi({
      clientEndpoint: "/api/liqwid/graphql",
      networkEnv: options.networkEnv,
      operationName: "GetRepayTransactionInput",
      variables,
      query,
    });
    if (data.type === "ok") {
      const txCbor: string | undefined = data.value.liqwid?.transactions?.modifyBorrow?.cbor;
      if (!txCbor) {
        return Result.err(new Error("No transaction CBOR returned from Liqwid API"));
      }
      return Result.ok(txCbor);
    } else {
      return data;
    }
  };

  export const submitTransaction = async (options: {
    transaction: string;
    signature: string;
    networkEnv: NetworkEnvironment;
  }): Promise<Result<string, Error>> => {
    const query = `
        mutation SubmitTransaction($input: SubmitTransactionInput!) {
          submitTransaction(input: $input)
        }
      `;
    const variables = {
      input: {
        transaction: options.transaction,
        signature: options.signature,
      },
    };
    const data = await callApi({
      clientEndpoint: "/api/liqwid/graphql",
      networkEnv: options.networkEnv,
      operationName: "SubmitTransaction",
      variables,
      query,
    });
    if (data.type === "ok") {
      const txHash: string | undefined = data.value.submitTransaction;
      if (!txHash) {
        return Result.err(new Error("No transaction hash returned from Liqwid API"));
      }
      return Result.ok(txHash);
    } else {
      return data;
    }
  };

  export type LoanCalculationInput = {
    market: BorrowMarket;
    debt: number;
    // amount is real token with decimals amount (number, eg: 12229.950631313506 MIN)
    collaterals: { id: CollateralMarket; amount: number }[];
  };

  export type LoanCalculationResult = {
    healthFactor: number;
    maxBorrow: number;
    maxBorrowCap: number;
    batchingFee: number;
    protocolFee: number;
    protocolFeePercentage: number;
    collateralInCurrency: number;
    collaterals: Array<{
      id: string;
      amount: number;
      amountInCurrency: number;
      healthFactor: number;
    }>;
  };

  export type SupplyInput = {
    marketId: MarketId;
    amount: number;
  };

  export type NetApyInput = {
    paymentKeys: string[];
    supplies: SupplyInput[];
    currency?: string;
  };

  export type NetApyResult = {
    netApy: number;
    netApyLqRewards: number;
    borrowApy: number;
    totalBorrow: number;
    supplyApy: number;
    totalSupply: number;
  };

  export type MarketAsset = {
    id: string;
    priceInCurrency: number;
    decimals: number;
  };

  export type MarketResult = {
    id: string;
    receiptAsset: {
      id: string;
    };
    exchangeRate: number;
    asset: MarketAsset;
  };

  export type MarketsInput = {
    perPage?: number;
  };

  export const loanCalculation = async (options: {
    input: LoanCalculationInput;
    currency?: string;
    networkEnv: NetworkEnvironment;
  }): Promise<Result<LoanCalculationResult, Error>> => {
    const query = `
      query LoanCalculation($input: LoanCalculationInput!, $currencyInput: InCurrencyInput) {
        liqwid {
          calculations {
            loan(input: $input) {
              healthFactor
              maxBorrow
              maxBorrowCap
              batchingFee
              protocolFee
              protocolFeePercentage
              collateralInCurrency: collateral(input: $currencyInput)
              collaterals {
                id
                amount
                amountInCurrency: amount(input: $currencyInput)
                healthFactor
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `;

    const variables = {
      input: options.input,
      currencyInput: options.currency ? { currency: options.currency } : { currency: "USD" },
    };

    const data = await callApi({
      clientEndpoint: "/api/liqwid/graphql",
      networkEnv: options.networkEnv,
      operationName: "LoanCalculation",
      variables,
      query,
    });

    if (data.type === "ok") {
      const result: LoanCalculationResult | undefined = data.value.liqwid?.calculations?.loan;
      if (!result) {
        return Result.err(new Error("No loan calculation result returned from Liqwid API"));
      }
      return Result.ok(result);
    } else {
      return data;
    }
  };

  export const getNetApy = async (options: {
    input: NetApyInput;
    networkEnv: NetworkEnvironment;
  }): Promise<Result<NetApyResult, Error>> => {
    const query = `
      query GetNetApy($input: NetApyInput!) {
        liqwid {
          calculations {
            netAPY(input: $input) {
              netApy
              netApyLqRewards
              borrowApy
              totalBorrow
              supplyApy
              totalSupply
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `;

    const variables = {
      input: {
        paymentKeys: options.input.paymentKeys,
        supplies: options.input.supplies,
        currency: options.input.currency || "USD",
      },
    };

    const data = await callApi({
      clientEndpoint: "/api/liqwid/graphql",
      networkEnv: options.networkEnv,
      operationName: "GetNetApy",
      variables,
      query,
    });

    if (data.type === "ok") {
      const result: NetApyResult | undefined = data.value.liqwid?.calculations?.netAPY;
      if (!result) {
        return Result.err(new Error("No net APY result returned from Liqwid API"));
      }
      return Result.ok(result);
    } else {
      return data;
    }
  };

  export type GetMarketsBalanceParams = {
    input?: MarketsInput;
    currency?: string;
    networkEnv: NetworkEnvironment;
  };

  export const getMarketsBalance = async (options: GetMarketsBalanceParams): Promise<Result<MarketResult[], Error>> => {
    const query = `
      query GetMarketsBalance($input: MarketsInput, $currencyInput: InCurrencyInput) {
        liqwid {
          data {
            markets(input: $input) {
              results {
                id
                receiptAsset {
                  id
                  __typename
                }
                exchangeRate
                asset {
                  id
                  priceInCurrency: price(input: $currencyInput)
                  decimals
                  __typename
                }
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `;

    const variables = {
      input: options.input || { perPage: 100 },
      currencyInput: { currency: options.currency || "USD" },
    };

    const data = await callApi({
      clientEndpoint: "/api/liqwid/graphql",
      networkEnv: options.networkEnv,
      operationName: "GetMarketsBalance",
      variables,
      query,
    });

    if (data.type === "ok") {
      const result: MarketResult[] | undefined = data.value.liqwid?.data?.markets.results;
      if (!result) {
        return Result.err(new Error("No markets balance result returned from Liqwid API"));
      }
      return Result.ok(result);
    } else {
      return data;
    }
  };

  export const getMarketPriceInCurrency = async (
    options: GetMarketsBalanceParams & { marketId: string },
  ): Promise<Result<number, Error>> => {
    const marketsResult = await getMarketsBalance(options);
    if (marketsResult.type === "err") {
      return marketsResult;
    }
    const market = marketsResult.value.find((m) => m.id === options.marketId);
    if (!market) {
      return Result.err(new Error(`Market with ID ${options.marketId} not found`));
    }
    return Result.ok(market.asset.priceInCurrency);
  };

  export type LoanCollateralAsset = {
    id: string;
    displayName?: string;
    logo?: string;
    priceInCurrency: number;
    decimals: number;
  };

  export type LoanCollateralMarket = {
    id: string;
    displayName?: string;
    delisting: boolean;
    exchangeRate: number;
  };

  export type LoanCollateral = {
    id: string;
    tokenName?: string;
    amount: number;
    amountInCurrency: number;
    healthFactor: number;
    market: LoanCollateralMarket;
    asset: LoanCollateralAsset;
  };

  export type LoanBorrow = {
    id: string;
    amount: number;
    amountInCurrency: number;
    collaterals: LoanCollateral[];
  };

  export type GetLoansInput = {
    paymentKeys: string[];
    sorts?: string[];
    perPage?: number;
  };

  export const getLoansBorrow = async (options: {
    input: GetLoansInput;
    currency?: string;
    networkEnv: NetworkEnvironment;
  }): Promise<Result<LoanBorrow[], Error>> => {
    const query = `
      query GetLoansBorrow($input: LoansInput, $currencyInput: InCurrencyInput) {
        liqwid {
          data {
            loans(input: $input) {
              results {
                id
                amount
                amountInCurrency: amount(input: $currencyInput)
                collaterals {
                  id
                  tokenName
                  amount
                  amountInCurrency: amount(input: $currencyInput)
                  healthFactor
                  market {
                    id
                    displayName
                    delisting
                    exchangeRate
                    __typename
                  }
                  asset {
                    id
                    displayName
                    logo
                    priceInCurrency: price(input: $currencyInput)
                    decimals
                    __typename
                  }
                  __typename
                }
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `;

    const variables = {
      input: {
        paymentKeys: options.input.paymentKeys,
        sorts: options.input.sorts || ["MARKET_ID"],
        perPage: options.input.perPage || 100,
      },
      currencyInput: { currency: options.currency || "USD" },
    };

    const data = await callApi({
      clientEndpoint: "/api/liqwid/graphql",
      networkEnv: options.networkEnv,
      operationName: "GetLoansBorrow",
      variables,
      query,
    });

    if (data.type === "ok") {
      const result: LoanBorrow[] | undefined = data.value.liqwid?.data?.loans?.results;
      if (!result) {
        return Result.err(new Error("No loans borrow result returned from Liqwid API"));
      }
      return Result.ok(result);
    } else {
      return data;
    }
  };

  export const getLiqwidTxHash = (txHex: string): string => {
    const decoded = cbor.decode(Buffer.from(txHex, "hex"));
    const body = decoded[0];
    const bodyHex = Buffer.from(cbor.encode(body)).toString("hex");
    const txHash = blake2b256(Buffer.from(bodyHex, "hex"));
    return txHash;
  };

  export const signLiqwidTx = (txHex: string, privateKey: PrivateKey) => {
    const txHash = getLiqwidTxHash(txHex);
    const ECSL = RustModule.getE;
    const witnessSet = ECSL.TransactionWitnessSet.new();
    const vkeyWitnesses = ECSL.Vkeywitnesses.new();
    const pKey = privateKey.toECSL();
    const cslTxHash = ECSL.TransactionHash.from_hex(txHash);
    const vKey = ECSL.make_vkey_witness(cslTxHash, pKey);
    vkeyWitnesses.add(vKey);
    witnessSet.set_vkeys(vkeyWitnesses);
    const witnesses = witnessSet.to_hex();
    return witnesses;
  };
}
