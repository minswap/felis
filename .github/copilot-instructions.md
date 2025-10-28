# Copilot Instructions for Minswap Felis

This is a **monorepo** for Cardano DEX infrastructure built with TypeScript, organized with **Turborepo** and **pnpm workspaces**.

## Architecture Overview

### Layer 1: Utilities (`@repo/ledger-utils`)
Foundation layer providing low-level utilities:
- **Result type** (`result.ts`): Rust-like `Result<T, E>` for error handling (use `Result.ok()`, `Result.err()`, `Result.isOk()`)
- **Cryptographic utilities** (`hash.ts`, `hex-utils.ts`): Hex encoding/decoding, hash operations
- **Type definitions** (`types.ts`, `maybe.ts`): Common types including `CborHex<T>` branded types for CBOR serialization
- **Bech32 encoding** (`bech32.ts`): Address encoding/decoding
- **Rust interop** (`rust-utils.ts`): WasmModule loading and lifecycle management

### Layer 2: Ledger Core (`@repo/ledger-core`)
**Depends on**: `@repo/ledger-utils`

Core Cardano ledger primitives:
- **Address** (`address.ts`): Cardano address parsing/serialization (bech32, hex, Plutus formats)
- **Transactions** (`tx.ts`): Transaction types (TxBody, Witness, TxCollateral, Certificates, Withdrawals)
- **UTXOs** (`utxo.ts`): Unspent transaction outputs and associated value
- **Scripts** (`plutus.ts`, `native-script.ts`, `redeemer.ts`): Smart contract script handling
- **Cryptography** (`crypto.ts`): Key hashing, public key operations
- **Protocol** (`protocol-parameters.ts`, `slot.ts`, `network-id.ts`): Network configuration and slot time

**Key patterns**:
- Extensive use of `Result<T, E>` for operations that may fail
- Round-trip conversions: bech32 ↔ hex ↔ PlutusJson for most types (see `address.test.ts` for pattern)
- `NetworkEnvironment` discriminates mainnet/testnet contexts

### Layer 3: Transaction Builder (`@repo/tx-builder`)
**Depends on**: `@repo/ledger-core`, `@repo/ledger-utils`, `@repo/cip`

High-level transaction composition (not yet exposed in detail; examine `src/` for patterns).

### Supporting Packages
- **`@repo/cip`**: CIP (Cardano Improvement Proposal) implementations (BIP32/39, CIP-25, CIP-68)
- **`@repo/eslint-config`**: Shared linting rules
- **`@repo/typescript-config`**: Shared TypeScript configurations
- **`apps/hello-world`**: Vite + React demo app showcasing wallet integration

## Build & Development Workflow

### Primary Commands
- **`pnpm build`** - Build all packages (respects Turbo dependency graph in `turbo.json`)
- **`pnpm dev`** - Run dev watchers in all packages (persistent, uncached)
- **`pnpm test`** - Run all tests via vitest
- **`pnpm test:watch`** - Watch mode for tests
- **`pnpm lint`** - Run biome linter (scoped to `packages/ledger-{core,utils}` in `biome.json`)
- **`pnpm format-and-lint:fix`** - Auto-fix formatting and linting issues

### Dependency Graph
From `turbo.json`:
- `@repo/ledger-core` must build **after** `@repo/ledger-utils`
- `@repo/tx-builder` must build **after** `@repo/ledger-core`
- Most other packages can build in parallel

## Testing Patterns

### Vitest Setup
Each package with `vitest.config.mts`:
- **Environment**: `node` (see ledger-core: forces `window` to `undefined`)
- **Test location**: `test/**/*.{test,spec}.ts`
- **Key aliases** (from ledger-core config):
  - `@repo/uplc-web` → `@repo/uplc-node` (use Node.js WASM, not browser)
  - CSL browser variants → Node.js variants for testing

