import { type Static, Type } from "@sinclair/typebox";
import { StateMachine } from "./state-machine";

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

// Position schemas (derived from StateMachine enums)
export const PositionSideSchema = Type.Union(Object.values(StateMachine.PositionSide).map((v) => Type.Literal(v)));
export const PositionStatusSchema = Type.Union(Object.values(StateMachine.PositionStatus).map((v) => Type.Literal(v)));

export const CreatePositionDataSchema = Type.Object({
  market_id: Type.String({ minLength: 1, description: "Market ID (e.g., ADA-MIN)" }),
  side: Type.Literal("LONG", { description: "Position side (only LONG supported)" }),
  amount_in: Type.String({ pattern: "^[0-9]+$", description: "Collateral amount in lovelace" }),
});

export type CreatePositionDataType = Static<typeof CreatePositionDataSchema>;

export const AuthenCreatePositionBodyTypeSchema = AuthenCommonSchema(CreatePositionDataSchema);

export type AuthenCreatePositionBodyType = AuthenCommonType<CreatePositionDataType>;

export const PositionResponseSchema = Type.Object({
  id: Type.String({ description: "Position ID" }),
  market_id: Type.String(),
  user_address: Type.String(),
  side: PositionSideSchema,
  status: PositionStatusSchema,
  amount_in: Type.String(),
  amount_borrow: Type.String(),
  created_at: Type.String({ format: "date-time" }),
  closed_at: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});

export type PositionResponseType = Static<typeof PositionResponseSchema>;

export const CreatePositionResponseSchema = Type.Object({
  success: Type.Boolean(),
  data: Type.Optional(PositionResponseSchema),
  error: Type.Optional(Type.String()),
});

export type CreatePositionResponseType = Static<typeof CreatePositionResponseSchema>;

// Get position schemas
export const GetPositionQuerySchema = Type.Object({
  user_address: Type.String({ minLength: 1, description: "User's Cardano address (bech32)" }),
});

export type GetPositionQueryType = Static<typeof GetPositionQuerySchema>;

export const GetPositionResponseSchema = Type.Object({
  success: Type.Boolean(),
  data: Type.Union([PositionResponseSchema, Type.Null()]),
});

export type GetPositionResponseType = Static<typeof GetPositionResponseSchema>;

// Build TX schemas
export const BuildTxDataSchema = Type.Object({
  market_id: Type.String({ description: "Market identifier (e.g., ADA-MIN)" }),
  utxos: Type.Array(Type.String({ minLength: 1 }), { description: "User UTXOs (CBOR hex)" }),
});

export type BuildTxDataType = Static<typeof BuildTxDataSchema>;

export const AuthenBuildTxBodyTypeSchema = AuthenCommonSchema(BuildTxDataSchema);

export type AuthenBuildTxBodyType = AuthenCommonType<BuildTxDataType>;

export const BuildTxResponseSchema = Type.Object({
  success: Type.Boolean(),
  data: Type.Optional(
    Type.Object({
      tx_raw: Type.Optional(Type.String({ description: "Unsigned transaction CBOR hex" })),
      order_type: Type.String({ description: "Order type being processed" }),
      waiting: Type.Optional(Type.Boolean({ description: "True if transaction is waiting for confirmation" })),
      message: Type.Optional(Type.String({ description: "Status message when waiting" })),
    }),
  ),
  error: Type.Optional(Type.String()),
});

export type BuildTxResponseType = Static<typeof BuildTxResponseSchema>;

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
