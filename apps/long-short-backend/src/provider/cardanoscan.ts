import type { Address } from "@minswap/felis-ledger-core";
import { logger } from "../utils";

/**
 * Transaction input/output structure from Cardanoscan API
 */
export type CardanoscanTxIO = {
  address: string;
  value: string;
  tokens?: Array<{
    value: string;
    assetId: string;
  }>;
  datum?: string;
  scriptRef?: string;
};

/**
 * Transaction object from Cardanoscan API
 */
export type CardanoscanTransaction = {
  hash: string;
  blockHash: string;
  fees: string;
  slot: number;
  epoch: number;
  blockHeight: number;
  timestamp: string; // ISO 8601 date-time
  index: number;
  inputs: (CardanoscanTxIO & { txId: string; index: number })[];
  outputs: CardanoscanTxIO[];
  collateral: CardanoscanTxIO[];
  certificates?: {
    stakeDelegations?: Array<{
      stakeAddress: string;
      poolId: string;
    }>;
    poolRegistrations?: Array<Record<string, unknown>>;
    governanceActions?: Array<Record<string, unknown>>;
  };
  withdrawals?: Array<{
    address: string;
    amount: string;
  }>;
  metadata?: {
    hash: string;
    labels: Record<string, unknown>;
  };
  mint?: Array<{
    quantity: string;
    unit: string;
  }>;
  redeemers?: Array<{
    index: number;
    purpose: string;
    scriptHash: string;
    redeemerDataHash: string;
    executionUnits: {
      memory: number;
      steps: number;
    };
  }>;
  status: boolean;
  votingProcedures?: Array<Record<string, unknown>>;
};

/**
 * Response from Cardanoscan transaction list API
 */
export type CardanoscanTransactionListResponse = {
  pageNo: number;
  limit: number;
  transactions: CardanoscanTransaction[];
};

/**
 * Options for fetching transaction list
 */
export type GetTransactionListOptions = {
  address: string;
  pageNo: number;
  limit?: number; // 1-50, default 20
  order: "asc" | "desc"; // default "desc"
};

/**
 * Cardanoscan API Provider
 * Provides access to Cardano blockchain data via Cardanoscan API
 */
