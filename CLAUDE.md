# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Minswap Felis is a monorepo implementing Cardano DEX infrastructure with leveraged long/short trading positions integrated with Liqwid lending protocol. Built with TypeScript, Turborepo, and pnpm workspaces.

## Commands

```bash
# Build & Development
pnpm build                    # Build all packages (respects turbo dependency graph)
pnpm dev                      # Watch mode across all packages
pnpm check-types              # Run tsc --noEmit on all packages

# Testing
pnpm test                     # Run all tests via vitest
pnpm test:watch               # Watch mode for tests
pnpm --filter=@repo/ledger-core test   # Run tests for single package

# Linting & Formatting
pnpm format-and-lint          # Check with biome (no changes)
pnpm format-and-lint:fix      # Auto-fix with biome
pnpm exec turbo run check-circular-imports  # Detect circular imports

# Web App
pnpm --filter=web dev         # Next.js dev server (port 3001)
```

## Architecture

### Package Dependency Graph
```
ledger-utils (foundation: Result type, crypto, hex, bech32)
    ↓
ledger-core (Address, Tx, UTXO, Scripts, Protocol)
    ↓
    ├→ cip (BIP32/39, CIP-25, CIP-68)
    │   ↓
    └───┴→ tx-builder (high-level transaction composition)
              ↓
          minswap-build-tx (DEX transaction builder)
              ↓
          minswap-lending-market (Liqwid SDK, Nitro Wallet)
              ↓
          web (Next.js app)

minswap-dex-v2 (DEX V2 protocol types) → depends on ledger-core, ledger-utils
```

### Key Packages
- **ledger-utils**: `Result<T, E>` error handling, crypto utilities, `CborHex<T>` branded types
- **ledger-core**: Cardano primitives (Address, Tx, UTXO), `NetworkEnvironment` discrimination
- **tx-builder**: Transaction composition with UTXO selection
- **minswap-dex-v2**: DEX V2 protocol types and order handling
- **minswap-lending-market**: Liqwid provider SDK, Nitro Wallet (password-less signing)

## Code Patterns

### Error Handling
Use `Result<T, E>` from ledger-utils:
```typescript
Result.ok(value), Result.err(error), Result.isOk()
```
Use `getErrorMessage(error)` for safe error stringification (handles BigInt).

### Class Design
- Protected constructors with static factory methods
- Immutable `readonly` properties
- Bidirectional serialization: `toHex()`, `fromHex()`, `toPlutusJson()`, `fromPlutusJson()`

### Type Conventions
- `bigint` for all amounts, slots, values (never numbers)
- `CborHex<T>` branded types for CBOR serialization
- `NetworkEnvironment` required for address/protocol operations (mainnet vs testnet)
- Type-only imports: `import type { Type } from "..."`
- Workspace imports: Always use `@repo/*` scope

### WASM Initialization
```typescript
import { RustModule } from "@repo/ledger-utils";
beforeAll(async () => {
  await RustModule.load();
});
```

## Key Dependencies

- **@emurgo/cardano-serialization-lib (CSL)**: Cardano primitives via Rust/WASM
- **@stricahq/cbors**: CBOR encoding (Cardano serialization format)
- **json-bigint**: Preserve BigInt precision in JSON (don't use native JSON for amounts)
- **remeda**: Functional utility library (like lodash/fp)
- **@minswap/tiny-invariant**: Development-only assertions
- **dpdm**: Circular import detection (run via `check-circular-imports` script)

## Testing

- Framework: Vitest with `vitest.config.mts` per package
- Test location: `{package}/test/**/*.{test,spec}.ts`
- Property-based testing: `fast-check` available
- Environment: Node (Vitest aliases browser WASM to Node variants)

## Code Style (Biome)

- Line width: 120
- Quotes: Double
- Semicolons: Always
- Trailing commas: All
- Arrow parens: Always `(x) => x`

## Tech Stack

- TypeScript 5.8, Node.js >= 22
- Turborepo + pnpm 9.0.0
- Vitest, Biome
- Next.js, React 19, Jotai, Ant Design
