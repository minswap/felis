# CLAUDE.md

The role of this file is to describe common mistake and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the CLAUDE.md file to help prevent future agents from having the same issue.

> **Principle:** If the info is in the codebase, it probably doesn't need to be in this file. Keep this lean.

## Project Overview

Minswap Felis - Cardano DEX monorepo with leveraged long/short trading via Liqwid lending. TypeScript, Turborepo, pnpm workspaces.

## Commands

```bash
pnpm build                    # Build all packages
pnpm check-types              # Type-check all packages
pnpm test                     # Run all tests (vitest)
pnpm --filter=@repo/ledger-core test   # Single package tests
pnpm format-and-lint:fix      # Auto-fix with biome
pnpm --filter=web dev         # Next.js dev server (port 3001)

# Long-short backend
pnpm --filter=long-short-backend run migrate:latest   # Apply DB migrations
pnpm --filter=long-short-backend run migrate:down      # Rollback last migration
```

## Package Dependency Graph

```
ledger-utils → ledger-core → cip → tx-builder → minswap-build-tx → minswap-lending-market → web
minswap-dex-v2 → ledger-core, ledger-utils
```

## Conventions

- `bigint` for all Cardano amounts, slots, IDs (never `number`)
- `Result<T, E>` from ledger-utils for error handling
- `import type` for type-only imports
- `@repo/*` scope for workspace imports
- `await RustModule.load()` required before crypto/WASM operations in tests
- `json-bigint` for JSON with BigInt values (never native `JSON.stringify`)

## Gotchas

- Cardanoscan API: use `address.toHex()` (not bech32), header is `"apiKey"`
- DB types: update `src/database/db.d.ts` after migrations, use `Generated<T>` for defaults
- DB IDs: always `BigInt(row.id)` when mapping rows
- API fields: snake_case externally, camelCase internally
