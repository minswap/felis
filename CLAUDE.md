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

---

# Long-Short Backend Skills & Patterns

## Database Migrations

### Migration File Pattern
```typescript
// apps/long-short-backend/.config/migrations/{timestamp}_{description}.ts
import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "table_name" ADD COLUMN "column_name" TYPE`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "table_name" DROP COLUMN "column_name"`.execute(db);
}
```

### Migration Best Practices
- Use sequential timestamps for ordering (e.g., `1770117151276_order_waiting_column.ts`)
- Always provide both `up` and `down` migrations
- Use `Generated<T>` in database types for columns with defaults
- Update `src/database/db.d.ts` after migrations
- Test migrations in development before applying to production

### Running Migrations
```bash
# Apply migrations
pnpm --filter=long-short-backend run migrate:latest

# Rollback last migration
pnpm --filter=long-short-backend run migrate:down
```

## Order State Machine Pattern

### Order Lifecycle States
```typescript
// Order progression for LONG positions:
// 1. LONG_BUY      → Buy asset B with asset A (ADA)
// 2. LONG_SUPPLY   → Supply asset B to lending protocol, get collateral
// 3. LONG_BORROW   → Borrow asset A against collateral
// 4. LONG_BUY_MORE → Buy more asset B with borrowed asset A
```

### Transaction Lifecycle Tracking
```typescript
// Order fields track transaction progress:
// 1. built_tx_id      - Transaction built and submitted (not yet on chain)
// 2. created_tx_id    - Transaction confirmed on chain
// 3. waiting          - true when confirmed, false when output is spent
```

### State Machine Handler Pattern
```typescript
// apps/long-short-backend/src/api/state-machine.ts
export namespace StateMachine {
  // Handler for building transactions
  export const handleOrderType = async (options: HandleOptions) => {
    // Build transaction using DEXOrderTransaction
    // Return: { txRaw, txId, outputsHash, validTo }
  };

  // Waiting function for checking if output is spent
  export const waitingOrderType = async (options: WaitingOptions): Promise<WaitingResult> => {
    // Check if order output has been spent on chain
    // If spent, return next order details
    // If not spent, return { isSpent: false }
  };
}
```

## Repository Pattern

### Repository Organization
```typescript
// apps/long-short-backend/src/repository/{entity}-repository.ts
export namespace EntityRepository {
  // Create operations
  export async function createEntity(db: Kysely<DB> | Transaction<DB>, params: CreateParams): Promise<Entity>

  // Read operations
  export async function getEntityById(db: Kysely<DB>, id: bigint): Promise<Entity | null>
  export async function getEntitiesByFilter(db: Kysely<DB>, filter: Filter): Promise<Entity[]>

  // Update operations
  export async function updateEntity(db: Kysely<DB>, id: bigint, updates: Partial<Entity>): Promise<void>

  // Helper: Map DB row to domain type
  function mapEntityRow(row: any): Entity {
    return {
      id: BigInt(row.id),
      // Convert snake_case to camelCase
      // Convert timestamps to Date objects
      // Parse bigint fields
    };
  }
}
```

