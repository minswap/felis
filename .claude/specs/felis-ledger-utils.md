# @minswap/felis-ledger-utils

Foundation utility library. All other packages depend on this.

**Location:** `packages/ledger-utils`

## Key Exports

### Result<T, E> — Error Handling
```typescript
Result.ok(value)           // Create success
Result.err(error)          // Create error
Result.isOk(r)             // Type guard
Result.isError(r)          // Type guard
Result.unwrap(r)           // Extract or throw
Result.flatten(r)          // [T, null] | [null, E]
```

### Maybe<T> — Optional Values
```typescript
Maybe.isNothing(a)         // null | undefined check
Maybe.isJust(a)            // Value exists
Maybe.map(a, f)            // Apply if exists
Maybe.unwrap(a, errMsg)    // Extract or throw
```

### Duration — Time Handling
```typescript
Duration.newSeconds(x) / .newMinutes(x) / .newHours(x) / .newDays(x)
Duration.before(date, d) / .after(date, d) / .between(d1, d2)
```

### Crypto
```typescript
blake2b256(buffer): string   // Blake2b-256 hash (hex)
blake2b224(buffer): string   // Blake2b-224 hash (hex)
sha3(hex): string            // SHA3-256 hash
```

### Bech32
```typescript
encodeBech32(hrp, data): string
decodeBech32(s): { hrp, data }
```

### Hex Validation
```typescript
isValidHex(s): boolean
isValidBase64(s): boolean
```

### WASM Module Loader
```typescript
await RustModule.load()      // Must call before any WASM ops
RustModule.get               // Minswap CSL
RustModule.getE              // Emurgo CSL (v13)
RustModule.getU              // UPLC module
```

### Rust Object Management
```typescript
safeFreeRustObjects(...objs)  // Safe cleanup (handles double-free)
unwrapRustVec<T>(vec)         // RustVec → T[]
unwrapRustMap<K,V>(map)       // RustMap → [K,V][]
```

### Branded Type
```typescript
type CborHex<_> = string     // Phantom type for CBOR hex strings
```

### Error Utilities
```typescript
getErrorMessage(error): string  // Safe stringify (handles BigInt)
parseIntSafe(str): number       // Throws on NaN
```
