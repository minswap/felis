/**
 * @minswap/felis - All-in-one package for Minswap Felis SDK
 *
 * This package re-exports all Felis packages for convenient single-import usage.
 * For production, consider importing individual packages for better tree-shaking.
 *
 * @example
 * // Single import for discovery/exploration
 * import { LedgerCore, DexV2, TxBuilder } from "@minswap/felis";
 *
 * // Or use individual packages for tree-shaking
 * import { Address, Tx } from "@minswap/felis-ledger-core";
 */

// Core utilities and primitives
export * as LedgerUtils from "@minswap/felis-ledger-utils";
export * as LedgerCore from "@minswap/felis-ledger-core";

// CIP implementations (BIP32/39, CIP-25, CIP-68)
export * as Cip from "@minswap/felis-cip";

// Transaction building
export * as TxBuilder from "@minswap/felis-tx-builder";
export * as Provider from "@minswap/felis-provider";

// Minswap DEX protocols
export * as DexV1 from "@minswap/felis-dex-v1";
export * as DexV2 from "@minswap/felis-dex-v2";
export * as BuildTx from "@minswap/felis-build-tx";
export * as Stableswap from "@minswap/felis-stableswap";

// Lending integration
export * as LendingMarket from "@minswap/felis-lending-market";

// Third-party DEX integrations
export * as Splash from "@minswap/felis-splash";
export * as SundaeswapV1 from "@minswap/felis-sundaeswap-v1";
export * as SundaeswapV3 from "@minswap/felis-sundaeswap-v3";
export * as WingridersV1 from "@minswap/felis-wingriders-v1";
export * as WingridersV2 from "@minswap/felis-wingriders-v2";

// Syncer for blockchain data
export * as Syncer from "@minswap/felis-syncer";