### Repository Best Practices
- Use `Kysely<DB> | Transaction<DB>` for functions that need transaction support
- Always convert `id` fields to `bigint` with `BigInt(row.id)`
- Map `snake_case` database columns to `camelCase` domain types
- Return `null` for not-found queries (don't throw)
- Use `.executeTakeFirst()` for optional single results
- Use `.executeTakeFirstOrThrow()` when result must exist

## Service Layer Pattern

### Service Organization
```typescript
// apps/long-short-backend/src/services/{entity}-service.ts
export class EntityService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly networkEnv: NetworkEnvironment,
    private readonly cardanoscanProvider: CardanoscanProvider,
  ) {}

  // Business logic methods
  async createEntity(input: CreateInput): Promise<Result>
  async processEntity(input: ProcessInput): Promise<Result>
}

// Result types use discriminated unions
export type Result =
  | { success: true; data: Data }
  | { success: false; error: string };
```

### Service Best Practices
- Inject dependencies through constructor
- Use discriminated union return types for error handling
- Validate input at service layer (market support, minimums, etc.)
- Use database transactions for multi-step operations
- Log important state transitions with structured logging
- Separate concerns: waiting logic vs transaction building

## Transaction Building Pattern

### BuildTx Flow (apps/long-short-backend/src/services/position-service.ts)
```typescript
async buildTx(input: BuildTxInput): Promise<BuildTxResult> {
  // STEP 1: Check for waiting orders (created_tx_id not null, waiting = true)
  const waitingOrder = await OrderRepository.getWaitingOrder(db, positionId);
  if (waitingOrder) {
    // Call waiting function to check if output is spent
    // If spent: update next order, set waiting = false
    // If not spent: return waiting message
  }

  // STEP 2: Find next unhandled order (asset_in not null, created_tx_id null)
  const order = await OrderRepository.getNextUnhandledOrder(db, positionId);
  if (!order) return { error: "No unhandled order" };

  // STEP 3: Check if transaction already built
  if (order.builtTxId) {
    // If created_tx_id exists: already confirmed, return waiting
    // Else: search on chain, update created_tx_id if found
    // Check expiry, return waiting or fall through to rebuild
  }

  // STEP 4: Build new transaction
  const txResult = await StateMachine.handleOrderType(...);
  await OrderRepository.updateOrderBuiltTx(db, order.id, txResult);
  return { success: true, txRaw: txResult.txRaw };
}
```

### Transaction Building Best Practices
- Separate waiting logic from transaction building
- Check waiting orders BEFORE finding unhandled orders
- Always update `built_tx_id` immediately after building
- Set `waiting = true` when transaction confirms on chain (via default column value)
- Set `waiting = false` only after output is spent
- Use transaction expiry (validTo) to determine when to rebuild

## Cardanoscan Provider Pattern

### Provider Usage
```typescript
// apps/long-short-backend/src/provider/cardanoscan.ts
const provider = new CardanoscanProvider(baseUrl, apiKey);

// Find transaction by hash
const tx = await provider.findTransactionByHash(address, txHash, pageSize, maxPage);

// Find transaction that spent a UTXO
const spendingTx = await provider.findTransactionHasSpent(address, txHash, outputIndex, pageSize, maxPage);
```

### Cardanoscan API Patterns
- Always use `address.toHex()` for API calls (not bech32)
- API header is `"apiKey"` (not `"api-key"` or `"Authorization"`)
- Paginate with `pageNo` (1-indexed) and `limit` (max 50)
- Use `order: "desc"` to search most recent transactions first
- Token format: use `asset.toBlockFrostString()` for matching
- Input format: `{ txId: string; index: number }` for UTXO references
- Output format: `{ address: string; value: string; tokens?: Array<{ value: string; assetId: string }> }`

## API Route Pattern (Fastify + TypeBox)

### Route Registration
```typescript
// apps/long-short-backend/src/api/routes/{entity}.ts
export function registerEntityRoutes(fastify: FastifyInstance, service: EntityService): void {
  fastify.post<{
    Body: BodyType;
    Reply: ReplyType;
  }>(
    API_ENDPOINTS.ENTITY_ACTION,
    {
      schema: {
        body: BodySchema,
        response: {
          200: SuccessResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      // Extract and validate input
      const { data, user_address, witness } = request.body;

      // Authenticate (CIP-8 signature verification)
      const authResult = ApiHelper.authenticate(data, user_address, witness);
      if (!authResult.success) {
        return reply.status(401).send({ success: false, error: authResult.error });
      }

      // Call service
      const result = await service.processEntity(input);
      if (!result.success) {
        return reply.status(400).send({ success: false, error: result.error });
      }

      return reply.status(200).send({ success: true, data: result.data });
    },
  );
}
```

### API Best Practices
- Define schemas with TypeBox for validation
- Use snake_case for API request/response fields (matches frontend)
- Use camelCase internally in TypeScript code
- Authenticate requests with CIP-8 signature verification
- Return consistent response format: `{ success: boolean; data?: T; error?: string }`
- Use appropriate HTTP status codes: 200 (success), 400 (bad request), 401 (unauthorized)
- Map domain types to response types with helper functions

## Authentication Pattern (CIP-8)

### Signature Verification
```typescript
// apps/long-short-backend/src/api/helper.ts
export namespace ApiHelper {
  export function authenticate(
    data: unknown,
    userAddress: string,
    witness: { signature: string; key: string },
  ): AuthResult {
    // 1. Serialize data to CBOR hex
    const dataHex = XJSON.stringify(data);

    // 2. Verify signature using CIP-8
    const isValid = verifySignature(dataHex, userAddress, witness);

    return isValid
      ? { success: true }
      : { success: false, error: "Invalid signature" };
  }
}
```

### Authentication Request Format
```typescript
{
  "data": { /* actual request payload */ },
  "user_address": "addr1...",
  "witness": {
    "signature": "84582aa201...",  // CBOR-encoded CIP-8 signature
    "key": "a401..."                 // CBOR-encoded public key
  }
}
```

## Logging Pattern

### Structured Logging
```typescript
// apps/long-short-backend/src/utils/logger.ts
import { logger } from "../utils";

// Info logging
logger.info("Description", {
  orderId: order.id,
  txHash: tx.hash,
  // Include relevant context
});

// Error logging
logger.error("Error description", error);
logger.error("Error description", { context: value, error });

// Warning logging
logger.warn("Warning message", { context });
```

### Logging Best Practices
- Use structured logging with context objects
- Log all important state transitions
- Log transaction IDs for traceability
- Log errors with full error objects
- Include order/position IDs in logs
- Use appropriate log levels: info (normal flow), warn (recoverable issues), error (failures)

## Testing Patterns

### Repository Tests
```typescript
// apps/long-short-backend/test/{entity}-repository.test.ts
import { describe, it, expect, beforeAll, afterEach } from "vitest";

describe("EntityRepository", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    // Setup test database
    db = await setupTestDb();
  });

  afterEach(async () => {
    // Clean up test data
    await db.deleteFrom("entity").execute();
  });

  it("should create entity", async () => {
    const entity = await EntityRepository.createEntity(db, params);
    expect(entity.id).toBeDefined();
  });
});
```

### Service Tests
```typescript
// apps/long-short-backend/test/{entity}-service.test.ts
describe("EntityService", () => {
  let service: EntityService;
  let mockProvider: CardanoscanProvider;

  beforeAll(async () => {
    await RustModule.load();
    mockProvider = createMockProvider();
    service = new EntityService(db, networkEnv, mockProvider);
  });

  it("should process entity successfully", async () => {
    const result = await service.processEntity(input);
    expect(result.success).toBe(true);
  });
});
```

## Environment Variables

### Required Variables
```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"

# Network
NETWORK="mainnet"  # or "testnet"

# API
API_PORT=9999
API_HOST="0.0.0.0"

# Cardanoscan
CARDANOSCAN_API_KEY="your-api-key"
```

### Loading Environment
```typescript
// Environment variables are loaded automatically
// Validate required variables at startup
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
```

## Common Patterns Summary

### DO
- Use `bigint` for all Cardano amounts and IDs
- Convert database IDs with `BigInt(row.id)`
- Use discriminated unions for result types
- Separate waiting logic from transaction building
- Log all important state transitions
- Validate inputs at service layer
- Use transactions for multi-step database operations
- Map database snake_case to TypeScript camelCase
- Use `address.toHex()` for Cardanoscan API
- Authenticate requests with CIP-8 signatures

### DON'T
- Don't use `number` for amounts or IDs
- Don't throw errors from repository layer (return `null`)
- Don't mix waiting and building logic in same function
- Don't skip input validation
- Don't use native `JSON.stringify` for BigInt values
- Don't use bech32 addresses for Cardanoscan API
- Don't skip authentication on protected endpoints
- Don't forget to update database types after migrations
