import { Type, type Static } from "@sinclair/typebox";

export const SignedDataSchema = Type.Object({
  key: Type.String({ minLength: 1, description: "COSEKey hex" }),
  signature: Type.String({ minLength: 1, description: "COSESign1 hex" }),
});

export type SignedDataType = Static<typeof SignedDataSchema>;

// Common authenticated request schema
export const AuthenCommonSchema = <T extends ReturnType<typeof Type.Object>>(dataSchema: T) =>
  Type.Object({
    data: dataSchema,
    user_address: Type.String({ minLength: 1, description: "User's Cardano address (bech32)" }),
    witness: SignedDataSchema,
  });

export type AuthenCommonType<T> = {
  data: T;
  user_address: string;
  witness: SignedDataType;
};

// Position schemas
export const PositionSideSchema = Type.Union([Type.Literal("LONG"), Type.Literal("SHORT")]);

export const CreatePositionDataSchema = Type.Object({
  market: Type.String({ minLength: 1, description: "Trading pair (e.g., ADA-MIN)" }),
  side: PositionSideSchema,
  amount: Type.String({ pattern: "^[0-9]+$", description: "Collateral amount in lovelace" }),
});

export type CreatePositionDataType = Static<typeof CreatePositionDataSchema>;

export const AuthenCreatePositionBodyTypeSchema = AuthenCommonSchema(CreatePositionDataSchema);

export type AuthenCreatePositionBodyType = AuthenCommonType<CreatePositionDataType>;

export const PositionResponseSchema = Type.Object({
  id: Type.String({ description: "Position ID" }),
  user_address: Type.String(),
  market: Type.String(),
  side: PositionSideSchema,
  status: Type.Union([Type.Literal("OPEN"), Type.Literal("CLOSED"), Type.Literal("LIQUIDATED")]),
  leverage: Type.String(),
  collateral_asset: Type.String(),
  collateral_amount: Type.String(),
  entry_price: Type.String(),
  position_size: Type.String(),
  borrowed_amount: Type.String(),
  liquidation_price: Type.String(),
  take_profit_price: Type.Union([Type.String(), Type.Null()]),
  stop_loss_price: Type.Union([Type.String(), Type.Null()]),
  realized_pnl: Type.String(),
  unrealized_pnl: Type.String(),
  funding_paid: Type.String(),
  created_at: Type.String({ format: "date-time" }),
  updated_at: Type.String({ format: "date-time" }),
  closed_at: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});

export type PositionResponseType = Static<typeof PositionResponseSchema>;

export const CreatePositionResponseSchema = Type.Object({
  success: Type.Boolean(),
  data: Type.Optional(PositionResponseSchema),
  error: Type.Optional(Type.String()),
});

export type CreatePositionResponseType = Static<typeof CreatePositionResponseSchema>;

// Error response
export const ErrorResponseSchema = Type.Object({
  success: Type.Literal(false),
  error: Type.String(),
});

export type ErrorResponseType = Static<typeof ErrorResponseSchema>;

// Market config schemas
export const MarketConfigResponseSchema = Type.Object({
  market_id: Type.String({ description: "Market identifier (e.g., ADA-MIN)" }),
  asset_a: Type.String({ description: "First asset" }),
  asset_b: Type.String({ description: "Second asset" }),
  amm_lp_asset: Type.String({ description: "Minswap LP token" }),
  asset_a_q_token_ticker: Type.String({ description: "Liqwid qToken ticker for asset A" }),
  asset_a_q_token_raw: Type.String({ description: "Liqwid qToken raw asset for asset A" }),
  asset_b_q_token_ticker: Type.String({ description: "Liqwid qToken ticker for asset B" }),
  asset_b_q_token_raw: Type.String({ description: "Liqwid qToken raw asset for asset B" }),
  collateral_market_id: Type.String({ description: "Liqwid market ID" }),
  leverage: Type.Number({ description: "Leverage multiplier" }),
  min_collateral: Type.String({ description: "Minimum collateral in lovelace" }),
});

export type MarketConfigResponseType = Static<typeof MarketConfigResponseSchema>;

export const MetadataResponseSchema = Type.Object({
  success: Type.Boolean(),
  data: Type.Object({
    markets: Type.Array(MarketConfigResponseSchema),
  }),
});

export type MetadataResponseType = Static<typeof MetadataResponseSchema>;
