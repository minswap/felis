## Build

- `cargo install wasm-pack`
- `wasm-pack build -s minswap -t web --release -d web && wasm-pack build -s minswap -t nodejs --release -d node && node build.js`
