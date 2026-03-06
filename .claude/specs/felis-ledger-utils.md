# @minswap/felis-ledger-utils

Foundation utility library. All other packages depend on this.

**Location:** `packages/ledger-utils`

## What's here
- `Result<T, E>` / `Maybe<T>` — error handling and optionals
- `Duration` — time arithmetic
- `blake2b256`, `blake2b224`, `sha3` — crypto hashes
- `encodeBech32` / `decodeBech32`
- `RustModule` — WASM loader (must call `await RustModule.load()` before any WASM ops)
- `CborHex<T>` — branded type for CBOR hex strings
- `getErrorMessage(error)` — safe stringify that handles BigInt
- `safeFreeRustObjects()` — prevents double-free on WASM objects