export class CardanoscanProvider {
  public static readonly MAINNET_URL = "https://api.cardanoscan.io/api/v1";
  public static readonly PREVIEW_URL = "https://api-preview.cardanoscan.io/api/v1";
  public static readonly PAGE_SIZE = 3;
  public static readonly MAX_PAGE = 3;

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = apiKey;
  }

  /**
   * Get transaction list for a specific address
   * @param options - Request options including address, pagination, and ordering
   * @returns Transaction list response with pagination info
   */
  async getTransactionList(options: GetTransactionListOptions): Promise<CardanoscanTransactionListResponse> {
    const { address, pageNo, limit = 20, order } = options;

    // Validate parameters
    if (!address || address.length > 200) {
      throw new Error("Address is required and must be max 200 characters");
    }
    if (pageNo < 1) {
      throw new Error("pageNo must be at least 1");
    }
    if (limit && (limit < 1 || limit > 50)) {
      throw new Error("limit must be between 1 and 50");
    }
    if (order && !["asc", "desc"].includes(order)) {
      throw new Error("order must be 'asc' or 'desc'");
    }

    const url = new URL(`${this.baseUrl}/transaction/list`);
    url.searchParams.set("address", address);
    url.searchParams.set("pageNo", pageNo.toString());
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("order", order);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          apiKey: this.apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Cardanoscan API error", {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        throw new Error(`Cardanoscan API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as CardanoscanTransactionListResponse;
      return data;
    } catch (error) {
      logger.error("Failed to fetch transaction list from Cardanoscan", error);
      throw error;
    }
  }

  /**
   * Get transaction list for an Address object
   * @param address - Address to query
   * @param pageNo - Page number (1-indexed)
   * @param limit - Results per page (1-50, default 20)
   * @param order - Sort order (asc or desc, default desc)
   * @returns Transaction list response
   */
  async getTransactionListByAddress(
    address: Address,
    pageNo: number,
    limit: number,
    order: "asc" | "desc",
  ): Promise<CardanoscanTransactionListResponse> {
    return this.getTransactionList({
      address: address.toHex(),
      pageNo,
      limit,
      order,
    });
  }

  /**
   * Get all transactions for an address (handles pagination automatically)
   * Warning: This can make many API calls for addresses with many transactions
   * @param address - Address to query
   * @param maxPages - Maximum number of pages to fetch (default: no limit)
   * @returns All transactions
   */
  async getAllTransactionsByAddress(address: Address, maxPages?: number): Promise<CardanoscanTransaction[]> {
    const allTransactions: CardanoscanTransaction[] = [];
    let pageNo = 1;
    let hasMore = true;

    while (hasMore && (!maxPages || pageNo <= maxPages)) {
      const response = await this.getTransactionListByAddress(address, pageNo, 50, "desc");
      allTransactions.push(...response.transactions);

      // If we got fewer transactions than the limit, we've reached the end
      hasMore = response.transactions.length === response.limit;
      pageNo++;
    }

    logger.info(`Fetched ${allTransactions.length} transactions for ${address.bech32}`, {
      pages: pageNo - 1,
    });

    return allTransactions;
  }

  /**
   * Get the most recent transaction for an address
   * @param address - Address to query
   * @returns Most recent transaction or null if no transactions found
   */
  async getLatestTransaction(address: Address): Promise<CardanoscanTransaction | null> {
    const response = await this.getTransactionListByAddress(address, 1, 1, "desc");
    return response.transactions[0] || null;
  }

  /**
   * Get transactions within a specific slot range
   * @param address - Address to query
   * @param minSlot - Minimum slot number (inclusive)
   * @param maxSlot - Maximum slot number (inclusive)
   * @returns Transactions within the slot range
   */
  async getTransactionsBySlotRange(
    address: Address,
    minSlot: number,
    maxSlot: number,
  ): Promise<CardanoscanTransaction[]> {
    const allTransactions = await this.getAllTransactionsByAddress(address);
    return allTransactions.filter((tx) => tx.slot >= minSlot && tx.slot <= maxSlot);
  }

  /**
   * Check if a transaction exists for an address
   * @param address - Address to query
   * @param txHash - Transaction hash to find
   * @returns The transaction if found, null otherwise
   */
  async findTransactionByHash(
    address: Address,
    txHash: string,
    pageSize?: number,
    maxPage?: number,
  ): Promise<CardanoscanTransaction | null> {
    // Start from most recent and work backwards
    let pageNo = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getTransactionListByAddress(address, pageNo, pageSize ?? 50, "desc");

      const found = response.transactions.find((tx) => tx.hash === txHash);
      if (found) {
        return found;
      }

      hasMore = response.transactions.length === response.limit;
      pageNo++;

      // Safety limit to prevent infinite loops
      if (pageNo > (maxPage ?? 100)) {
        logger.warn(`Searched ${maxPage ?? 100} pages without finding transaction ${txHash}`);
        break;
      }
    }

    return null;
  }

  /**
   * Find the transaction that spent a specific UTXO
   * @param address - Address to query
   * @param txHash - Transaction hash of the UTXO
   * @param index - Output index of the UTXO
   * @param pageSize - Number of transactions per page (default: 50)
   * @param maxPage - Maximum pages to search (default: 100)
   * @returns The transaction that spent the UTXO, or null if not found
   */
  async findTransactionHasSpent(
    address: Address,
    txHash: string,
    index: number,
    pageSize?: number,
    maxPage?: number,
  ): Promise<CardanoscanTransaction | null> {
    // Start from most recent and work backwards
    let pageNo = 1;
    let hasMore = true;

    logger.info("Searching for transaction that spent UTXO", {
      address: address.bech32,
      txHash,
      outputIndex: index,
    });

    while (hasMore) {
      const response = await this.getTransactionListByAddress(address, pageNo, pageSize ?? 50, "desc");

      // Check each transaction's inputs for the specified UTXO
      for (const tx of response.transactions) {
        const spentInput = tx.inputs.find((input) => input.txId === txHash && input.index === index);

        if (spentInput) {
          logger.info("Found transaction that spent UTXO", {
            spendingTxHash: tx.hash,
            utxoTxHash: txHash,
            utxoIndex: index,
          });
          return tx;
        }
      }

      hasMore = response.transactions.length === response.limit;
      pageNo++;

      // Safety limit to prevent infinite loops
      if (pageNo > (maxPage ?? 100)) {
        logger.warn(`Searched ${maxPage ?? 100} pages without finding spending transaction for ${txHash}:${index}`);
        break;
      }
    }

    logger.info("UTXO not spent yet", { txHash, outputIndex: index });
    return null;
  }

  /**
   * Submit a signed transaction to the Cardano network
   * @param txCbor - Transaction CBOR hex string
   * @returns Transaction hash on success
   * @throws Error with details on failure
   */
  async submitTx(txCbor: string): Promise<string> {
    const url = `${this.baseUrl}/transaction/submit`;
    const txBytes = Buffer.from(txCbor, "hex");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/cbor",
        apiKey: this.apiKey,
      },
      body: txBytes,
    });

    if (response.status === 204) {
      // Derive tx hash from the CBOR
      const txHash = txCbor.length > 0 ? txCbor : "";
      logger.info("Transaction submitted successfully via Cardanoscan");
      return txHash;
    }

    const errorData = await response.json();
    const errorMsg = (errorData as { error?: string }).error ?? response.statusText;
    logger.error("Failed to submit transaction via Cardanoscan", {
      status: response.status,
      error: errorMsg,
    });
    throw new Error(`Transaction submit failed (${response.status}): ${errorMsg}`);
  }
}