### Test Patterns
From `ledger-core/test/address.test.ts`:
```typescript
import { beforeAll, describe, expect, it } from "vitest";
import { Address } from "../src";

beforeAll(async () => {
  await RustModule.load(); // Initialize WASM module once
});

describe("Address", () => {
  it("can do round-trip conversion", () => {
    const addr = Address.fromBech32("addr_test1...");
    expect(Address.fromPlutusJson(addr.toPlutusJson(), networkEnv).toString())
      .toEqual("addr_test1...");
  });
});
```

Use `fast-check` (available in ledger-core) for property-based testing.

## Code Organization Conventions

### Import Patterns
- **Type-only imports**: `import type { SomeType } from "..."`
- **Branded types**: Use `CborHex<T>` for CBOR-serialized bytes, `CSLAddress` for Cardano Serialization Library types
- **Workspace imports**: Always use `@repo/*` scope, never relative paths across packages

### Error Handling
1. **For failable operations**: Return `Result<T, E>` (see `ledger-utils/result.ts`)
   ```typescript
   static fromBech32(s: string): Address {
     try {
       return new Address(s);
     } catch (err) {
       throw new Error(`not valid: ${s}`);
     }
   }
   ```
2. **For utilities**: Use `getErrorMessage(error)` from `ledger-utils/errors.ts` to safely stringify errors (handles BigInt)
3. **Invariants**: Use `@minswap/tiny-invariant` for development assertions

### Class Patterns
- **Protected constructors**: Use `protected constructor()` with static factory methods (see `Address`, `Utxo`)
- **Immutability**: Properties are `readonly` unless explicitly mutable
- **Serialization**: Implement bidirectional conversion methods: `toHex()`, `fromHex()`, `toPlutusJson()`, `fromPlutusJson()`

## Key Dependencies & Their Roles

- **`@stricahq/cbors`**: CBOR encoding (serialization format for Cardano)
- **`json-bigint`**: Preserve BigInt precision in JSON (don't use native JSON for amounts)
- **`bignumber.js`**: Alternative big number library (used alongside BigInt)
- **`remeda`**: Functional utility library (like lodash/fp)
- **`@minswap/tiny-invariant`**: Development-only assertions
- **`@cardano-ogmios/schema`**: Type definitions for Ogmios (Cardano node interface)
- **`dpdm`**: Circular import detection (run via `check-circular-imports` script)

## Code Style & Tooling

### Biome (Formatter + Linter)
- **Line width**: 120
- **Quotes**: Double
- **Trailing commas**: All
- **Semicolons**: Always
- **Arrow function parens**: Always (e.g., `(x) => x`)
- **Scoped to**: `packages/ledger-{core,utils}` (see `biome.json`)
- **Run**: `pnpm format-and-lint:fix` for auto-fix

### Circular Import Checking
- **Why**: Prevents hard-to-debug runtime issues in monorepo
- **Command**: `pnpm exec turbo run check-circular-imports`
- **Tool**: dpdm configured per-package

## Common Tasks

### Adding a New Function to `ledger-core`
1. Create or edit file in `packages/ledger-core/src/`
2. Export from `packages/ledger-core/src/index.ts`
3. Add tests to `packages/ledger-core/test/`
4. Run `pnpm build` and `pnpm test --filter=@repo/ledger-core`

### Debugging Type Errors
- Use `pnpm check-types` (runs `tsc` in all packages)
- Watch mode: Use `pnpm dev` in desired package

### Wallet Integration (from `apps/hello-world/src/lib/wallet-utils.ts`)
- CIP-30 window extension API: `window.cardano[walletName]`
- Common methods: `getBalance()`, `getUsedAddresses()`, `signTx()`, `submitTx()`
- Always load RustModule before address operations
- Use `Address.ensureBech32()` to normalize address format

## Project-Specific Notes

- **Felis**: This repo contains transaction building and protocol integration for Minswap DEX on Cardano
- **Rust WASM**: Many primitives (Address, CBOR) use Rust/WASM via CSL (Cardano Serialization Library)
- **BigInt everywhere**: Amounts, slots, values use `bigint` native type (not numbers)
- **Network discrimination**: All address/protocol operations require `NetworkEnvironment` (mainnet vs testnet has different HRPs and parameters)
