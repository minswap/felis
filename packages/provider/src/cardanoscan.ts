import type { Address, NetworkEnvironment } from "@minswap/felis-ledger-core";
import { NetworkEnvironment as NE } from "@minswap/felis-ledger-core";

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

export type CardanoscanTransaction = {
  hash: string;
  blockHash: string;
  fees: string;
  slot: number;
  epoch: number;
  blockHeight: number;
  timestamp: string;
  index: number;
  inputs: (CardanoscanTxIO & { txId: string; index: number })[];
  outputs: CardanoscanTxIO[];
  collateral: CardanoscanTxIO[];
  certificates?: {
    stakeDelegations?: Array<{ stakeAddress: string; poolId: string }>;
    poolRegistrations?: Array<Record<string, unknown>>;
    governanceActions?: Array<Record<string, unknown>>;
  };
  withdrawals?: Array<{ address: string; amount: string }>;
  metadata?: { hash: string; labels: Record<string, unknown> };
  mint?: Array<{ quantity: string; unit: string }>;
  redeemers?: Array<{
    index: number;
    purpose: string;
    scriptHash: string;
    redeemerDataHash: string;
    executionUnits: { memory: number; steps: number };
  }>;
  status: boolean;
  votingProcedures?: Array<Record<string, unknown>>;
};

export type CardanoscanTransactionListResponse = {
  pageNo: number;
  limit: number;
  transactions: CardanoscanTransaction[];
};

export type GetTransactionListOptions = {
  address: string;
  pageNo: number;
  limit?: number;
  order: "asc" | "desc";
};

export class CardanoscanProvider {
  static readonly MAINNET_URL = "https://api.cardanoscan.io/api/v1";
  static readonly PREVIEW_URL = "https://api-preview.cardanoscan.io/api/v1";
  static readonly PREPROD_URL = "https://api-preprod.cardanoscan.io/api/v1";

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  static forNetwork(networkEnv: NetworkEnvironment, apiKey: string): CardanoscanProvider {
    switch (networkEnv) {
      case NE.MAINNET:
        return new CardanoscanProvider(CardanoscanProvider.MAINNET_URL, apiKey);
      case NE.TESTNET_PREPROD:
        return new CardanoscanProvider(CardanoscanProvider.PREPROD_URL, apiKey);
      case NE.TESTNET_PREVIEW:
        return new CardanoscanProvider(CardanoscanProvider.PREVIEW_URL, apiKey);
    }
  }

  async getTransactionList(options: GetTransactionListOptions): Promise<CardanoscanTransactionListResponse> {
    const { address, pageNo, limit = 20, order } = options;
    if (!address || address.length > 200) {
      throw new Error("Address is required and must be max 200 characters");
    }
    if (pageNo < 1) {
      throw new Error("pageNo must be at least 1");
    }
    if (limit < 1 || limit > 50) {
      throw new Error("limit must be between 1 and 50");
    }
    if (!["asc", "desc"].includes(order)) {
      throw new Error("order must be 'asc' or 'desc'");
    }

    const url = new URL(`${this.baseUrl}/transaction/list`);
    url.searchParams.set("address", address);
    url.searchParams.set("pageNo", pageNo.toString());
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("order", order);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        apiKey: this.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cardanoscan API error: ${response.status} ${response.statusText} ${errorText}`);
    }

    return (await response.json()) as CardanoscanTransactionListResponse;
  }

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

  async getAllTransactionsByAddress(address: Address, maxPages?: number): Promise<CardanoscanTransaction[]> {
    const allTransactions: CardanoscanTransaction[] = [];
    let pageNo = 1;
    let hasMore = true;
    while (hasMore && (!maxPages || pageNo <= maxPages)) {
      const response = await this.getTransactionListByAddress(address, pageNo, 50, "desc");
      allTransactions.push(...response.transactions);
      hasMore = response.transactions.length === response.limit;
      pageNo++;
    }
    return allTransactions;
  }

  async getLatestTransaction(address: Address): Promise<CardanoscanTransaction | null> {
    const response = await this.getTransactionListByAddress(address, 1, 1, "desc");
    return response.transactions[0] ?? null;
  }

  async findTransactionByHash(
    address: Address,
    txHash: string,
    pageSize?: number,
    maxPage?: number,
  ): Promise<CardanoscanTransaction | null> {
    let pageNo = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await this.getTransactionListByAddress(address, pageNo, pageSize ?? 50, "desc");
      const found = response.transactions.find((tx) => tx.hash === txHash);
      if (found) return found;
      hasMore = response.transactions.length === response.limit;
      pageNo++;
      if (pageNo > (maxPage ?? 100)) break;
    }
    return null;
  }

  async findTransactionHasSpent(
    address: Address,
    txHash: string,
    index: number,
    pageSize?: number,
    maxPage?: number,
  ): Promise<CardanoscanTransaction | null> {
    let pageNo = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await this.getTransactionListByAddress(address, pageNo, pageSize ?? 50, "desc");
      for (const tx of response.transactions) {
        const spent = tx.inputs.find((input) => input.txId === txHash && input.index === index);
        if (spent) return tx;
      }
      hasMore = response.transactions.length === response.limit;
      pageNo++;
      if (pageNo > (maxPage ?? 100)) break;
    }
    return null;
  }

  /**
   * Submit a signed transaction CBOR to the Cardano network.
   * On 204 success, returns the submitted tx hex (caller can hash separately if needed).
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
      return txCbor;
    }

    const errorData = (await response.json().catch(() => ({}))) as { error?: string };
    const errorMsg = errorData.error ?? response.statusText;
    throw new Error(`Cardanoscan submit failed (${response.status}): ${errorMsg}`);
  }
}
