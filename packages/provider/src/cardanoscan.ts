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

export type CardanoscanQueryValue = string | number | boolean | null | undefined;

export type CardanoscanQuery = Record<string, CardanoscanQueryValue | CardanoscanQueryValue[]>;

export type CardanoscanRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: CardanoscanQuery;
  headers?: Record<string, string>;
  body?: BodyInit;
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

  async request<T = unknown>(path: string, options: CardanoscanRequestOptions = {}): Promise<T> {
    const { method = "GET", query, headers, body } = options;
    const url = this.buildUrl(path, query);

    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        apiKey: this.apiKey,
        ...headers,
      },
      body,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Cardanoscan API error: ${response.status} ${response.statusText} ${responseText}`);
    }

    return (responseText ? JSON.parse(responseText) : undefined) as T;
  }

  async getBlock(query: CardanoscanQuery = {}): Promise<unknown> {
    return this.request("/block", { query });
  }

  async getLatestBlock(): Promise<unknown> {
    return this.request("/block/latest");
  }

  async getAddressBalance(address: string): Promise<unknown> {
    return this.request("/address/balance", { query: { address } });
  }

  async getPool(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/pool", { query });
  }

  async getPoolStats(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/pool/stats", { query });
  }

  async getPoolList(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/pool/list", { query });
  }

  async getExpiringPools(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/pool/list/expiring", { query });
  }

  async getExpiredPools(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/pool/list/expired", { query });
  }

  async getAsset(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/asset", { query });
  }

  async getAssetsByPolicyId(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/asset/list/byPolicyId", { query });
  }

  async getAssetsByAddress(address: string, query: CardanoscanQuery = {}): Promise<unknown> {
    return this.request("/asset/list/byAddress", { query: { ...query, address } });
  }

  async getTransaction(hash: string): Promise<CardanoscanTransaction> {
    return this.request<CardanoscanTransaction>("/transaction", { query: { hash } });
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

    return this.request<CardanoscanTransactionListResponse>("/transaction/list", {
      query: { address, pageNo, limit, order },
    });
  }

  async getRewardAccount(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/rewardAccount", { query });
  }

  async getRewardAccountAddresses(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/rewardAccount/addresses", { query });
  }

  async getNetworkState(): Promise<unknown> {
    return this.request("/network/state");
  }

  async getNetworkProtocolParams(): Promise<unknown> {
    return this.request("/network/protocolParams");
  }

  async getCCHot(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/governance/ccHot", { query });
  }

  async getCCMember(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/governance/ccMember", { query });
  }

  async getCommittee(): Promise<unknown> {
    return this.request("/governance/committee");
  }

  async getCommitteeMembers(query: CardanoscanQuery = {}): Promise<unknown> {
    return this.request("/governance/committee/members", { query });
  }

  async getDRep(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/governance/dRep", { query });
  }

  async getDRepList(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/governance/dRep/list", { query });
  }

  async getGovernanceAction(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/governance/action", { query });
  }

  async getTransactionSummary(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/transaction/summary", { query });
  }

  async getUtxoList(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/utxo/list", { query });
  }

  async getAssetHoldersByPolicyId(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/asset/holders/byPolicyId", { query });
  }

  async getAssetHoldersByAssetId(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/asset/holders/byAssetId", { query });
  }

  async getAssetMetadata(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/asset/metadata", { query });
  }

  async getVotesByVoter(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/votes/byVoter", { query });
  }

  async getVotesByAction(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/votes/byAction", { query });
  }

  async getDailyTxFees(query: CardanoscanQuery): Promise<unknown> {
    return this.request("/stats/dailyTxFee", { query });
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

  async submit(txCbor: string): Promise<"success"> {
    const url = this.buildUrl("/transaction/submit");
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
      return "success";
    }

    const errorBody = await response.text().catch(() => "");
    throw new Error(`Cardanoscan submit failed (${response.status}): ${errorBody || response.statusText}`);
  }

  async submitChain(txCbor: string): Promise<"success"> {
    const url = this.buildUrl("/transaction/submit/chain");
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
      return "success";
    }

    const errorBody = await response.text().catch(() => "");
    throw new Error(`Cardanoscan submit chain failed (${response.status}): ${errorBody || response.statusText}`);
  }

  async submitTx(txCbor: string): Promise<"success"> {
    return this.submit(txCbor);
  }

  async submitTxToChain(txCbor: string): Promise<"success"> {
    return this.submitChain(txCbor);
  }

  private buildUrl(path: string, query?: CardanoscanQuery): string {
    const url = new URL(path.startsWith("/") ? `${this.baseUrl}${path}` : `${this.baseUrl}/${path}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
          if (item !== undefined && item !== null) {
            url.searchParams.append(key, item.toString());
          }
        }
      }
    }

    return url.toString();
  }
}
