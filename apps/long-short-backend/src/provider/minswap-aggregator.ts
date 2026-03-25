import { NetworkEnvironment } from "@minswap/felis-ledger-core";
import { logger } from "../utils";

const BASE_URLS: Record<NetworkEnvironment, string> = {
  [NetworkEnvironment.MAINNET]: "https://aggr-monorepo-mainnet-prod.minswap.org",
  [NetworkEnvironment.TESTNET_PREVIEW]: "https://aggr.dev-3.minswap.org",
  [NetworkEnvironment.TESTNET_PREPROD]: "https://aggr.dev-3.minswap.org",
};

export type EstimateRequest = {
  /** Amount to swap (as string, in smallest unit) */
  amount: string;
  /** Input token ID (e.g. "lovelace" or concatenated policyId + tokenName) */
  tokenIn: string;
  /** Output token ID (e.g. concatenated policyId + tokenName) */
  tokenOut: string;
  /** Slippage tolerance in percent (default: 1) */
  slippage?: number;
};

export type EstimateResponse = {
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  avgPriceImpact: number;
};

export class MinswapAggregatorProvider {
  private readonly baseUrl: string;

  constructor(networkEnv: NetworkEnvironment) {
    this.baseUrl = BASE_URLS[networkEnv];
  }

  /**
   * Estimate swap output amount via Minswap aggregator.
   * Token IDs use concatenated format (no dot): policyId + tokenName, or "lovelace".
   */
  async estimate(request: EstimateRequest): Promise<EstimateResponse> {
    const { amount, tokenIn, tokenOut, slippage = 1 } = request;

    const url = `${this.baseUrl}/aggregator/estimate`;
    const body = JSON.stringify({
      amount,
      token_in: tokenIn,
      token_out: tokenOut,
      slippage,
      include: ["MinswapV2"],
      allow_multi_hops: false,
      allowNonAtomicMultiHops: false,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error("Minswap aggregator estimate failed", { status: response.status, body: text });
      throw new Error(`Minswap aggregator estimate failed: ${response.status} ${text}`);
    }

    const data = await response.json();

    return {
      amountIn: data.amount_in,
      amountOut: data.amount_out,
      minAmountOut: data.min_amount_out,
      avgPriceImpact: data.avg_price_impact,
    };
  }
}
