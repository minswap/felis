import type { Kysely } from "kysely";
import { getMarketConfig, isSupportedMarket, type MarketConfig } from "../config/market";
import type { DB } from "../database";
import { type Position, PositionRepository } from "../repository/position-repository";

export type CreatePositionInput = {
  userAddress: string;
  market: string;
  side: "LONG" | "SHORT";
  amount: bigint; // collateral amount in lovelace
};

export type CreatePositionResult =
  | { success: true; position: Position }
  | { success: false; error: string };

export class PositionService {
  constructor(private readonly db: Kysely<DB>) {}

  async createPosition(input: CreatePositionInput): Promise<CreatePositionResult> {
    const { userAddress, market, side, amount } = input;

    // Validate market
    if (!isSupportedMarket(market)) {
      return { success: false, error: `Market "${market}" is not supported` };
    }

    const marketConfig = getMarketConfig(market);
    if (!marketConfig) {
      return { success: false, error: `Market "${market}" configuration not found` };
    }

    if (!marketConfig.enable) {
      return { success: false, error: `Market "${market}" is currently disabled` };
    }

    // Validate minimum collateral
    if (amount < marketConfig.minCollateral) {
      const minLovelace = marketConfig.minCollateral;
      return {
        success: false,
        error: `Minimum collateral is ${minLovelace} lovelace`,
      };
    }

    // Check for existing open position in this market
    const existingPosition = await PositionRepository.getOpenPositionByUserAndMarket(
      this.db,
      userAddress,
      market,
    );

    if (existingPosition) {
      return {
        success: false,
        error: `You already have an open position in market "${market}". Close it first or modify the existing position.`,
      };
    }

    // For now, create a pending position
    // In a full implementation, this would:
    // 1. Calculate entry price from DEX
    // 2. Calculate position size based on leverage
    // 3. Interact with Liqwid to supply collateral and borrow
    // 4. Execute swap on Minswap DEX

    const position = await PositionRepository.createPosition(this.db, {
      userAddress,
      market,
      side,
      leverage: marketConfig.leverage.toString(),
      collateralAsset: marketConfig.assetA.toString(),
      collateralAmount: amount.toString(),
      entryPrice: "0", // TODO: Get from price oracle
      positionSize: amount.toString(), // TODO: Calculate based on leverage
      borrowedAmount: "0", // TODO: Calculate based on leverage
      liquidationPrice: "0", // TODO: Calculate liquidation price
    });

    return { success: true, position };
  }

  async getPosition(positionId: bigint): Promise<Position | null> {
    return PositionRepository.getPositionById(this.db, positionId);
  }

  async getUserOpenPositions(userAddress: string): Promise<Position[]> {
    return PositionRepository.getUserOpenPositions(this.db, userAddress);
  }

  async getUserPositions(
    userAddress: string,
    options?: { status?: "OPEN" | "CLOSED" | "LIQUIDATED"; limit?: number; offset?: number },
  ): Promise<Position[]> {
    return PositionRepository.getUserPositions(this.db, userAddress, options);
  }

  async hasOpenPosition(userAddress: string, market: string): Promise<boolean> {
    const position = await PositionRepository.getOpenPositionByUserAndMarket(
      this.db,
      userAddress,
      market,
    );
    return position !== null;
  }
}
